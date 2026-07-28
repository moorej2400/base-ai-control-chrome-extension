export interface BridgeHandshake { type: 'hello'; protocolVersion: number; token: string }
export function createHandshake(token: string, protocolVersion: number): BridgeHandshake { return { type: 'hello', token, protocolVersion }; }
export function verifyHandshake(value: unknown, token: string, protocolVersion: number): { ok: true } | { ok: false; error: 'UNAUTHORIZED' | 'PROTOCOL_MISMATCH' } {
  if (!value || typeof value !== 'object' || (value as Partial<BridgeHandshake>).type !== 'hello' || (value as Partial<BridgeHandshake>).token !== token) return { ok: false, error: 'UNAUTHORIZED' };
  return (value as Partial<BridgeHandshake>).protocolVersion === protocolVersion ? { ok: true } : { ok: false, error: 'PROTOCOL_MISMATCH' };
}
