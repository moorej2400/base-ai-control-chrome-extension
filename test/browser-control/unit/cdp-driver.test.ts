import { describe, expect, it, vi } from 'vitest';
import basicAx from '../fixtures/ax-tree-basic.json';
import basicDom from '../fixtures/dom-snapshot-basic.json';
import { CdpDriverFactory } from '@/lib/agent-tools/browser-control/driver/cdp/cdp-driver';
import { DebuggerTransport, type ChromeDebuggerApi } from '@/lib/agent-tools/browser-control/driver/cdp/debugger-transport';

function createDebugger(): ChromeDebuggerApi & { calls: Array<{ method: string; params?: object; sessionId?: string }> } {
  const eventListeners = new Set<(tabId: number, method: string, params?: unknown, sessionId?: string) => void>();
  return {
    calls: [],
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
    getTargets: vi.fn(async () => []),
    onDetach: { addListener() {}, removeListener() {} },
    onEvent: { addListener(listener) { eventListeners.add(listener); }, removeListener(listener) { eventListeners.delete(listener); } },
    sendCommand: vi.fn(async (_tabId, method, params, sessionId) => {
      const api = debuggerApi;
      api.calls.push({ method, params, sessionId });
      if (method === 'Page.navigate') {
        queueMicrotask(() => {
          for (const listener of eventListeners) {
            listener(7, 'Page.frameNavigated', { frame: { url: (params as { url: string }).url } });
          }
        });
      }
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'root-frame' } } };
      if (method === 'DOMSnapshot.captureSnapshot') return basicDom;
      if (method === 'Accessibility.getFullAXTree') return basicAx;
      if (method === 'DOM.getBoxModel') return { model: { content: boxModelContent } };
      if (method === 'DOM.resolveNode') return { object: { objectId: `node-${(params as { backendNodeId: number }).backendNodeId}` } };
      if (method === 'Runtime.callFunctionOn') return { result: { value: true } };
      if (method === 'Page.getLayoutMetrics') return { cssVisualViewport: { offsetX: 0, offsetY: 0, scale: 1 } };
      return {};
    }),
  } as ChromeDebuggerApi & { calls: Array<{ method: string; params?: object; sessionId?: string }> };
}

let debuggerApi: ReturnType<typeof createDebugger>;
let boxModelContent = [10, 20, 90, 20, 90, 44, 10, 44];

describe('CdpDriverFactory', () => {
  it('marks only the active tab in the last-focused window as active', async () => {
    debuggerApi = createDebugger();
    const tabs = {
      query: vi.fn(async (query: chrome.tabs.QueryInfo) => query.lastFocusedWindow
        ? [{ id: 7, index: 0, title: 'Focused', url: 'https://focused.test', active: true }]
        : [
            { id: 7, index: 0, title: 'Focused', url: 'https://focused.test', active: true },
            { id: 8, index: 0, title: 'Other window', url: 'https://other.test', active: true },
          ]),
      get: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    } as never;
    const driver = new CdpDriverFactory({
      transport: new DebuggerTransport(debuggerApi),
      tabs,
    }).forSession('browser-session', 'turn-1');

    await expect(driver.listTabs()).resolves.toEqual([
      expect.objectContaining({ id: 7, active: true }),
      expect.objectContaining({ id: 8, active: false }),
    ]);
  });

  it('does not replace the debugger target when navigation already matches the current URL', async () => {
    debuggerApi = createDebugger();
    const tabs = {
      query: vi.fn(async () => [{ id: 7, index: 0, title: 'Test', url: 'https://example.test/', active: true }]),
      get: vi.fn(async () => ({ id: 7, index: 0, title: 'Test', url: 'https://example.test/', active: true })),
      create: vi.fn(),
      remove: vi.fn(),
    } as never;
    const factory = new CdpDriverFactory({ transport: new DebuggerTransport(debuggerApi), tabs });
    await factory.claimTab?.('browser-session', 7);
    const driver = factory.forSession('browser-session', 'turn-1');
    await driver.setTargetTab(7);
    debuggerApi.calls.length = 0;

    await expect(driver.navigate('https://example.test')).resolves.toMatchObject({
      ok: true,
      navigated: false,
      url: 'https://example.test/',
    });
    expect(debuggerApi.calls).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'Page.navigate' }),
    ]));
  });

  it('rounds fractional box-model points for the target containment check', async () => {
    boxModelContent = [10.2, 20.1, 90.6, 20.1, 90.6, 44.3, 10.2, 44.3];
    debuggerApi = createDebugger();
    const tabs = {
      query: vi.fn(async () => [{ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true }]),
      get: vi.fn(async () => ({ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true })),
      create: vi.fn(),
      remove: vi.fn(),
    } as never;
    const factory = new CdpDriverFactory({ transport: new DebuggerTransport(debuggerApi), tabs });
    await factory.claimTab?.('browser-session', 7);
    const driver = factory.forSession('browser-session', 'turn-1');
    await driver.setTargetTab(7);
    const snapshot = await driver.snapshot();
    if (!snapshot.ok) throw new Error(snapshot.error);

    await expect(driver.click(snapshot.tree.split(' ')[0])).resolves.toMatchObject({ ok: true });
    expect(debuggerApi.calls.find(({ method }) => method === 'Runtime.callFunctionOn')?.params)
      .toEqual(expect.objectContaining({ arguments: [{ value: 50 }, { value: 32 }] }));
  });

  it('uses opaque CDP refs, waits for the visual cursor, then dispatches trusted input', async () => {
    boxModelContent = [10, 20, 90, 20, 90, 44, 10, 44];
    debuggerApi = createDebugger();
    const cursor = { publish: vi.fn(async () => 'arrived' as const) };
    const tabs = {
      query: vi.fn(async () => [{ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true }]),
      get: vi.fn(async () => ({ id: 7, index: 0, title: 'Test', url: 'https://example.test', active: true })),
      create: vi.fn(),
      remove: vi.fn(),
    } as never;
    const factory = new CdpDriverFactory({ transport: new DebuggerTransport(debuggerApi), tabs, cursor });
    await factory.claimTab?.('browser-session', 7);
    const driver = factory.forSession('browser-session', 'turn-1');
    await driver.setTargetTab(7);

    const snapshot = await driver.snapshot();
    expect(snapshot).toMatchObject({ ok: true, nodeCount: 1 });
    if (!snapshot.ok) throw new Error(snapshot.error);
    const ref = snapshot.tree.split(' ')[0];

    const result = await driver.click(ref);

    expect(result).toMatchObject({ ok: true, url: 'https://example.test' });
    expect(cursor.publish).toHaveBeenCalledWith(7, expect.objectContaining({
      sessionId: 'browser-session', turnId: 'turn-1', overlayX: 50, overlayY: 32, pulse: true,
    }));
    const methods = debuggerApi.calls.map(({ method }) => method);
    expect(methods.indexOf('Input.dispatchMouseEvent')).toBeGreaterThan(methods.indexOf('Runtime.callFunctionOn'));
    expect(methods).toContain('DOM.getBoxModel');
    expect(methods).not.toContain('DOM.getContentQuads');
  });
});
