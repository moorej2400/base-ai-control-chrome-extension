import { describe, expect, it, vi } from 'vitest';
import { BrowserControlCoordinator } from '../../../lib/agent-tools/browser-control/background/coordinator';
import { BrowserControlRouter } from '../../../lib/agent-tools/browser-control/background/router';
import { MemorySessionStorage, SessionStore } from '../../../lib/agent-tools/browser-control/background/session-store';
import { TabLeaseStore } from '../../../lib/agent-tools/browser-control/background/tab-leases';
import { TabQueue } from '../../../lib/agent-tools/browser-control/background/tab-queue';
import { ApprovalStore } from '../../../lib/agent-tools/browser-control/background/approval-store';
import type { BrowserDriver } from '../../../lib/agent-tools/browser-control/driver/types';
import { PROTOCOL_VERSION } from '@ai-page-chat/browser-control-protocol';

const connection = { id: 'embedded-connection', origin: 'embedded' as const, advancedEnabled: false };

function makeDriver(): BrowserDriver {
  return {
    getTargetTab: vi.fn().mockResolvedValue({ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true, isTarget: true }),
    setTargetTab: vi.fn().mockResolvedValue({ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true, isTarget: true }),
    listTabs: vi.fn().mockResolvedValue([]),
    navigate: vi.fn(),
    navigateHistory: vi.fn(),
    newTab: vi.fn(),
    closeTab: vi.fn(),
    waitFor: vi.fn(),
    snapshot: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.test', title: 'Test', tree: '', headings: '', nodeCount: 0, truncated: false }),
    screenshot: vi.fn(),
    evaluate: vi.fn(),
    click: vi.fn(),
    hover: vi.fn(),
    fill: vi.fn(),
    fillForm: vi.fn(),
    pressKey: vi.fn(),
    scrollTo: vi.fn(),
  };
}

function createCoordinator(driver: BrowserDriver, canAccessTab = async () => true, advancedSettingEnabled = () => false) {
  const sessions = new SessionStore({
    storage: new MemorySessionStorage(),
    createId: () => 'session-1',
    createToken: () => 'resume-token',
    hashToken: async (token) => `hash:${token}`,
  });
  return new BrowserControlCoordinator({
    driver,
    sessions,
    leases: new TabLeaseStore(),
    queue: new TabQueue(),
    canAccessTab,
    advancedSettingEnabled,
    createTurnId: () => 'turn-1',
  });
}

async function startTurn(coordinator: BrowserControlCoordinator) {
  const started = await coordinator.handle(connection, {
    protocolVersion: PROTOCOL_VERSION,
    requestId: 'start',
    command: { type: 'session.start', origin: 'embedded' },
  });
  const browserSessionId = (started.result as { browserSessionId: string }).browserSessionId;
  const turn = await coordinator.handle(connection, {
    protocolVersion: PROTOCOL_VERSION,
    requestId: 'turn',
    browserSessionId,
    command: { type: 'turn.start' },
  });
  return { browserSessionId, turnId: (turn.result as { turnId: string }).turnId };
}

