import { describe, expect, it } from 'vitest';
import { MemorySessionStorage, SessionStore } from '../../../lib/agent-tools/browser-control/background/session-store';

describe('SessionStore', () => {
  it('stores only a resume-token hash and returns a unique plaintext token once', async () => {
    const storage = new MemorySessionStorage();
    const ids = ['session-1', 'session-2'];
    const store = new SessionStore({
      storage,
      now: () => 100,
      createId: () => ids.shift()!,
      createToken: () => 'plaintext-token',
      hashToken: async (token) => `hash:${token}`,
    });

    const first = await store.start('embedded', 'connection-1');
    const second = await store.start('embedded', 'connection-2');

    expect(first).toEqual({ browserSessionId: 'session-1', resumeToken: 'plaintext-token' });
    expect(second.browserSessionId).toBe('session-2');
    expect(await storage.get('browser-control:sessions')).toEqual([
      expect.objectContaining({ id: 'session-1', resumeTokenHash: 'hash:plaintext-token' }),
      expect.objectContaining({ id: 'session-2', resumeTokenHash: 'hash:plaintext-token' }),
    ]);
    expect(JSON.stringify(await storage.get('browser-control:sessions'))).not.toContain('"plaintext-token"');
  });

  it('resumes an orphan only before its origin-specific deadline', async () => {
    let now = 100;
    const store = new SessionStore({
      storage: new MemorySessionStorage(),
      now: () => now,
      createId: () => 'session-1',
      createToken: () => 'plaintext-token',
      hashToken: async (token) => `hash:${token}`,
    });
    const { browserSessionId } = await store.start('embedded', 'connection-1');

    await store.orphanAll();
    now = 15_099;
    await expect(store.resume(browserSessionId, 'plaintext-token', 'connection-2', 'embedded')).resolves.toEqual(
      expect.objectContaining({ id: browserSessionId, state: 'active' }),
    );

    await store.orphanAll();
    now = 30_101;
    await expect(store.resume(browserSessionId, 'plaintext-token', 'connection-3', 'embedded')).rejects.toMatchObject({
      code: 'SESSION_RESUME_FAILED',
    });
  });

  it('does not let an MCP connection resume an embedded browser session', async () => {
    const store = new SessionStore({
      storage: new MemorySessionStorage(), createId: () => 'session-1', createToken: () => 'token', hashToken: async () => 'hash',
    });
    const { browserSessionId } = await store.start('embedded', 'embedded-connection');
    await store.orphanAll();

    await expect(store.resume(browserSessionId, 'token', 'mcp-connection', 'mcp')).rejects.toMatchObject({
      code: 'SESSION_RESUME_FAILED',
    });
  });

});
