import { resolveVariant, type ModelGroup } from '@/lib/providers/model-groups';
import { fmtContext } from './usage';

// Shared model-picker helpers used by both the composer's model popup and the
// Settings "Default model" screen. Models can come from several connected
// providers (Copilot + any custom OpenAI-compatible endpoints); each item is
// tagged with its providerId so selecting one also switches the chat's provider.
// The Copilot catalog has no vendor field, so we derive the vendor (and its dot
// hue) from the model label.

/** Storage keys for the sticky/default model shown in new chats. */
export const DEFAULT_FAMILY_KEY = 'settings.defaultFamily';
/** Friendly label mirror of the above, so screens can render it without
 *  re-fetching the whole catalog. */
export const DEFAULT_FAMILY_LABEL_KEY = 'settings.defaultFamilyLabel';
/** Provider id backing the default model (defaults to Copilot). */
export const DEFAULT_PROVIDER_KEY = 'settings.defaultProvider';

export const VENDOR_ORDER = ['Anthropic', 'OpenAI', 'Google', 'xAI', 'Other'] as const;

export function vendorOf(label: string): { vendor: string; hue: number } {
  const l = label.toLowerCase();
  if (/claude|sonnet|opus|haiku/.test(l)) return { vendor: 'Anthropic', hue: 300 };
  if (/gpt|\bo1\b|\bo3\b|\bo4\b|openai/.test(l)) return { vendor: 'OpenAI', hue: 150 };
  if (/gemini|google|gemma/.test(l)) return { vendor: 'Google', hue: 240 };
  if (/grok/.test(l)) return { vendor: 'xAI', hue: 25 };
  return { vendor: 'Other', hue: 190 };
}

/** One connected provider's grouped model catalog. */
export interface ProviderGroups {
  providerId: string;
  providerLabel: string;
  isCopilot: boolean;
  groups: ModelGroup[];
}

export interface ModelMenuItem {
  providerId: string;
  providerLabel: string;
  family: string;
  label: string;
  vendor: string;
  hue: number;
  /** True for the first item of each section (used to draw a divider/header). */
  firstInVendor: boolean;
  /** Section header: vendor name (single Copilot list) or provider label. */
  section: string;
  /** e.g. "200K context" — the resolved variant's window (blank if unknown). */
  sub: string;
}

/**
 * Flatten every connected provider's model families into one picker list.
 *
 * - A single Copilot catalog is sectioned by vendor (Anthropic/OpenAI/…),
 *   preserving the original single-provider UX.
 * - Otherwise items are sectioned by provider, so Ollama/OpenAI/etc. models sit
 *   under their own headers.
 */
export function buildModelItems(
  providerGroups: ProviderGroups[],
  choices: Record<string, string>,
): ModelMenuItem[] {
  const multiProvider = providerGroups.length > 1;
  const onlyCopilot =
    providerGroups.length === 1 && providerGroups[0].isCopilot;

  const flat = providerGroups.flatMap((pg) =>
    pg.groups.map((group) => ({
      providerId: pg.providerId,
      providerLabel: pg.providerLabel,
      isCopilot: pg.isCopilot,
      group,
      ...vendorOf(group.label),
    })),
  );

  if (onlyCopilot) {
    flat.sort((a, b) => {
      const va = VENDOR_ORDER.indexOf(a.vendor as (typeof VENDOR_ORDER)[number]);
      const vb = VENDOR_ORDER.indexOf(b.vendor as (typeof VENDOR_ORDER)[number]);
      if (va !== vb) return va - vb;
      return a.group.label.localeCompare(b.group.label);
    });
  } else {
    // Keep provider order (Copilot first, then custom as configured); sort
    // families within a provider by label.
    const order = new Map(providerGroups.map((pg, i) => [pg.providerId, i]));
    flat.sort((a, b) => {
      const pa = order.get(a.providerId) ?? 0;
      const pb = order.get(b.providerId) ?? 0;
      if (pa !== pb) return pa - pb;
      return a.group.label.localeCompare(b.group.label);
    });
  }

  return flat.map((w, i) => {
    const section = multiProvider || !onlyCopilot ? w.providerLabel : w.vendor;
    const prev = flat[i - 1];
    const prevSection = prev
      ? multiProvider || !onlyCopilot
        ? prev.providerLabel
        : prev.vendor
      : null;
    const cw = resolveVariant(w.group, choices).contextWindow;
    return {
      providerId: w.providerId,
      providerLabel: w.providerLabel,
      family: w.group.family,
      label: w.group.label,
      vendor: w.vendor,
      hue: w.hue,
      firstInVendor: i === 0 || prevSection !== section,
      section,
      sub: cw ? `${fmtContext(cw)} context` : '',
    };
  });
}
