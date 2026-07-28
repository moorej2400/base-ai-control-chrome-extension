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
      'test/browser-control/unit/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    environment: 'node',
  },
});
