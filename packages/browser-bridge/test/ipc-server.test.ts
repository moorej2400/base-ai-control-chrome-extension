import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IpcClient } from '../src/ipc/client.js';
import { IpcServer } from '../src/ipc/server.js';

describe('private IPC server', () => {
  it('routes only authenticated requests over a local socket', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-page-chat-ipc-'));
    const socketPath = join(root, 'bridge.sock');
    const server = new IpcServer({ socketPath, token: 'secret', protocolVersion: 1, handle: async (value) => ({ echo: value }) });
    await server.listen();
    const client = new IpcClient({ socketPath, token: 'secret', protocolVersion: 1 });
    await expect(client.request({ command: 'status' })).resolves.toEqual({ echo: { command: 'status' } });
    await client.close();
    await server.close();
  });

  it('rejects a bad bearer token before routing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-page-chat-ipc-'));
    const socketPath = join(root, 'bridge.sock');
    const seen: unknown[] = [];
    const server = new IpcServer({ socketPath, token: 'secret', protocolVersion: 1, handle: async (value) => { seen.push(value); return {}; } });
    await server.listen();
    const client = new IpcClient({ socketPath, token: 'wrong', protocolVersion: 1 });
    await expect(client.request({ command: 'status' })).rejects.toThrow(/UNAUTHORIZED/);
    expect(seen).toEqual([]);
    await client.close();
    await server.close();
  });
});
