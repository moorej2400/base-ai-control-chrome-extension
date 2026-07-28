import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bridgePaths } from '../src/ipc/paths.js';
import { BridgeRegistry } from '../src/ipc/registry.js';
import { NativeFrameDecoder } from '../src/native/frame-codec.js';
import { runBridgeNativeHost } from '../src/native/native-host.js';

describe('bridge native-host startup', () => {
  it('registers its private IPC instance when Chrome launches the host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-page-chat-native-host-'));
    const paths = bridgePaths(root);
    const input = new EventEmitter();
    const writes: Uint8Array[] = [];
    const output = {
      write(chunk: Uint8Array) {
        writes.push(chunk);
        return true;
      },
    };

    try {
      await (runBridgeNativeHost as (options: unknown) => Promise<void>)({
        input,
        output,
        paths,
        createInstanceId: () => 'instance-1',
        createToken: () => 'token-1',
        pid: process.pid,
      });

      await expect(new BridgeRegistry(paths).select('instance-1')).resolves.toMatchObject({
        id: 'instance-1',
        token: 'token-1',
      });
      const frames = new NativeFrameDecoder().push(Buffer.concat(writes));
      expect(frames).toContainEqual({ type: 'ready', protocolVersion: 1 });
    } finally {
      input.emit('end');
    }
  });
});
