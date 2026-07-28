import { describe, expect, it, vi } from 'vitest';
import { DebuggerTransport, DebuggerTransportError } from '@/lib/agent-tools/browser-control/driver/cdp/debugger-transport';

function createApi() {
  const onEventListeners = new Set<(tabId: number, method: string, params?: unknown, sessionId?: string) => void>();
  const onDetachListeners = new Set<(tabId: number, reason: string, sessionId?: string) => void>();
  return {
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
    sendCommand: vi.fn(async () => ({ frameTree: { frame: { id: 'root' } } })),
    getTargets: vi.fn(async () => []),
    onEvent: {
      addListener(listener: (tabId: number, method: string, params?: unknown, sessionId?: string) => void) {
        onEventListeners.add(listener);
      },
      removeListener(listener: (tabId: number, method: string, params?: unknown, sessionId?: string) => void) {
        onEventListeners.delete(listener);
      },
      emit(tabId: number, method: string, params?: unknown, sessionId?: string) {
        for (const listener of onEventListeners) listener(tabId, method, params, sessionId);
      },
    },
    onDetach: {
      addListener(listener: (tabId: number, reason: string, sessionId?: string) => void) {
        onDetachListeners.add(listener);
      },
      removeListener(listener: (tabId: number, reason: string, sessionId?: string) => void) {
        onDetachListeners.delete(listener);
      },
      emit(tabId: number, reason: string, sessionId?: string) {
        for (const listener of onDetachListeners) listener(tabId, reason, sessionId);
      },
    },
  };
}

describe('DebuggerTransport', () => {
  it('uses a single typed wrapper for attach, commands, and detach', async () => {
    const api = createApi();
    const transport = new DebuggerTransport(api);

    await transport.attach(7);
    const frameTree = await transport.send<{ frameTree: { frame: { id: string } } }>(7, 'Page.getFrameTree');
    await transport.detach(7);

    expect(api.attach).toHaveBeenCalledWith(7, '1.3');
    expect(api.sendCommand).toHaveBeenCalledWith(7, 'Page.getFrameTree', undefined, undefined);
    expect(frameTree.frameTree.frame.id).toBe('root');
    expect(api.detach).toHaveBeenCalledWith(7);
  });

  it('routes root and child-session events through one listener surface', () => {
    const api = createApi();
    const transport = new DebuggerTransport(api);
    const event = vi.fn();
    transport.onEvent(event);

    api.onEvent.emit(7, 'Target.attachedToTarget', { sessionId: 'child-1' }, 'root-session');

    expect(event).toHaveBeenCalledWith({ tabId: 7, method: 'Target.attachedToTarget', params: { sessionId: 'child-1' }, sessionId: 'root-session' });
  });

  it('preserves child-session identity on debugger detach events', () => {
    const api = createApi();
    const transport = new DebuggerTransport(api);
    const detach = vi.fn();
    transport.onDetach(detach);

    api.onDetach.emit(7, 'target_closed', 'child-session');

    expect(detach).toHaveBeenCalledWith({
      tabId: 7,
      reason: 'target_closed',
      sessionId: 'child-session',
    });
  });

  it('keeps child CDP session routing out of command parameters', async () => {
    const api = createApi();
    const transport = new DebuggerTransport(api);

    await transport.send(7, 'Runtime.evaluate', { expression: '1 + 1' }, 'child-session');

    expect(api.sendCommand).toHaveBeenCalledWith(7, 'Runtime.evaluate', { expression: '1 + 1' }, 'child-session');
  });

  it('marks a timed-out command as suspect and returns a structured timeout', async () => {
    vi.useFakeTimers();
    const api = createApi();
    api.sendCommand.mockImplementation(() => new Promise(() => {}));
    const suspect = vi.fn();
    const transport = new DebuggerTransport(api, { commandTimeoutMs: 25, onSuspect: suspect });
    const pending = transport.send(7, 'Page.getFrameTree');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(suspect).toHaveBeenCalledWith(7);
    vi.useRealTimers();
  });

  it('normalizes the competing-debugger failure', async () => {
    const api = createApi();
    api.attach.mockRejectedValue(new Error('Another debugger is already attached to the tab'));
    const transport = new DebuggerTransport(api);

    await expect(transport.attach(7)).rejects.toThrow(/another debugger/i);
  });

  it('preserves a CDP command rejection instead of calling it a detached debugger', async () => {
    const api = createApi();
    api.sendCommand.mockRejectedValue(new Error('No node with given id found'));
    const transport = new DebuggerTransport(api);

    await expect(transport.send(7, 'DOM.getBoxModel', { backendNodeId: 3 }))
      .rejects.toThrow(/No node with given id found/);
  });
});