describe('BrowserControlCoordinator', () => {
  it('holds a close action until the extension UI approves its exact challenge', async () => {
    const driver = makeDriver();
    driver.closeTab = vi.fn().mockResolvedValue({ ok: true });
    const sessions = new SessionStore({
      storage: new MemorySessionStorage(), createId: () => 'session-1', createToken: () => 'token', hashToken: async () => 'hash',
    });
    const approvals = new ApprovalStore(() => 'approval-1', async () => 'command-hash');
    const coordinator = new BrowserControlCoordinator({
      driver, sessions, leases: new TabLeaseStore(), queue: new TabQueue(), approvals,
      canAccessTab: async () => true, advancedSettingEnabled: () => false, createTurnId: () => 'turn-1',
    });
    const { browserSessionId, turnId } = await startTurn(coordinator);
    await coordinator.handle(connection, { protocolVersion: PROTOCOL_VERSION, requestId: 'claim', browserSessionId, turnId, command: { type: 'tabs.claim', tabId: 7 } });

    const challenged = await coordinator.handle(connection, { protocolVersion: PROTOCOL_VERSION, requestId: 'close', browserSessionId, turnId, command: { type: 'tabs.close', tabId: 7 } });
    expect(challenged.result).toMatchObject({ ok: false, code: 'ACTION_REQUIRES_APPROVAL', approval: { approvalId: 'approval-1' } });
    expect(driver.closeTab).not.toHaveBeenCalled();

    await coordinator.handle({ id: 'approval-ui', origin: 'extension-ui', advancedEnabled: false }, {
      protocolVersion: PROTOCOL_VERSION, requestId: 'approve', command: { type: 'approval.resolve', approvalId: 'approval-1', decision: 'approve' },
    });
    const resumed = await coordinator.handle(connection, { protocolVersion: PROTOCOL_VERSION, requestId: 'resume', browserSessionId, turnId, command: { type: 'approval.resume', approvalId: 'approval-1' } });

    expect(resumed).toMatchObject({ ok: true, result: { ok: true } });
    expect(driver.closeTab).toHaveBeenCalledWith(7);
  });

  it('stops an action batch at an approval challenge before running its later actions', async () => {
    const driver = makeDriver() as BrowserDriver & { approvalContext(): Promise<{ documentRevision: string; target: { name: string } }> };
    driver.approvalContext = vi.fn().mockResolvedValue({ documentRevision: 'revision-1', target: { name: 'Delete account' } });
    driver.click = vi.fn().mockResolvedValue({ ok: true, navigated: false, url: 'https://example.test', title: 'Test' });
    const coordinator = new BrowserControlCoordinator({
      driver,
      sessions: new SessionStore({ storage: new MemorySessionStorage(), createId: () => 'session-1', createToken: () => 'token', hashToken: async () => 'hash' }),
      leases: new TabLeaseStore(), queue: new TabQueue(), approvals: new ApprovalStore(() => 'approval-1', async () => 'hash'),
      canAccessTab: async () => true, advancedSettingEnabled: () => false, createTurnId: () => 'turn-1',
    });
    const { browserSessionId, turnId } = await startTurn(coordinator);
    await coordinator.handle(connection, { protocolVersion: PROTOCOL_VERSION, requestId: 'claim', browserSessionId, turnId, command: { type: 'tabs.claim', tabId: 7 } });

    const response = await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION, requestId: 'batch', browserSessionId, turnId,
      command: { type: 'page.actBatch', operations: [{ type: 'click', ref: 'delete-ref' }, { type: 'click', ref: 'later-ref' }] },
    });

    expect(response).toMatchObject({ ok: true, result: { stopped: 'approval' } });
    expect(driver.click).not.toHaveBeenCalled();
  });

  it('orphans the actual browser session and lease when its connection drops', async () => {
    const driver = makeDriver();
    const sessions = new SessionStore({
      storage: new MemorySessionStorage(), createId: () => 'session-1', createToken: () => 'token', hashToken: async () => 'hash',
    });
    const leases = new TabLeaseStore();
    const coordinator = new BrowserControlCoordinator({ driver, sessions, leases, queue: new TabQueue(), canAccessTab: async () => true, advancedSettingEnabled: () => false, createTurnId: () => 'turn-1' });
    const { browserSessionId, turnId } = await startTurn(coordinator);
    await coordinator.handle(connection, { protocolVersion: PROTOCOL_VERSION, requestId: 'claim', browserSessionId, turnId, command: { type: 'tabs.claim', tabId: 7 } });

    await coordinator.disconnect(connection);

    expect((await sessions.get(browserSessionId))?.state).toBe('orphaned');
    expect(leases.get(7)?.state).toBe('orphaned');
  });
  it('rejects commands from a second connection until it presents the resume token', async () => {
    const driver = makeDriver();
    const coordinator = createCoordinator(driver);
    const { browserSessionId, turnId } = await startTurn(coordinator);
    const response = await coordinator.handle({ id: 'other-connection', origin: 'embedded', advancedEnabled: false }, {
      protocolVersion: PROTOCOL_VERSION, requestId: 'tabs', browserSessionId, turnId, command: { type: 'tabs.list' },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'SESSION_RESUME_FAILED' } });
    expect(driver.listTabs).not.toHaveBeenCalled();
  });
  it('rejects unleased page reads before invoking the driver', async () => {
    const driver = makeDriver();
    const coordinator = createCoordinator(driver);
    const { browserSessionId, turnId } = await startTurn(coordinator);

    const response = await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'snapshot',
      browserSessionId,
      turnId,
      tabId: 7,
      command: { type: 'page.snapshot' },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'TAB_NOT_LEASED' } });
    expect(driver.snapshot).not.toHaveBeenCalled();
  });

  it('rejects restricted or ungranted targets before invoking the driver', async () => {
    const driver = makeDriver();
    const coordinator = createCoordinator(driver, async () => false);
    const { browserSessionId, turnId } = await startTurn(coordinator);
    await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'claim',
      browserSessionId,
      turnId,
      command: { type: 'tabs.claim', tabId: 7 },
    });

    const response = await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'snapshot',
      browserSessionId,
      turnId,
      tabId: 7,
      command: { type: 'page.snapshot' },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'HOST_PERMISSION_REQUIRED' } });
    expect(driver.snapshot).not.toHaveBeenCalled();
  });

  it('fails advanced commands unless both connection and user setting grant them', async () => {
    const driver = makeDriver();
    const coordinator = createCoordinator(driver, async () => true, () => true);
    const { browserSessionId, turnId } = await startTurn(coordinator);
    await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'claim',
      browserSessionId,
      turnId,
      command: { type: 'tabs.claim', tabId: 7 },
    });

    const response = await coordinator.handle(connection, {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'evaluate',
      browserSessionId,
      turnId,
      tabId: 7,
      command: { type: 'page.evaluate', expression: 'document.title' },
    });

    expect(response).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_OPERATION' } });
    expect(driver.evaluate).not.toHaveBeenCalled();
  });
});

describe('BrowserControlRouter', () => {
  it('does not invoke the coordinator for invalid messages', async () => {
    const handler = { handle: vi.fn() };
    const router = new BrowserControlRouter(handler);

    const response = await router.handle(connection, { protocolVersion: 999, command: { type: 'nope' } });

    expect(response).toMatchObject({ ok: false, error: { code: 'PROTOCOL_MISMATCH' } });
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
