import { describe, expect, it, vi } from 'vitest';
import { RecoveryManager } from '../../../lib/agent-tools/browser-control/background/recovery';
import { MemorySessionStorage, SessionStore } from '../../../lib/agent-tools/browser-control/background/session-store';
import { TabLeaseStore } from '../../../lib/agent-tools/browser-control/background/tab-leases';

describe('RecoveryManager', () => {
  it('orphans restored sessions and leases before scheduling expiry', async () => {
    const sessions = new SessionStore({
      storage: new MemorySessionStorage(),
      now: () => 100,
      createId: () => 'session-1',
      createToken: () => 'token',
      hashToken: async () => 'hash',
    });
    const created = await sessions.start('mcp', 'connection-1');
    const leases = new TabLeaseStore(() => 100);
    leases.claim(4, { sessionId: created.browserSessionId, origin: 'mcp', label: 'Codex' });
    const scheduleExpiry = vi.fn().mockResolvedValue(undefined);
    const manager = new RecoveryManager({ sessions, leases, scheduleExpiry });

    await manager.recover();

    expect(await sessions.get(created.browserSessionId)).toEqual(expect.objectContaining({ state: 'orphaned' }));
    expect(leases.get(4)).toEqual(expect.objectContaining({ state: 'orphaned' }));
    expect(scheduleExpiry).toHaveBeenCalledOnce();
  });
});
