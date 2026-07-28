import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { BrowserDriver } from '../driver/types';

type ShotOutput = { image: string; mediaType: string } | { error: string };

/**
 * Screenshot tools plus an opt-in advanced evaluator. Screenshot returns the
 * image to vision-capable models via `toModelOutput`; provider compatibility
 * must be validated against the real Copilot API before relying on it.
 */
export function captureTools(driver: BrowserDriver, options: { allowEvaluate?: boolean } = {}): Record<string, Tool> {
  const tools: Record<string, Tool> = {
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
  };
  // Raw evaluation is deliberately absent from normal browser-control sessions.
  // The coordinator also rejects it unless both a trusted connection and an
  // explicit advanced setting enable it, so an accidental UI/tool regression
  // cannot make it a generic page-script escape hatch.
  if (options.allowEvaluate) {
    tools.evaluate_script = tool({
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
    });
  }
  return tools;
}
