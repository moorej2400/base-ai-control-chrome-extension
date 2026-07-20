import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

const UID = z
  .string()
  .describe('Element uid from the most recent take_snapshot (e.g. "e3_12").');

const STALE_NOTE =
  ' uids come from the most recent take_snapshot; if this fails as stale, ' +
  'call take_snapshot again and use a fresh uid.';

/** Interaction tools. Each acts on a uid from the latest snapshot. */
export function inputTools(driver: BrowserDriver): Record<string, Tool> {
  return {
    click: tool({
      description: 'Click an element by uid.' + STALE_NOTE,
      inputSchema: z.object({
        uid: UID,
        dblClick: z.boolean().optional().describe('Double-click instead.'),
      }),
      execute: async ({ uid, dblClick }) => driver.click(uid, { dblClick }),
    }),

    hover: tool({
      description: 'Move the pointer over an element by uid.' + STALE_NOTE,
      inputSchema: z.object({ uid: UID }),
      execute: async ({ uid }) => driver.hover(uid),
    }),

    fill: tool({
      description:
        'Set the value of a text input, textarea, select, or contenteditable ' +
        'by uid.' +
        STALE_NOTE,
      inputSchema: z.object({
        uid: UID,
        value: z.string().describe('Value to enter.'),
      }),
      execute: async ({ uid, value }) => driver.fill(uid, value),
    }),

    fill_form: tool({
      description:
        'Fill several fields in one call. Stops at the first field that fails ' +
        'so you can re-snapshot.' +
        STALE_NOTE,
      inputSchema: z.object({
        fields: z
          .array(z.object({ uid: UID, value: z.string() }))
          .describe('Fields to fill, in order.'),
      }),
      execute: async ({ fields }) => driver.fillForm(fields),
    }),

    press_key: tool({
      description:
        'Dispatch a key press (e.g. "Enter", "Escape", "Tab") to the focused ' +
        'element. Fill or click a field first to focus it.',
      inputSchema: z.object({
        key: z.string().describe('Key name, e.g. "Enter".'),
      }),
      execute: async ({ key }) => driver.pressKey(key),
    }),

    scroll_to: tool({
      description:
        'Scroll an element into view by uid (useful to reveal lazy-loaded ' +
        'content before snapshotting again).' +
        STALE_NOTE,
      inputSchema: z.object({ uid: UID }),
      execute: async ({ uid }) => driver.scrollTo(uid),
    }),
  };
}
