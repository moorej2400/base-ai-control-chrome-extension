export type BatchAction = { type: string; [key: string]: unknown };
export type BatchActionResult = { ok: boolean; navigated?: boolean; code?: string; [key: string]: unknown };

export async function executeActionBatch(
  actions: BatchAction[],
  execute: (action: BatchAction) => Promise<BatchActionResult>,
): Promise<{ ok: true; results: BatchActionResult[]; stopped: 'completed' | 'failed' | 'navigated' | 'approval' }> {
  const results: BatchActionResult[] = [];
  for (const action of actions) {
    const result = await execute(action);
    results.push(result);
    if (result.code === 'ACTION_REQUIRES_APPROVAL') return { ok: true, results, stopped: 'approval' };
    if (!result.ok) return { ok: true, results, stopped: 'failed' };
    if (result.navigated) return { ok: true, results, stopped: 'navigated' };
  }
  return { ok: true, results, stopped: 'completed' };
}
