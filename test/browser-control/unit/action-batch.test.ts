import { describe, expect, it } from 'vitest';
import { executeActionBatch } from '@/lib/agent-tools/browser-control/background/action-batch';

describe('action batches', () => {
  it('preserves order and stops at first failed result or navigation', async () => {
    const calls: string[] = [];
    const result = await executeActionBatch(
      [{ type: 'fill', ref: 'a', value: 'one' }, { type: 'click', ref: 'b' }, { type: 'click', ref: 'c' }],
      async (action) => {
        calls.push(action.type);
        return action.type === 'click' ? { ok: true, navigated: true } : { ok: true, navigated: false };
      },
    );
    expect(calls).toEqual(['fill', 'click']);
    expect(result.stopped).toBe('navigated');
  });

  it('stops cleanly at a failed action boundary', async () => {
    const result = await executeActionBatch(
      [{ type: 'click', ref: 'a' }, { type: 'click', ref: 'b' }],
      async () => ({ ok: false }),
    );
    expect(result.stopped).toBe('failed');
    expect(result.results).toHaveLength(1);
  });
});
