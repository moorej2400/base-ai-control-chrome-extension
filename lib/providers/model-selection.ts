import { getProvider } from './registry';

const ECONOMICAL_MODEL_HINTS = [
  'mini',
  'nano',
  'flash',
  'haiku',
  'small',
  'fast',
];

/**
 * Picks a bounded-cost utility model for background chores such as summaries
 * and titles. If Copilot's model catalog drifts, falling back to the user's
 * selected model is safer than guessing an unavailable id.
 */
export async function selectEconomicalModelId(
  providerId: string,
  fallbackModelId: string,
): Promise<string> {
  const models = await getProvider(providerId).listModels().catch(() => []);
  const candidates = models.filter((m) =>
    ECONOMICAL_MODEL_HINTS.some((hint) => m.id.toLowerCase().includes(hint)),
  );
  candidates.sort((a, b) => (a.contextWindow ?? Infinity) - (b.contextWindow ?? Infinity));
  return candidates[0]?.id ?? fallbackModelId;
}
