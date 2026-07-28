import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = join(import.meta.dirname, '..', 'dist');

describe('browser bridge distribution', () => {
  it('bundles MCP runtime dependencies so a user-scoped installation has no workspace node_modules dependency', async () => {
    const files = await readdir(DIST);
    const sources = await Promise.all(files
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFile(join(DIST, file), 'utf8')));

    const imports = sources.flatMap((source) => source.split(/\r?\n/));
    expect(imports).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/^\s*import\b.*?from\s+["'](?:@ai-page-chat\/browser-control-protocol|@modelcontextprotocol\/sdk|zod)(?:\/[^"']*)?["']/),
    ]));
  });
});
