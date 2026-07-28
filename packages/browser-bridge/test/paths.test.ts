import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bridgePaths } from '../src/ipc/paths.js';

describe('bridge runtime paths', () => {
  it('keeps Darwin Unix sockets below the platform path limit', () => {
    const paths = bridgePaths(undefined, 'darwin', 501);
    const socketPath = join(paths.socketDirectory, `${randomUUID()}.sock`);

    expect(Buffer.byteLength(socketPath)).toBeLessThan(104);
    expect(paths.registry).toContain('Application Support/AI Page Chat');
  });
});
