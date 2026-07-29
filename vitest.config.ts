import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: [
      'test/chat/**/*.test.ts',
      'test/browser-control/unit/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    environment: 'node',
  },
});
