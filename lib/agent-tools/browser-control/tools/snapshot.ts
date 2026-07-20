import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

/**
 * The snapshot tool — the entry point for every interaction. It returns a list
 * of interactive elements each tagged with a `uid`; click/fill/etc. then act by
 * uid. uids are only valid until the next snapshot or a page change.
 */
export function snapshotTools(driver: BrowserDriver): Record<string, Tool> {
  return {
    take_snapshot: tool({
      description:
        'Capture the current page as a list of interactive elements, each with ' +
        'a stable uid (e.g. "e3_12"), plus the visible headings for context. ' +
        'Call this before clicking/filling, and again after the page changes — ' +
        'uids from an old snapshot stop working once the page updates.',
      inputSchema: z.object({
        mode: z
          .enum(['interactive', 'full'])
          .optional()
          .describe(
            'interactive (default): actionable elements only. full: include ' +
              'more elements when the page is large.',
          ),
      }),
      execute: async ({ mode }) => driver.snapshot({ mode }),
    }),
  };
}
