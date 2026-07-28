import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BridgeRegistry, InstanceSelectionError } from '../src/ipc/registry.js';
import { bridgePaths } from '../src/ipc/paths.js';

async function registry() {
  const root = await mkdtemp(join(tmpdir(), 'ai-page-chat-bridge-test-'));
  return new BridgeRegistry(bridgePaths(root));
}

describe('bridge instance registry', () => {
  it('keeps entries owner-scoped and ignores stale heartbeats', async () => {
    const store = await registry();
    await store.register({ id: 'active', pid: process.pid, socketPath: '/tmp/active.sock', token: 'a', heartbeatAt: Date.now() });
    await store.register({ id: 'stale', pid: 999999, socketPath: '/tmp/stale.sock', token: 'b', heartbeatAt: Date.now() - 61_000 });
    await expect(store.healthy()).resolves.toEqual([expect.objectContaining({ id: 'active' })]);
  });

  it('requires explicit instance selection when more than one is healthy', async () => {
    const store = await registry();
    await store.register({ id: 'one', pid: process.pid, socketPath: '/tmp/one.sock', token: 'a', heartbeatAt: Date.now() });
    await store.register({ id: 'two', pid: process.pid, socketPath: '/tmp/two.sock', token: 'b', heartbeatAt: Date.now() });
    await expect(store.select()).rejects.toBeInstanceOf(InstanceSelectionError);
    await expect(store.select('two')).resolves.toMatchObject({ id: 'two' });
  });

  it('unregisters a disconnected native-host instance immediately', async () => {
    const store = await registry();
    await store.register({ id: 'closed', pid: process.pid, socketPath: '/tmp/closed.sock', token: 'a', heartbeatAt: Date.now() });

    await store.unregister('closed');

    await expect(store.select('closed')).rejects.toBeInstanceOf(InstanceSelectionError);
  });
});
