import type {
  ActionResult,
  BrowserDriver,
  DriverError,
  EvaluateResult,
  NavResult,
  ScreenshotResult,
  SessionDriverFactory,
  SnapshotOptions,
  SnapshotResult,
  TabInfo,
  WaitCondition,
  WaitResult,
} from '../types';
import { isRestrictedUrl } from '../extension/restricted-urls';
import type { CursorStatus } from '../../background/cursor-state';
import { AttachmentManager } from './attachment-manager';
import { CdpInput } from './input';
import { CdpNavigation } from './navigation';
import { type ReferenceBinding } from './node-references';
import { CdpScreenshots } from './screenshots';
import { SnapshotEngine } from './snapshot-engine';
import { formatSnapshot } from './snapshot-format';
import { TargetResolver, type TargetResolution } from './target-resolver';
import { CdpWaiter } from './waiter';
import { DebuggerTransport } from './debugger-transport';
import type { FrameOwnerGeometry } from './coordinate-mapper';

export interface CdpTabsApi {
  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  get(tabId: number): Promise<chrome.tabs.Tab>;
  create(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
  remove(tabId: number): Promise<void>;
}

export interface CdpCursorPublisher {
  publish(tabId: number, move: {
    type: 'cursor.move'; sessionId: string; turnId: string; moveSequence: number;
    overlayX: number; overlayY: number; pulse: boolean;
  }): Promise<CursorStatus>;
}

export interface CdpDriverFactoryOptions {
  transport: DebuggerTransport;
  tabs?: CdpTabsApi;
  cursor?: CdpCursorPublisher;
}

interface PageState { url: string; title: string }
interface FrameTree { frame?: { id?: string }; childFrames?: FrameTree[] }

/**
 * Session-aware CDP driver factory. The debugger transport and its attachment
 * lifetime are shared, while every BrowserDriver view carries immutable
 * session/turn identity so node references and visible cursor moves cannot
 * cross from the embedded agent into an external MCP request.
 */
export class CdpDriverFactory implements SessionDriverFactory {
  private readonly core: CdpDriverCore;

  constructor(options: CdpDriverFactoryOptions) {
    this.core = new CdpDriverCore(options.transport, options.tabs ?? chrome.tabs, options.cursor);
  }

  forSession(browserSessionId: string, turnId?: string): BrowserDriver {
    return new CdpSessionDriver(this.core, browserSessionId, turnId);
  }

  claimTab(browserSessionId: string, tabId: number): Promise<void> {
    return this.core.attachments.ensure(tabId, browserSessionId);
  }

  releaseTab(browserSessionId: string, tabId: number): Promise<void> {
    return this.core.attachments.release(tabId, browserSessionId);
  }

  releaseSession(browserSessionId: string): Promise<void> {
    return this.core.attachments.releaseSession(browserSessionId);
  }
}

class CdpDriverCore {
  readonly attachments: AttachmentManager;
  readonly snapshots: SnapshotEngine;
  readonly revisions = new Map<number, number>();
  readonly targets = new Map<string, number>();
  readonly cursorSequence = new Map<string, number>();

  constructor(
    readonly transport: DebuggerTransport,
    readonly tabs: CdpTabsApi,
    readonly cursor?: CdpCursorPublisher,
  ) {
    this.attachments = new AttachmentManager(transport);
    this.snapshots = new SnapshotEngine(transport);
    transport.onEvent(({ tabId, method }) => {
      if (method === 'DOM.documentUpdated' || method === 'Page.frameNavigated' || method === 'Page.navigatedWithinDocument') {
        this.revisions.set(tabId, (this.revisions.get(tabId) ?? 0) + 1);
      }
    });
    transport.onDetach(({ tabId, reason, sessionId, targetId }) => {
      if (!sessionId && !targetId && reason !== 'target_closed') this.revisions.delete(tabId);
    });
  }

  revision(tabId: number): string {
    return String(this.revisions.get(tabId) ?? 0);
  }

  async rootFrameId(tabId: number): Promise<string> {
    const tree = await this.transport.send<{ frameTree?: { frame?: { id?: string } } }>(tabId, 'Page.getFrameTree');
    return tree.frameTree?.frame?.id ?? 'root';
  }

  async readState(tabId: number): Promise<PageState> {
    const tab = await this.tabs.get(tabId);
    return { url: tab.url ?? '', title: tab.title ?? '' };
  }

