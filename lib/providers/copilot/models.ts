import type { ModelInfo } from '../types';
import { copilotFetch } from './copilot-fetch';

interface CopilotModelEntry {
  id: string;
  name?: string;
  vendor?: string;
  model_picker_enabled?: boolean;
  supported_endpoints?: string[];
  capabilities?: {
    type?: string;
    family?: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
    supports?: {
      tool_calls?: boolean;
      vision?: boolean;
      streaming?: boolean;
    };
  };
  billing?: {
    token_prices?: FlatTokenPrices | TieredTokenPrices;
  };
}

type ContextTier = 'default' | 'long_context';

interface FlatTokenPrices {
  input_price?: number;
  output_price?: number;
  cache_price?: number;
  cache_write_price?: number;
  batch_size?: number;
}

interface TokenPriceTier {
  context_max?: number;
  input_price?: number;
  output_price?: number;
  cache_price?: number;
  cache_write_price?: number;
}

interface TieredTokenPrices {
  batch_size?: number;
  default?: TokenPriceTier;
  long_context?: TokenPriceTier;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { promise: Promise<ModelInfo[]>; fetchedAt: number } | null = null;

export function listCopilotModels(): Promise<ModelInfo[]> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    const promise = fetchCopilotModels().catch((err) => {
      cache = null; // don't cache failures
      throw err;
    });
    cache = { promise, fetchedAt: Date.now() };
  }
  return cache.promise;
}

async function fetchCopilotModels(): Promise<ModelInfo[]> {
  const res = await copilotFetch('https://api.githubcopilot.com/models');
  if (!res.ok) {
    throw new Error(`Failed to list Copilot models (${res.status})`);
  }
  const data = await res.json();
  return parseModelEntries(data.data ?? []);
}

/**
 * Pure entry → ModelInfo mapping (no network), shared with the offline
 * scripts/copilot-probe.mjs harness so grouping can be tested against real data.
 */
export function parseModelEntries(entries: CopilotModelEntry[]): ModelInfo[] {
  const familyAliases = buildContextFamilyAliases(entries);
  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const entry of entries) {
    if (!isPickerChatEntry(entry)) continue;
    // Hide non-picker entries (embeddings, dated duplicates like
    // gpt-4o-2024-08-06 that would otherwise merge into junk family groups).
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    models.push(...toModelInfos(entry, familyAliases));
  }
  return models;
}

function toModelInfos(
  entry: CopilotModelEntry,
  familyAliases: ReadonlyMap<string, string>,
): ModelInfo[] {
  const caps = entry.capabilities;
  const family = familyAliases.get(rawFamily(entry)) ?? rawFamily(entry);
  const base: Omit<ModelInfo, 'contextWindow' | 'variantId' | 'contextTier'> = {
    id: entry.id,
    label: entry.name ?? entry.id,
    family,
    maxOutputTokens: caps?.limits?.max_output_tokens,
    supportedEndpoints: entry.supported_endpoints,
    supportsToolCalls: caps?.supports?.tool_calls ?? false,
    supportsVision: caps?.supports?.vision ?? false,
  };
  const tieredVariants = contextTierVariants(entry);
  if (tieredVariants.length === 0) {
    return [
      {
        ...base,
        contextWindow: caps?.limits?.max_context_window_tokens,
        price: modelPrice(entry),
      },
    ];
  }
  return tieredVariants.map((variant) => ({
    ...base,
    variantId: `${entry.id}#${variant.contextTier}`,
    contextTier: variant.contextTier,
    contextWindow: variant.contextWindow,
    price: modelPrice(entry, variant.contextTier),
  }));
}

function contextTierVariants(
  entry: CopilotModelEntry,
): Array<{ contextTier: ContextTier; contextWindow: number }> {
  const prices = entry.billing?.token_prices;
  if (!isTieredTokenPrices(prices)) return [];
  const maxOutputTokens = entry.capabilities?.limits?.max_output_tokens ?? 0;
  const variants: Array<{ contextTier: ContextTier; contextWindow: number }> = [];
  for (const contextTier of ['default', 'long_context'] as const) {
    const promptBudget = prices[contextTier]?.context_max;
    if (!promptBudget) continue;
    // Copilot reports tier context_max as a prompt budget; the user-facing
    // context window includes the output reserve, matching Copilot CLI.
    variants.push({
      contextTier,
      contextWindow: promptBudget + maxOutputTokens,
    });
  }
  return variants;
}

