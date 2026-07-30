import {
  PROTOCOL_VERSION,
  type BrowserCommand,
  type BrowserControlRequest,
  type BrowserControlResponse,
} from '@ai-page-chat/browser-control-protocol';
import { singleDriverFactory, type BrowserDriver, type SessionDriverFactory } from '../driver/types';
import { assertAdvancedCapability, assertTargetCapabilities, CapabilityError, type TargetCapabilities } from './capabilities';
import { isFailedDriverResult, LegacyCommandHandler } from './legacy-command-handler';
import { type BrowserSessionOrigin, SessionStore, SessionStoreError } from './session-store';
import { TabLeaseError, TabLeaseStore } from './tab-leases';
import { TabQueue } from './tab-queue';
import { executeActionBatch } from './action-batch';

export interface BrowserConnectionContext {
  id: string;
  origin: BrowserSessionOrigin | 'extension-ui';
  advancedEnabled: boolean;
}

export interface BrowserControlCoordinatorOptions extends TargetCapabilities {
  /** Legacy single driver. New CDP control supplies `drivers` instead. */
  driver?: BrowserDriver;
  drivers?: SessionDriverFactory;
  sessions: SessionStore;
  leases: TabLeaseStore;
  queue: TabQueue;
  externalControlStatus?: () => { enabled: boolean; state: string; error?: string };
  createTurnId?: () => string;
}

/**
 * The sole browser-control authority. Every transport enters here so leases,
 * policy, and driver selection cannot diverge between embedded and MCP paths.
 */
export class BrowserControlCoordinator {
  private readonly drivers: SessionDriverFactory;
  private readonly turns = new Map<string, Set<string>>();
  private readonly targetTabs = new Map<string, number>();
  private readonly createTurnId: () => string;

  constructor(private readonly options: BrowserControlCoordinatorOptions) {
    if (!options.drivers && !options.driver) throw new Error('Browser control requires a driver factory.');
    this.drivers = options.drivers ?? singleDriverFactory(options.driver!);
    // Native Crypto methods throw "Illegal invocation" when detached from their receiver.
    this.createTurnId = options.createTurnId ?? (() => crypto.randomUUID());
  }