  async frameChain(tabId: number, frameId: string, childSessionId?: string): Promise<FrameOwnerGeometry[]> {
    const tree = await this.transport.send<{ frameTree?: FrameTree }>(tabId, 'Page.getFrameTree');
    const parents = new Map<string, string>();
    const collect = (node?: FrameTree, parentId?: string) => {
      const id = node?.frame?.id;
      if (!node || !id) return;
      if (parentId) parents.set(id, parentId);
      node.childFrames?.forEach((child) => collect(child, id));
    };
    collect(tree.frameTree);
    const frames: FrameOwnerGeometry[] = [];
    let childId = frameId;
    while (parents.has(childId)) {
      const owner = await this.transport.send<{ backendNodeId?: number }>(tabId, 'DOM.getFrameOwner', { frameId: childId });
      if (!owner.backendNodeId) throw new Error('Could not resolve iframe owner geometry.');
      const box = await this.transport.send<{ model?: { content?: number[] } }>(tabId, 'DOM.getBoxModel', { backendNodeId: owner.backendNodeId });
      const quad = box.model?.content;
      if (!quad || quad.length !== 8) throw new Error('Could not resolve iframe content quad.');
      const metrics = await this.transport.send<{ cssContentSize?: { width?: number; height?: number }; contentSize?: { width?: number; height?: number } }>(
        tabId,
        'Page.getLayoutMetrics',
        undefined,
        childId === frameId ? childSessionId : undefined,
      );
      const contentSize = metrics.cssContentSize ?? metrics.contentSize;
      if (!contentSize?.width || !contentSize.height) throw new Error('Could not resolve iframe content size.');
      frames.push({
        contentWidth: contentSize.width,
        contentHeight: contentSize.height,
        quad: quad as [number, number, number, number, number, number, number, number],
      });
      childId = parents.get(childId)!;
    }
    return frames;
  }

  nextCursorSequence(sessionId: string, turnId: string): number {
    const key = `${sessionId}:${turnId}`;
    const next = (this.cursorSequence.get(key) ?? 0) + 1;
    this.cursorSequence.set(key, next);
    return next;
  }
}

class CdpSessionDriver implements BrowserDriver {
  constructor(
    private readonly core: CdpDriverCore,
    private readonly browserSessionId: string,
    private readonly turnId?: string,
  ) {}

  async getTargetTab(): Promise<TabInfo> {
    const tab = await this.resolveTab();
    return this.toInfo(tab);
  }

  async setTargetTab(tabId: number): Promise<TabInfo | DriverError> {
    try {
      const tab = await this.core.tabs.get(tabId);
      this.core.targets.set(this.browserSessionId, tabId);
      return this.toInfo(tab);
    } catch (error) {
      return failure(error);
    }
  }

  async listTabs(): Promise<TabInfo[]> {
    const [tabs, focused] = await Promise.all([
      this.core.tabs.query({}),
      this.core.tabs.query({ active: true, lastFocusedWindow: true }),
    ]);
    const focusedTabId = focused[0]?.id;
    return tabs.map((tab) => this.toInfo(tab, tab.id === focusedTabId));
  }

  async navigate(url: string): Promise<NavResult> {
    return this.withTarget(async (tabId) => {
      if (isRestrictedUrl(url)) return { ok: false, error: `Cannot navigate to restricted URL: ${url}` };
      const before = await this.core.readState(tabId);
      if (sameUrl(before.url, url)) {
        return { ok: true, navigated: false, ...before };
      }
      const navigation = new CdpNavigation({
        send: (method, params) => this.core.transport.send(tabId, method, params),
        onEvent: (listener) => this.core.transport.onEvent((event) => { if (event.tabId === tabId) listener(event.method, event.params); }),
      });
      const result = await navigation.navigate(url);
      const after = await this.core.readState(tabId);
      return { ok: true, navigated: result.navigated || after.url !== before.url, ...after };
    });
  }