function isTieredTokenPrices(
  prices: FlatTokenPrices | TieredTokenPrices | undefined,
): prices is TieredTokenPrices {
  return !!prices && 'default' in prices;
}

function modelPrice(entry: CopilotModelEntry, tier?: ContextTier) {
  const prices = entry.billing?.token_prices;
  if (!prices) return undefined;
  const price = isTieredTokenPrices(prices) ? prices[tier ?? 'default'] : prices;
  if (!price) return undefined;
  return {
    batchSize: prices.batch_size,
    inputPrice: price.input_price,
    outputPrice: price.output_price,
    cacheReadPrice: price.cache_price,
    cacheWritePrice: price.cache_write_price,
  };
}

function isPickerChatEntry(entry: CopilotModelEntry): boolean {
  const caps = entry.capabilities;
  if (caps?.type && caps.type !== 'chat') return false;
  return entry.model_picker_enabled !== false;
}

function rawFamily(entry: CopilotModelEntry): string {
  return entry.capabilities?.family ?? entry.id.replace(/-1m(-internal)?$/i, '');
}

interface PickerChatModel {
  rawFamily: string;
  vendor?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsToolCalls: boolean;
  supportsVision: boolean;
  hasContextVariantMarker: boolean;
}

function buildContextFamilyAliases(
  entries: CopilotModelEntry[],
): ReadonlyMap<string, string> {
  const pickerModels = entries.filter(isPickerChatEntry).map(toPickerChatModel);
  const alias = new Map<string, string>();
  for (const model of pickerModels) {
    // Copilot sometimes reports context variants as suffixed families; only
    // fold them when a picker-visible base sibling has the same capability shape.
    const base = findContextVariantBase(model, pickerModels);
    if (base) alias.set(model.rawFamily, base.rawFamily);
  }
  return alias;
}

function toPickerChatModel(entry: CopilotModelEntry): PickerChatModel {
  const caps = entry.capabilities;
  const family = rawFamily(entry);
  return {
    rawFamily: family,
    vendor: entry.vendor,
    contextWindow: caps?.limits?.max_context_window_tokens,
    maxOutputTokens: caps?.limits?.max_output_tokens,
    supportsToolCalls: caps?.supports?.tool_calls ?? false,
    supportsVision: caps?.supports?.vision ?? false,
    hasContextVariantMarker: hasContextVariantMarker(family, entry.id, entry.name),
  };
}

function findContextVariantBase(
  model: PickerChatModel,
  pickerModels: PickerChatModel[],
): PickerChatModel | undefined {
  if (!model.hasContextVariantMarker) return undefined;
  const family = model.rawFamily.toLowerCase();
  return pickerModels
    .filter((candidate) => candidate.rawFamily !== model.rawFamily)
    .filter((candidate) => hasFamilyVariantSuffix(family, candidate.rawFamily.toLowerCase()))
    .filter((candidate) => hasMatchingContextVariantShape(model, candidate))
    .sort((a, b) => b.rawFamily.length - a.rawFamily.length)[0];
}

function hasFamilyVariantSuffix(family: string, baseFamily: string): boolean {
  if (!family.startsWith(baseFamily)) return false;
  return /^[-_.\s(]/.test(family.slice(baseFamily.length));
}

function hasContextVariantMarker(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => {
    if (!part) return false;
    return /(^|[-_.\s(])(?:1m|long|context)(?:$|[-_.\s)])/i.test(part);
  });
}

function hasMatchingContextVariantShape(
  model: PickerChatModel,
  candidate: PickerChatModel,
): boolean {
  if (model.vendor && candidate.vendor && model.vendor !== candidate.vendor) return false;
  if (!model.contextWindow || !candidate.contextWindow) return false;
  if (model.contextWindow === candidate.contextWindow) return false;
  if (
    model.maxOutputTokens &&
    candidate.maxOutputTokens &&
    model.maxOutputTokens !== candidate.maxOutputTokens
  ) {
    return false;
  }
  if (model.supportsToolCalls !== candidate.supportsToolCalls) return false;
  if (model.supportsVision !== candidate.supportsVision) return false;
  return true;
}
