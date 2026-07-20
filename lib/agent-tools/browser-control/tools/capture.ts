import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

type ShotOutput = { image: string; mediaType: string } | { error: string };

/**
 * Screenshot + script evaluation. Screenshot returns the image to vision-capable
 * models via `toModelOutput` (as base64 file-data); non-vision models / providers
 * that reject image tool results will error — this path MUST be validated against
 * the real Copilot API before being relied on (see BROWSER_CONTROL_PLAN.md).
 */
export function captureTools(driver: BrowserDriver): Record<string, Tool> {
  return {
    take_screenshot: tool({
      description:
        'Capture a JPEG of the target tab\'s visible viewport (needs a ' +
        'vision-capable model). This is a FALLBACK, not your default way to ' +
        'operate the browser — always prefer the direct control tools ' +
        '(take_snapshot + click/fill/etc.), which are faster, cheaper, and more ' +
        'precise. Reach for a screenshot only when those are not enough: e.g. ' +
        'the content is drawn on a <canvas>/image and is not in the DOM or ' +
        'snapshot, or the page layout keeps making click/fill fail and you need ' +
        'to see what is actually rendered.',
      inputSchema: z.object({}),
      execute: async (): Promise<ShotOutput> => {
        const res = await driver.screenshot();
        if (!res.ok) return { error: res.error };
        const comma = res.dataUrl.indexOf(',');
        const base64 = comma >= 0 ? res.dataUrl.slice(comma + 1) : res.dataUrl;
        return { image: base64, mediaType: 'image/jpeg' };
      },
      toModelOutput: ({ output }) => {
        if ('error' in output) {
          return { type: 'error-text', value: output.error };
        }
        return {
          type: 'content',
          value: [
            { type: 'text', text: 'Screenshot of the current viewport:' },
            {
              type: 'file-data',
              data: output.image,
              mediaType: output.mediaType,
            },
          ],
        };
      },
    }),

    evaluate_script: tool({
      description:
        'Run a JavaScript expression in the target page (MAIN world) and return ' +
        'its JSON-serialized result (truncated). Use only when snapshot/click/' +
        'fill cannot do it — e.g. reading a computed value or a page global.',
      inputSchema: z.object({
        expression: z
          .string()
          .describe('A JS expression, e.g. "document.title" or "location.href".'),
      }),
      execute: async ({ expression }) => driver.evaluate(expression),
    }),
  };
}
