import { describe, expect, it, vi } from 'vitest';
import { NativeHostRelay } from '../src/native/native-relay.js';

describe('NativeHostRelay', () => {
  it('forwards a correlated IPC envelope to Chrome and returns its exact response', async () => {
    const write = vi.fn();
    const relay = new NativeHostRelay(write);
    const pending = relay.forward({ requestId: 'r1', command: { type: 'browser.status' } });
    expect(write).toHaveBeenCalledWith({ requestId: 'r1', command: { type: 'browser.status' } });
    relay.receive({ protocolVersion: 1, requestId: 'r1', ok: true, result: { externalControl: true } });
    await expect(pending).resolves.toMatchObject({ ok: true, result: { externalControl: true } });
  });

  it('rejects outstanding IPC work when Chrome disconnects', async () => {
    const relay = new NativeHostRelay(() => {});
    const pending = relay.forward({ requestId: 'r1', command: { type: 'browser.status' } });
    relay.disconnect();
    await expect(pending).rejects.toThrow(/disconnected/i);
  });
});
