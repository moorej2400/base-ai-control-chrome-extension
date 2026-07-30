import { describe, expect, it, vi } from 'vitest';
import { bindRuntimePort, registerRuntimePortServer } from '../../../lib/agent-tools/browser-control/background/connection';
import { BROWSER_CONTROL_RUNTIME_PORT } from '../../../lib/agent-tools/browser-control/client/runtime-client';

class FakeRuntimePort {
  name = BROWSER_CONTROL_RUNTIME_PORT;
  readonly onMessage = {
    listeners: new Set<(message: unknown) => void>(),
    addListener: (listener: (message: unknown) => void) => this.onMessage.listeners.add(listener),
    removeListener: (listener: (message: unknown) => void) => this.onMessage.listeners.delete(listener),
  };
  readonly onDisconnect = {
    listeners: new Set<() => void>(),
    addListener: (listener: () => void) => this.onDisconnect.listeners.add(listener),
    removeListener: (listener: () => void) => this.onDisconnect.listeners.delete(listener),
  };
  replies: unknown[] = [];
  postMessage(message: unknown) { this.replies.push(message); }
  send(message: unknown) { for (const listener of this.onMessage.listeners) listener(message); }
}

describe('bindRuntimePort', () => {
  it('labels runtime calls as embedded and returns routed responses', async () => {
    const port = new FakeRuntimePort();
    const router = { handle: vi.fn().mockResolvedValue({ protocolVersion: 1, requestId: 'r1', ok: true, result: {} }) };
    const coordinator = { disconnect: vi.fn().mockResolvedValue(undefined) };
    bindRuntimePort(port, router, coordinator, () => 'connection-1');

    port.send({ protocolVersion: 1, requestId: 'r1', command: { type: 'session.start', origin: 'embedded' } });
    await Promise.resolve();

    expect(router.handle).toHaveBeenCalledWith(expect.objectContaining({ id: 'connection-1', origin: 'embedded' }), expect.anything());
    expect(port.replies).toEqual([expect.objectContaining({ ok: true })]);
  });

  it('binds only the browser-control runtime port', () => {
    let connect: ((port: FakeRuntimePort) => void) | undefined;
    vi.stubGlobal('chrome', {
      runtime: { onConnect: { addListener: (listener: (port: FakeRuntimePort) => void) => { connect = listener; } } },
    });
    const router = { handle: vi.fn() };
    const coordinator = { disconnect: vi.fn() };
    registerRuntimePortServer(router, coordinator);

    const runtime = new FakeRuntimePort();
    connect?.(runtime);
    expect(runtime.onMessage.listeners).toHaveLength(1);

    vi.unstubAllGlobals();
  });
});
