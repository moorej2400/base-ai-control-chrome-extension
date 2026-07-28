import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  // The installer copies every JavaScript asset in dist, so old hashed chunks
  // must not survive a build after their imports or dependency policy changes.
  clean: true,
  // The installer copies only dist into a user-scoped runtime. Keep MCP's
  // runtime dependencies in that bundle instead of relying on this workspace.
  noExternal: [
    '@ai-page-chat/browser-control-protocol',
    '@modelcontextprotocol/sdk',
    'zod',
  ],
});
