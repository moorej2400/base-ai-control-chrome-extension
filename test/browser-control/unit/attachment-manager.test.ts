import { describe, expect, it, vi } from 'vitest';
import { AttachmentManager } from '@/lib/agent-tools/browser-control/driver/cdp/attachment-manager';
import { DebuggerTransport } from '@/lib/agent-tools/browser-control/driver/cdp/debugger-transport';

function createTransport() {
  return {
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
    send: vi.fn(async () => ({})),
    getTargets: vi.fn(async () => []),
    onEvent: vi.fn(),
    onDetach: vi.fn(),
  } as unknown as DebuggerTransport;
}

describe('AttachmentManager', () => {
  it('attaches and initializes a leased tab exactly once', async () => {
    const transport = createTransport();
    const manager = new AttachmentManager(transport);

    await manager.ensure(4, 'session-a');
    await manager.ensure(4, 'session-a');

    expect(transport.attach).toHaveBeenCalledTimes(1);
    expect(transport.send).not.toHaveBeenCalledWith(4, 'Target.setAutoAttach', expect.anything());
    expect(transport.send).toHaveBeenCalledWith(4, 'Input.setIgnoreInputEvents', { ignore: false });
    expect(transport.send).toHaveBeenCalledWith(4, 'Emulation.setFocusEmulationEnabled', { enabled: true });
    expect(manager.isAttached(4)).toBe(true);
  });

  it('initializes child sessions after recursive auto-attach events', async () => {
    let eventListener: ((event: { tabId: number; method: string; params?: unknown }) => void) | undefined;
    const transport = createTransport();
    vi.mocked(transport.onEvent).mockImplementation((listener) => {
      eventListener = listener;
      return () => {};
    });
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');

    eventListener?.({
      tabId: 4,
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'child-1',
        targetInfo: { type: 'iframe', targetId: 'frame-1', url: 'https://frame.example.test/' },
      },
    });
    await vi.waitFor(() => expect(manager.childSessionIds(4)).toEqual(['child-1']));
    expect(transport.send).toHaveBeenCalledWith(4, 'Page.enable', undefined, 'child-1');
  });

  it('ignores restricted child targets and does not treat a child detach as a root detach', async () => {
    let eventListener: ((event: { tabId: number; method: string; params?: unknown }) => void) | undefined;
    let detachListener: ((event: { tabId: number; reason: string; sessionId?: string }) => void) | undefined;
    const transport = createTransport();
    vi.mocked(transport.onEvent).mockImplementation((listener) => {
      eventListener = listener;
      return () => {};
    });
    vi.mocked(transport.onDetach).mockImplementation((listener) => {
      detachListener = listener;
      return () => {};
    });
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');

    eventListener?.({
      tabId: 4,
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'extension-session',
        targetInfo: {
          type: 'iframe',
          targetId: 'extension-child',
          url: 'chrome-extension://other-extension/frame.html',
        },
      },
    });
    eventListener?.({
      tabId: 4,
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'page-session',
        targetInfo: {
          type: 'iframe',
          targetId: 'page-child',
          url: 'https://frames.example.test/',
        },
      },
    });

    await vi.waitFor(() => expect(manager.childSessionIds(4)).toContain('page-session'));
    expect(manager.childSessionIds(4)).not.toContain('extension-session');
    detachListener?.({ tabId: 4, reason: 'target_closed', sessionId: 'page-session' });
    expect(manager.isAttached(4)).toBe(true);
    expect(manager.childSessionIds(4)).not.toContain('page-session');
  });

  it('keeps the root attachment when Chrome omits identity for a closing child target', async () => {
    let detachListener: ((event: { tabId: number; reason: string }) => void) | undefined;
    const transport = createTransport();
    vi.mocked(transport.getTargets).mockResolvedValue([{ tabId: 4, attached: true }]);
    vi.mocked(transport.onDetach).mockImplementation((listener) => {
      detachListener = listener;
      return () => {};
    });
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');

    detachListener?.({ tabId: 4, reason: 'target_closed' });
    await vi.waitFor(() => expect(transport.getTargets).toHaveBeenCalled());

    expect(manager.isAttached(4)).toBe(true);
  });

  it('detaches only after the final lease for the tab is released', async () => {
    const transport = createTransport();
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');
    await manager.ensure(4, 'session-b');

    await manager.release(4, 'session-a');
    expect(transport.detach).not.toHaveBeenCalled();
    await manager.release(4, 'session-b');
    expect(transport.detach).toHaveBeenCalledWith(4);
  });

  it('does not let a new session attach until the prior detach completes', async () => {
    let finishDetach!: () => void;
    const detachPending = new Promise<void>((resolve) => { finishDetach = resolve; });
    const transport = createTransport();
    vi.mocked(transport.detach).mockImplementation(() => detachPending);
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');

    const releasing = manager.release(4, 'session-a');
    await vi.waitFor(() => expect(transport.detach).toHaveBeenCalledWith(4));
    const ensuring = manager.ensure(4, 'session-b');
    await Promise.resolve();

    expect(transport.attach).toHaveBeenCalledTimes(1);
    finishDetach();
    await Promise.all([releasing, ensuring]);
    expect(transport.attach).toHaveBeenCalledTimes(2);
    expect(manager.isAttached(4)).toBe(true);
  });

  it('detaches suspect attachments after a command timeout', async () => {
    const transport = createTransport();
    const manager = new AttachmentManager(transport);
    await manager.ensure(4, 'session-a');

    await manager.markSuspect(4);

    expect(transport.detach).toHaveBeenCalledWith(4);
    expect(manager.isAttached(4)).toBe(false);
  });
});
