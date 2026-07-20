import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

/** Tab management tools. All results are structured; failures return `{ error }`. */
export function tabsTools(driver: BrowserDriver): Record<string, Tool> {
  return {
    list_tabs: tool({
      description:
        'List the open browser tabs (id, index, title, url, which is active, ' +
        'and which one browser-control actions currently target).',
      inputSchema: z.object({}),
      execute: async () => ({ tabs: await driver.listTabs() }),
    }),

    select_tab: tool({
      description:
        'Choose which tab browser-control acts on. Pass a tab id from list_tabs. ' +
        'Subsequent navigate/snapshot/click/etc. target this tab until changed.',
      inputSchema: z.object({
        tabId: z.number().describe('Tab id from list_tabs.'),
      }),
      execute: async ({ tabId }) => driver.setTargetTab(tabId),
    }),

    new_tab: tool({
      description:
        'Open a new browser tab and make it the target. Optionally load a URL.',
      inputSchema: z.object({
        url: z.string().optional().describe('URL to open (optional).'),
      }),
      execute: async ({ url }) => driver.newTab(url),
    }),

    close_tab: tool({
      description:
        'Close a tab by id (defaults to the target tab). Refuses to close the ' +
        'last remaining tab.',
      inputSchema: z.object({
        tabId: z.number().optional().describe('Tab id to close (optional).'),
      }),
      execute: async ({ tabId }) => driver.closeTab(tabId),
    }),
  };
}
