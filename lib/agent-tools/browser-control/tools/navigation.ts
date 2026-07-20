import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

/** Navigation + waiting tools for the target tab. */
export function navigationTools(driver: BrowserDriver): Record<string, Tool> {
  return {
    navigate_page: tool({
      description:
        'Navigate the target tab to a URL and wait for it to finish loading. ' +
        'A bare host like "example.com" is treated as https://.',
      inputSchema: z.object({
        url: z.string().describe('Destination URL.'),
      }),
      execute: async ({ url }) => driver.navigate(url),
    }),

    navigate_history: tool({
      description:
        'Go back or forward in the target tab\'s history and wait for load.',
      inputSchema: z.object({
        direction: z.enum(['back', 'forward']),
      }),
      execute: async ({ direction }) => driver.navigateHistory(direction),
    }),

    wait_for: tool({
      description:
        'Wait until text appears on the page and/or a CSS selector matches, up ' +
        'to a timeout. Use after an action that triggers async loading before ' +
        'taking a new snapshot. Returns whether the condition was met.',
      inputSchema: z.object({
        text: z
          .string()
          .optional()
          .describe('Substring expected to appear in the page text.'),
        selector: z
          .string()
          .optional()
          .describe('CSS selector expected to match an element.'),
        timeoutMs: z
          .number()
          .optional()
          .describe('Max wait in ms (default 5000, max 30000).'),
      }),
      execute: async (cond) => driver.waitFor(cond),
    }),
  };
}
