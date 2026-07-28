import { describe, expect, it } from 'vitest';
import { createHandshake, verifyHandshake } from '../src/ipc/handshake.js';

describe('private IPC handshake', () => {
  it('validates the bearer token and protocol version before routing any request', () => {
    const hello = createHandshake('secret', 1);
    expect(verifyHandshake(hello, 'secret', 1)).toEqual({ ok: true });
    expect(verifyHandshake(hello, 'wrong', 1)).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(verifyHandshake(hello, 'secret', 2)).toEqual({ ok: false, error: 'PROTOCOL_MISMATCH' });
  });
});
