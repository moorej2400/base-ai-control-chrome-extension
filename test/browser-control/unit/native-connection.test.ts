import { describe, expect, it, vi } from 'vitest';
import { NativeConnectionManager } from '@/lib/agent-tools/browser-control/background/native-connection';
import { PROTOCOL_VERSION } from '@ai-page-chat/browser-control-protocol';

function fakePort() {
  const messages: unknown[] = [];
  let messageListener: ((value: unknown) => void) | undefined;
  let disconnectListener: (() => void) | undefined;
  return {
    port: {
      postMessage(value: unknown) { messages.push(value); },
      onMessage: { addListener(listener: (value: unknown) => void) { messageListener = listener; }, removeListener() {} },
      onDisconnect: { addListener(listener: () => void) { disconnectListener = listener; }, removeListener() {} },
    },
    messages,
    emit(value: unknown) { messageListener?.(value); },
    disconnect() { disconnectListener?.(); },
  };
}

describe('NativeConnectionManager', () => {
  it('calls its default connection ID factory with the Crypto receiver', async () => {
    const fake = fakePort();
    const strictCrypto = {
      randomUUID() {
        if (this !== strictCrypto) throw new TypeError('Illegal invocation');
        return 'mcp-connection-1';
      },
    };
    vi.stubGlobal('crypto', strictCrypto);
    try {
      const manager = new NativeConnectionManager({ enabled: () => true, connect: () => fake.port, router: { handle: vi.fn() } });
      manager.start();
      await Promise.resolve();
      expect(manager.status()).toEqual({ state: 'connecting' });
      expect(fake.messages[0]).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
      fake.emit({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
      expect(manager.status()).toEqual({ state: 'connected' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does nothing while external control is disabled', () => {
    const connect = vi.fn();
    const manager = new NativeConnectionManager({ enabled: () => false, connect, router: { handle: vi.fn() } });
    manager.start();
    expect(connect).not.toHaveBeenCalled();
    expect(manager.status()).toEqual({ state: 'disabled' });
  });

  it('fails readiness when the native host reports a different protocol version', async () => {
    const fake = fakePort();
    const manager = new NativeConnectionManager({ enabled: () => true, connect: () => fake.port, router: { handle: vi.fn() } });
    manager.start();
    await Promise.resolve();

    fake.emit({ type: 'ready', protocolVersion: PROTOCOL_VERSION + 1 });

    expect(manager.status()).toEqual({ state: 'offline', error: 'Native host protocol version mismatch.' });
  });

  it('negotiates then forwards bounded native requests to the same router', async () => {
    const fake = fakePort();
    const router = { handle: vi.fn(async () => ({ protocolVersion: PROTOCOL_VERSION, requestId: 'r1', ok: true, result: { ok: true } })) };
    const manager = new NativeConnectionManager({ enabled: () => true, connect: () => fake.port, router });
    manager.start();
    await Promise.resolve();
    expect(fake.messages[0]).toEqual({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
    fake.emit({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
    fake.emit({ protocolVersion: PROTOCOL_VERSION, requestId: 'r1', command: { type: 'browser.status' } });
    await Promise.resolve();
    expect(router.handle).toHaveBeenCalledWith(expect.objectContaining({ origin: 'mcp' }), expect.anything());
    expect(fake.messages.at(-1)).toMatchObject({ requestId: 'r1', ok: true });
  });

  it('rejects native messages above 256 KiB before the router sees them', async () => {
    const fake = fakePort();
    const router = { handle: vi.fn() };
    const manager = new NativeConnectionManager({ enabled: () => true, connect: () => fake.port, router });
    manager.start();
    await Promise.resolve();
    fake.emit({ data: 'x'.repeat(256 * 1024) });
    await Promise.resolve();
    expect(router.handle).not.toHaveBeenCalled();
    expect(fake.messages.at(-1)).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('reconnects with backoff after the native host drops', () => {
    vi.useFakeTimers();
    const first = fakePort();
    const second = fakePort();
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port);
    const manager = new NativeConnectionManager({ enabled: () => true, connect, router: { handle: vi.fn() } });
    manager.start();
    first.disconnect();
    vi.advanceTimersByTime(500);

    expect(connect).toHaveBeenCalledTimes(2);
    second.emit({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
    expect(manager.status()).toEqual({ state: 'connected' });
    vi.useRealTimers();
  });
});