  async navigateHistory(direction: 'back' | 'forward'): Promise<NavResult> {
    return this.withTarget(async (tabId) => {
      const before = await this.core.readState(tabId);
      const history = await this.core.transport.send<{ entries?: Array<{ id: number }>; currentIndex?: number }>(tabId, 'Page.getNavigationHistory');
      const index = (history.currentIndex ?? 0) + (direction === 'back' ? -1 : 1);
      const entry = history.entries?.[index];
      if (!entry) return { ok: false, error: `No ${direction} history entry is available.` };
      const navigation = new CdpNavigation({
        send: (method, params) => this.core.transport.send(tabId, method, params),
        onEvent: (listener) => this.core.transport.onEvent((event) => { if (event.tabId === tabId) listener(event.method, event.params); }),
      });
      await navigation.navigateHistory(entry.id);
      const after = await this.core.readState(tabId);
      return { ok: true, navigated: after.url !== before.url, ...after };
    });
  }

  async newTab(url?: string): Promise<TabInfo | DriverError> {
    try {
      if (url && isRestrictedUrl(url)) return { ok: false, error: `Cannot open restricted URL: ${url}` };
      const tab = await this.core.tabs.create({ url, active: true });
      if (tab.id == null) return { ok: false, error: 'Chrome did not return an id for the new tab.' };
      this.core.targets.set(this.browserSessionId, tab.id);
      return this.toInfo(tab);
    } catch (error) {
      return failure(error);
    }
  }

