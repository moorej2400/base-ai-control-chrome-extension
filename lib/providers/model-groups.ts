import { storageGet, storageSet } from '../storage/chrome-storage';
import type { ModelInfo, ModelPriceInfo } from './types';

const CONTEXT_KEY = 'settings.contextByFamily';

export interface ModelGroup {
  family: string;
  /** Friendly name with any "(1M context)" suffix removed. */
  label: string;
  supportsToolCalls: boolean;
  /** Context-size variants, ascending by context window. */
  variants: ModelInfo[];
}

/** Groups context-size variants of the same model under one family. */
export function groupModels(models: ModelInfo[]): ModelGroup[] {
  const byFamily = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const arr = byFamily.get(m.family) ?? [];
    arr.push(m);
    byFamily.set(m.family, arr);
  }

  const groups: ModelGroup[] = [];
  for (const [family, variants] of byFamily) {
    variants.sort((a, b) => (a.contextWindow ?? 0) - (b.contextWindow ?? 0));
    const labelVariant =
      variants.find((variant) => variant.id === family) ?? variants[0];
    groups.push({
      family,
      label: cleanLabel(labelVariant.label, family),
      supportsToolCalls: variants.some((v) => v.supportsToolCalls),
      variants,
    });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

function cleanLabel(label: string, family: string): string {
  const stripped = label.replace(/\s*\([^)]*context[^)]*\)\s*$/i, '').trim();
  return stripped || family;
}

/** family -> chosen variant id. */
export async function getContextChoices(): Promise<Record<string, string>> {
  return (await storageGet<Record<string, string>>(CONTEXT_KEY)) ?? {};
}

export async function setContextChoice(
  family: string,
  variantId: string,
): Promise<void> {
  const choices = await getContextChoices();
  choices[family] = variantId;
  await storageSet(CONTEXT_KEY, choices);
}

/** The variant to use for a group, honoring the saved choice (default: smallest context). */
export function resolveVariant(
  group: ModelGroup,
  choices: Record<string, string>,
): ModelInfo {
  const chosenId = choices[group.family];
  return (
    group.variants.find((v) => modelVariantKey(v) === chosenId) ??
    group.variants[0]
  );
}

export function modelVariantKey(model: ModelInfo): string {
  return model.variantId ?? model.id;
}

export function formatContext(tokens?: number): string {
  if (!tokens) return '—';
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

export function formatPricePreview(price?: ModelPriceInfo): string {
  if (price?.inputPrice === undefined && price?.outputPrice === undefined) {
    return 'Rates unavailable';
  }
  return `${formatCopilotCreditsAsUsd(price.inputPrice)} / ${formatCopilotCreditsAsUsd(price.outputPrice)}`;
}

export function formatPriceTooltip(price?: ModelPriceInfo): string {
  if (!price) return 'Copilot did not return token pricing for this model.';
  const lines = [
    `Input: ${formatCopilotCreditsAsUsd(price.inputPrice)}`,
    `Output: ${formatCopilotCreditsAsUsd(price.outputPrice)}`,
  ];
  if (price.cacheReadPrice !== undefined) {
    lines.push(`Cache read: ${formatCopilotCreditsAsUsd(price.cacheReadPrice)}`);
  }
  if (price.cacheWritePrice !== undefined) {
    lines.push(`Cache write: ${formatCopilotCreditsAsUsd(price.cacheWritePrice)}`);
  }
  return lines.join('\n');
}

function formatCopilotCreditsAsUsd(value?: number): string {
  if (value === undefined) return '—';
  // Copilot returns token prices in credits; 1 credit is 1 cent.
  return `$${Math.round(value / 100).toLocaleString('en-US')}`;
}