  async handle(connection: BrowserConnectionContext, request: BrowserControlRequest): Promise<BrowserControlResponse> {
    try {
      const result = await this.dispatch(connection, request);
      if (isFailedDriverResult(result)) return this.failure(request.requestId, 'UNSUPPORTED_OPERATION', result.error);
      return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, ok: true, result };
    } catch (error) {
      return this.fromError(request.requestId, error);
    }
  }

  async disconnect(connection: BrowserConnectionContext): Promise<void> {
    const orphaned = await this.options.sessions.orphanConnection(connection.id);
    for (const session of orphaned) {
      this.turns.delete(session.id);
      this.targetTabs.delete(session.id);
      this.options.leases.orphanSession(session.id);
      await this.drivers.releaseSession?.(session.id);
    }
  }

  private async dispatch(connection: BrowserConnectionContext, request: BrowserControlRequest): Promise<unknown> {
    const { command } = request;
    if (command.type === 'session.start') return this.startSession(connection, command);
    if (command.type === 'session.resume') return this.resumeSession(connection, request, command);
    if (command.type === 'session.end') return this.endSession(request, connection);
    if (command.type === 'turn.start') return this.startTurn(request, connection);
    if (command.type === 'turn.end' || command.type === 'turn.cancel') return this.endTurn(request, connection);
    if (command.type === 'browser.status') return {
      protocolVersion: PROTOCOL_VERSION,
      externalControl: this.options.externalControlStatus?.() ?? { enabled: false, state: 'disabled' },
    };
    const sessionId = this.requireSession(request);
    const turnId = this.requireTurn(request);
    await this.assertActiveSession(sessionId, connection.id);
    this.assertActiveTurn(sessionId, turnId);

    switch (command.type) {
      case 'tabs.list':
        return { tabs: await this.driverFor(sessionId, turnId).listTabs() };
      case 'tabs.claim':
        return this.claimTab(sessionId, command.tabId, connection);
      case 'tabs.release':
        this.options.leases.release(command.tabId, sessionId);
        await this.drivers.releaseTab?.(sessionId, command.tabId);
        if (this.targetTabs.get(sessionId) === command.tabId) this.targetTabs.delete(sessionId);
        return { tabId: command.tabId, released: true };
      case 'tabs.select':
        this.options.leases.assertOwned(command.tabId, sessionId);
        return this.selectTab(sessionId, turnId, command.tabId);
      case 'tabs.create':
        return this.createAndClaimTab(sessionId, connection, command.url);
      case 'tabs.close':
        return this.closeTab(sessionId, turnId, command.tabId);
      case 'cdp.execute':
        assertAdvancedCapability(connection.advancedEnabled, this.options);
        return this.unsupported('CDP command execution requires the CDP driver.');
      case 'cursor.move':
      case 'cursor.arrived':
        return { accepted: true };
      default:
        return this.runControlledCommand(sessionId, request, command, connection);
    }
  }

  private async startSession(connection: BrowserConnectionContext, command: Extract<BrowserCommand, { type: 'session.start' }>): Promise<unknown> {
    if (connection.origin === 'extension-ui' || connection.origin !== command.origin) {
      throw new CapabilityError('UNSUPPORTED_OPERATION', 'Connection origin cannot create this browser session.');
    }
    return this.options.sessions.start(command.origin, connection.id);
  }

  private async resumeSession(
    connection: BrowserConnectionContext,
    request: BrowserControlRequest,
    command: Extract<BrowserCommand, { type: 'session.resume' }>,
  ): Promise<unknown> {
    if (connection.origin === 'extension-ui') throw new CapabilityError('UNSUPPORTED_OPERATION', 'UI connections cannot resume browser sessions.');
    const session = await this.options.sessions.resume(
      this.requireSession(request), command.resumeToken, connection.id, connection.origin,
    );
    this.options.leases.reactivateSession(session.id);
    return session;
  }

  private async endSession(request: BrowserControlRequest, connection: BrowserConnectionContext): Promise<unknown> {
    const sessionId = this.requireSession(request);
    await this.assertActiveSession(sessionId, connection.id);
    this.options.leases.releaseSession(sessionId);
    this.targetTabs.delete(sessionId);
    await this.drivers.releaseSession?.(sessionId);
    this.turns.delete(sessionId);
    await this.options.sessions.end(sessionId);
    return { ended: true };
  }

  private async startTurn(request: BrowserControlRequest, connection: BrowserConnectionContext): Promise<unknown> {
    const sessionId = this.requireSession(request);
    await this.assertActiveSession(sessionId, connection.id);
    const turnId = this.createTurnId();
    const turns = this.turns.get(sessionId) ?? new Set<string>();
    turns.add(turnId);
    this.turns.set(sessionId, turns);
    return { turnId };
  }

  private async endTurn(request: BrowserControlRequest, connection: BrowserConnectionContext): Promise<unknown> {
    const sessionId = this.requireSession(request);
    const turnId = this.requireTurn(request);
    await this.assertActiveSession(sessionId, connection.id);
    this.assertActiveTurn(sessionId, turnId);
    this.turns.get(sessionId)?.delete(turnId);
    return { ended: true, turnId };
  }

  private async claimTab(sessionId: string, tabId: number, connection: BrowserConnectionContext): Promise<unknown> {
    const selected = await this.driverFor(sessionId).setTargetTab(tabId);
    if (isFailedDriverResult(selected)) return selected;
    const lease = this.options.leases.claim(tabId, {
      sessionId,
      origin: connection.origin as BrowserSessionOrigin,
      label: connection.origin === 'mcp' ? 'External MCP client' : 'Side-panel chat',
    });
    try {
      await this.drivers.claimTab?.(sessionId, tabId);
      this.targetTabs.set(sessionId, tabId);
      return lease;
    } catch (error) {
      this.options.leases.release(tabId, sessionId);
      throw error;
    }
  }

  private async createAndClaimTab(sessionId: string, connection: BrowserConnectionContext, url?: string): Promise<unknown> {
    const owner = {
      sessionId,
      origin: connection.origin as BrowserSessionOrigin,
      label: connection.origin === 'mcp' ? 'External MCP client' : 'Side-panel chat',
    };
    const lease = await this.options.leases.claimCreatedTab(
      async () => {
        const created = await this.driverFor(sessionId).newTab(url);
        if (isFailedDriverResult(created)) throw new Error(created.error);
        return created.id;
      },
      async (tabId) => {
        await this.driverFor(sessionId).closeTab(tabId);
      },
      owner,
    );
    try {
      await this.drivers.claimTab?.(sessionId, lease.tabId);
      this.targetTabs.set(sessionId, lease.tabId);
      return { tabId: lease.tabId, lease };
    } catch (error) {
      this.options.leases.release(lease.tabId, sessionId);
      throw error;
    }
  }

  private async closeTab(sessionId: string, turnId: string, tabId?: number): Promise<unknown> {
    const driver = this.driverFor(sessionId, turnId);
    const targetId = tabId ?? this.targetTabs.get(sessionId) ?? (await driver.getTargetTab()).id;
    this.options.leases.assertOwned(targetId, sessionId);
    const result = await driver.closeTab(targetId);
    if (!isFailedDriverResult(result)) {
      this.options.leases.release(targetId, sessionId);
      await this.drivers.releaseTab?.(sessionId, targetId);
      if (this.targetTabs.get(sessionId) === targetId) this.targetTabs.delete(sessionId);
    }
    return result;
  }

  private async runControlledCommand(
    sessionId: string,
    request: BrowserControlRequest,
    command: BrowserCommand,
    connection: BrowserConnectionContext,
  ): Promise<unknown> {
    const driver = this.driverFor(sessionId, request.turnId);
    const selectedTabId = request.tabId ?? this.targetTabs.get(sessionId);
    if (selectedTabId != null) {
      const selected = await driver.setTargetTab(selectedTabId);
      if (isFailedDriverResult(selected)) return selected;
    }
    const target = await driver.getTargetTab();
    const tabId = selectedTabId ?? target.id;
    this.options.leases.assertOwned(tabId, sessionId);
    await assertTargetCapabilities(target, this.options);
    if (command.type === 'page.evaluate') assertAdvancedCapability(connection.advancedEnabled, this.options);
    if (command.type === 'page.info') return target;
    if (command.type === 'page.actBatch') {
      return this.options.queue.enqueue(tabId, request.requestId, async () => this.executeControlledBatch(
        tabId, command.operations, driver,
      ));
    }

    return this.options.queue.enqueue(tabId, request.requestId, async () => new LegacyCommandHandler(driver).execute(command));
  }

  private async executeControlledBatch(
    tabId: number,
    operations: Extract<BrowserCommand, { type: 'page.actBatch' }>['operations'],
    driver: BrowserDriver,
  ): Promise<unknown> {
    return executeActionBatch(operations, async (operation) => {
      const command = commandForBatchOperation(operation as Extract<BrowserCommand, { type: 'page.actBatch' }>['operations'][number]);
      const result = await new LegacyCommandHandler(driver).execute(command);
      if (isFailedDriverResult(result)) return result;
      return result as { ok: boolean; navigated?: boolean };
    });
  }

  private async selectTab(sessionId: string, turnId: string, tabId: number): Promise<unknown> {
    const selected = await this.driverFor(sessionId, turnId).setTargetTab(tabId);
    if (!isFailedDriverResult(selected)) this.targetTabs.set(sessionId, tabId);
    return selected;
  }

  private driverFor(sessionId: string, turnId?: string): BrowserDriver {
    return this.drivers.forSession(sessionId, turnId);
  }

  private requireSession(request: BrowserControlRequest): string {
    if (!request.browserSessionId) throw new SessionStoreError('SESSION_NOT_FOUND', 'Browser session identifier is missing.');
    return request.browserSessionId;
  }

  private requireTurn(request: BrowserControlRequest): string {
    if (!request.turnId) throw new Error('TURN_NOT_ACTIVE');
    return request.turnId;
  }

  private async assertActiveSession(sessionId: string, connectionId: string): Promise<void> {
    const session = await this.options.sessions.get(sessionId);
    if (!session) throw new SessionStoreError('SESSION_NOT_FOUND', 'Browser session was not found.');
    if (session.state !== 'active') throw new SessionStoreError('SESSION_RESUME_FAILED', 'Browser session must be resumed first.');
    if (session.connectionId !== connectionId) throw new SessionStoreError('SESSION_RESUME_FAILED', 'Browser session belongs to another active connection.');
  }

  private assertActiveTurn(sessionId: string, turnId: string): void {
    if (!this.turns.get(sessionId)?.has(turnId)) throw new Error('TURN_NOT_ACTIVE');
  }

  private unsupported(message: string): never {
    throw new CapabilityError('UNSUPPORTED_OPERATION', message);
  }

  private failure(requestId: string, code: string, message: string): BrowserControlResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      ok: false,
      error: { code: code as BrowserControlResponse['error'] extends infer E ? E extends { code: infer C } ? C : never : never, message, retryable: false },
    };
  }

  private fromError(requestId: string, error: unknown): BrowserControlResponse {
    if (error instanceof CapabilityError || error instanceof SessionStoreError || error instanceof TabLeaseError) {
      return this.failure(requestId, error.code, error.message);
    }
    if (error instanceof Error && error.message === 'TURN_NOT_ACTIVE') {
      return this.failure(requestId, 'TURN_NOT_ACTIVE', 'Browser turn is not active.');
    }
    return this.failure(requestId, 'UNSUPPORTED_OPERATION', error instanceof Error ? error.message : String(error));
  }
}


function commandForBatchOperation(
  operation: Extract<BrowserCommand, { type: 'page.actBatch' }>['operations'][number],
): BrowserCommand {
  switch (operation.type) {
    case 'click': return { type: 'page.click', ref: operation.ref, doubleClick: operation.doubleClick };
    case 'hover': return { type: 'page.hover', ref: operation.ref };
    case 'fill': return { type: 'page.fill', ref: operation.ref, value: operation.value };
    case 'select': return { type: 'page.select', ref: operation.ref, value: operation.value };
    case 'key': return { type: 'page.key', key: operation.key };
    case 'scroll': return { type: 'page.scroll', ref: operation.ref, deltaY: operation.deltaY };
  }
}