  async closeTab(tabId?: number): Promise<{ ok: true } | DriverError> {
    try {
      const id = tabId ?? (await this.resolveTab()).id;
      if (id == null) return { ok: false, error: 'Target tab has no id.' };
      const tabs = await this.core.tabs.query({});
      if (tabs.length <= 1) return { ok: false, error: 'Refusing to close the last remaining tab.' };
      await this.core.tabs.remove(id);
      if (this.core.targets.get(this.browserSessionId) === id) this.core.targets.delete(this.browserSessionId);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  }

  async waitFor(condition: WaitCondition): Promise<WaitResult> {
    return this.withTarget(async (tabId) => {
      await this.ensureAttached(tabId);
      const waiter = new CdpWaiter({
        evaluate: async (expression) => ({ value: await this.evaluateBoolean(tabId, expression) }),
        onEvent: (listener) => this.core.transport.onEvent((event) => { if (event.tabId === tabId) listener(event.method); }),
      });
      const result = await waiter.waitFor(condition);
      return { ok: true, ...result, ...(await this.core.readState(tabId)) };
    });
  }

  async snapshot(options?: SnapshotOptions): Promise<SnapshotResult> {
    return this.withTarget(async (tabId) => {
      await this.ensureAttached(tabId);
      const mode = options?.mode ?? 'interactive';
      const rootFrameId = await this.core.rootFrameId(tabId);
      const documentRevision = this.core.revision(tabId);
      const root = await this.core.snapshots.capture(tabId, {
        browserSessionId: this.browserSessionId,
        tabId,
        documentRevision,
        frameId: rootFrameId,
      }, mode);
      const children = await Promise.all(this.core.attachments.childSessionIds(tabId).map((cdpSessionId) => this.core.snapshots.capture(tabId, {
        browserSessionId: this.browserSessionId,
        tabId,
        documentRevision,
        frameId: this.core.attachments.childFrameId(tabId, cdpSessionId) ?? cdpSessionId,
        cdpSessionId,
      }, mode)));
      const formatted = formatSnapshot({ nodes: [root, ...children].flatMap((snapshot) => snapshot.nodes), mode });
      return { ok: true, ...(await this.core.readState(tabId)), ...formatted };
    });
  }

  async screenshot(): Promise<ScreenshotResult> {
    return this.withTarget(async (tabId) => {
      await this.ensureAttached(tabId);
      const screenshots = new CdpScreenshots({ send: (method, params) => this.core.transport.send<{ data: string }>(tabId, method, params) });
      return { ok: true, dataUrl: await screenshots.capture() };
    });
  }

  async evaluate(expression: string): Promise<EvaluateResult> {
    return this.withTarget(async (tabId) => {
      const result = await this.core.transport.send<{ result?: { value?: unknown; description?: string } }>(tabId, 'Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      });
      const value = result.result?.value ?? result.result?.description ?? null;
      const serialized = JSON.stringify(value) ?? String(value);
      return { ok: true, value: serialized.slice(0, 5_000) };
    });
  }

  click(ref: string, options?: { dblClick?: boolean }): Promise<ActionResult> {
    return this.actOnRef(ref, async (tabId, target) => {
      await this.publishCursor(tabId, target.point.overlayX, target.point.overlayY, true);
      await new CdpInput({ send: (method, params) => this.core.transport.send(tabId, method, params) }).click(target.point, options?.dblClick ?? false);
    });
  }

  hover(ref: string): Promise<ActionResult> {
    return this.actOnRef(ref, async (tabId, target) => {
      await this.publishCursor(tabId, target.point.overlayX, target.point.overlayY, false);
      await new CdpInput({ send: (method, params) => this.core.transport.send(tabId, method, params) }).hover(target.point);
    });
  }

  fill(ref: string, value: string): Promise<ActionResult> {
    return this.actOnRef(ref, async (tabId, target) => {
      await this.publishCursor(tabId, target.point.overlayX, target.point.overlayY, true);
      const input = new CdpInput({ send: (method, params) => this.core.transport.send(tabId, method, params) });
      await input.click(target.point, false);
      if (target.role === 'slider') {
        await this.fillSlider(tabId, target.backendNodeId, value, input);
        return;
      }
      await input.replaceText(value);
      if (target.role === 'combobox') await input.pressKey('Enter');
    });
  }

  async fillForm(fields: Array<{ uid: string; value: string }>): Promise<ActionResult> {
    let result: ActionResult = { ok: false, error: 'No fields were supplied.' };
    for (const field of fields) {
      result = await this.fill(field.uid, field.value);
      if (!result.ok || result.navigated) return result;
    }
    return result;
  }

  async pressKey(key: string): Promise<ActionResult> {
    return this.withTarget(async (tabId) => {
      await this.ensureAttached(tabId);
      const before = await this.core.readState(tabId);
      await new CdpInput({ send: (method, params) => this.core.transport.send(tabId, method, params) }).pressKey(key);
      const after = await this.core.readState(tabId);
      return { ok: true, navigated: before.url !== after.url, ...after };
    });
  }

  scrollTo(ref: string): Promise<ActionResult> {
    return this.actOnRef(ref, async (tabId, target) => {
      await this.publishCursor(tabId, target.point.overlayX, target.point.overlayY, false);
      await new CdpInput({ send: (method, params) => this.core.transport.send(tabId, method, params) }).scroll(target.point, 500);
    });
  }

  private async actOnRef(
    ref: string,
    act: (tabId: number, target: Extract<TargetResolution, { ok: true }>) => Promise<void>,
  ): Promise<ActionResult> {
    return this.withTarget(async (tabId) => {
      await this.ensureAttached(tabId);
      const before = await this.core.readState(tabId);
      const binding: ReferenceBinding = { browserSessionId: this.browserSessionId, tabId, documentRevision: this.core.revision(tabId) };
      const resolver = new TargetResolver(this.core.snapshots.references(), this.targetApi(tabId));
      const target = await resolver.resolve(ref, binding);
      if (!target.ok) return { ok: false, error: target.detail ? `${target.code}: ${target.detail}` : target.code };
      await act(tabId, target);
      const after = await this.core.readState(tabId);
      return { ok: true, navigated: before.url !== after.url, ...after };
    });
  }

  private targetApi(tabId: number) {
    return {
      currentRevision: async () => this.core.revision(tabId),
      scrollIntoView: (backendNodeId: number, sessionId?: string) => this.core.transport.send(tabId, 'DOM.scrollIntoViewIfNeeded', { backendNodeId }, sessionId).then(() => {}),
      contentQuad: async (backendNodeId: number, sessionId?: string) => {
        // `DOM.getBoxModel` is stable across Chrome channels; the experimental
        // getContentQuads command rejected valid snapshot backend ids in live MV3 use.
        const result = await this.core.transport.send<{ model?: { content?: number[]; border?: number[] } }>(tabId, 'DOM.getBoxModel', { backendNodeId }, sessionId);
        const quad = result.model?.content ?? result.model?.border;
        return quad && quad.length === 8 ? quad as [number, number, number, number, number, number, number, number] : undefined;
      },
      frameChain: (frameId: string, sessionId?: string) => this.core.frameChain(tabId, frameId, sessionId),
      pointIsInsideTarget: async (backendNodeId: number, x: number, y: number) => {
        const objectGroup = 'browser-control-hit-test';
        try {
          const target = await this.core.transport.send<{ object?: { objectId?: string } }>(tabId, 'DOM.resolveNode', { backendNodeId, objectGroup });
          if (!target.object?.objectId) return false;
          const result = await this.core.transport.send<{ result?: { value?: unknown } }>(tabId, 'Runtime.callFunctionOn', {
            objectId: target.object.objectId,
            functionDeclaration: 'function(x, y) { const hit = this.ownerDocument?.elementFromPoint(x, y); return hit === this || Boolean(this.contains?.(hit)); }',
            arguments: [{ value: Math.round(x) }, { value: Math.round(y) }],
            returnByValue: true,
          });
          return result.result?.value === true;
        } finally {
          await this.core.transport.send(tabId, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => {});
        }
      },
      visualViewport: async () => {
        const metrics = await this.core.transport.send<{ cssVisualViewport?: { offsetX?: number; offsetY?: number; scale?: number }; visualViewport?: { offsetX?: number; offsetY?: number; scale?: number } }>(tabId, 'Page.getLayoutMetrics');
        const viewport = metrics.cssVisualViewport ?? metrics.visualViewport ?? {};
        return { offsetX: viewport.offsetX ?? 0, offsetY: viewport.offsetY ?? 0, scale: viewport.scale ?? 1 };
      },
    };
  }

  private async publishCursor(tabId: number, overlayX: number, overlayY: number, pulse: boolean): Promise<void> {
    if (!this.core.cursor || !this.turnId) return;
    await this.core.cursor.publish(tabId, {
      type: 'cursor.move', sessionId: this.browserSessionId, turnId: this.turnId,
      moveSequence: this.core.nextCursorSequence(this.browserSessionId, this.turnId), overlayX, overlayY, pulse,
    });
  }

  private async fillSlider(tabId: number, backendNodeId: number, value: string, input: CdpInput): Promise<void> {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error('A slider requires a numeric value.');
    const attributes = await this.core.transport.send<{ attributes?: string[] }>(tabId, 'DOM.getAttributes', { backendNodeId });
    const entries = attributes.attributes ?? [];
    const minIndex = entries.indexOf('min');
    const min = minIndex >= 0 ? Number(entries[minIndex + 1]) : 0;
    if (!Number.isFinite(min)) throw new Error('Could not determine the slider minimum.');
    const steps = Math.max(0, Math.min(200, Math.round(numeric - min)));
    await input.pressKey('Home');
    for (let index = 0; index < steps; index += 1) await input.pressKey('ArrowRight');
  }

  private async evaluateBoolean(tabId: number, expression: string): Promise<boolean> {
    const result = await this.core.transport.send<{ result?: { value?: unknown } }>(tabId, 'Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    return result.result?.value === true;
  }

  private async ensureAttached(tabId: number): Promise<void> {
    await this.core.attachments.ensure(tabId, this.browserSessionId);
  }

  private async resolveTab(): Promise<chrome.tabs.Tab> {
    const selected = this.core.targets.get(this.browserSessionId);
    if (selected != null) return this.core.tabs.get(selected);
    const [active] = await this.core.tabs.query({ active: true, currentWindow: true });
    if (!active) throw new Error('No active browser tab found.');
    if (active.id != null) this.core.targets.set(this.browserSessionId, active.id);
    return active;
  }

  private toInfo(tab: chrome.tabs.Tab, active = tab.active ?? false): TabInfo {
    return {
      id: tab.id ?? -1, index: tab.index, title: tab.title ?? '', url: tab.url ?? '', active,
      isTarget: tab.id != null && tab.id === this.core.targets.get(this.browserSessionId),
    };
  }

  private async withTarget<T extends { ok: true } | DriverError>(operation: (tabId: number) => Promise<T>): Promise<T> {
    try {
      const tab = await this.resolveTab();
      if (tab.id == null) return { ok: false, error: 'Target tab has no id.' } as T;
      if (isRestrictedUrl(tab.url)) return { ok: false, error: `Cannot control restricted URL: ${tab.url ?? ''}` } as T;
      return await operation(tab.id);
    } catch (error) {
      return failure(error) as T;
    }
  }
}

function failure(error: unknown): DriverError {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function sameUrl(current: string, requested: string): boolean {
  try {
    return new URL(requested, current).href === new URL(current).href;
  } catch {
    return current === requested;
  }
}
