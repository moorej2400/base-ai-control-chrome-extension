import type { AppUIMessage } from '@/lib/chat/app-message';
import type { ModelInfo } from '@/lib/providers/types';
import type { SessionUsage } from '@/lib/storage/usage-store';

// Usage accounting for the composer's usage panel.
//
// Once a turn completes, the transport records MEASURED token usage per session
// (usage-store.ts), and `usageFromReal` renders that. Before the first measured
// turn (or if a provider returns no usage), `estimateUsage` approximates from
// text length (~4 chars/token) so the panel isn't blank.

const CHARS_PER_TOKEN = 4;

function textLength(message: AppUIMessage): number {
  let n = 0;
  for (const part of message.parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      n += (part as { text?: string }).text?.length ?? 0;
    }
  }
  return n;
}

function estTokens(message: AppUIMessage): number {
  return Math.ceil(textLength(message) / CHARS_PER_TOKEN);
}

export interface UsageEstimate {
  usedTokens: number;
  maxTokens: number;
  pct: number;
  tokensIn: number;
  tokensOut: number;
  /** Formatted "$x.xx" for the most recent exchange. */
  messageCost: string;
  /** Formatted "$x.xx" for the whole session. */
  sessionCost: string;
  /** True when derived from measured usage rather than a text-length estimate. */
  measured: boolean;
}

/** Format a token count compactly: 43.2k / 200K-style. */
export function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}

export function fmtContext(n?: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return Math.round(n / 1_000_000) + 'M';
  return Math.round(n / 1000) + 'K';
}

// Copilot prices are in "credits" where 1 credit = 1 cent, quoted per
// `batchSize` tokens. Convert an estimated token count to a USD string.
function costUsd(tokensIn: number, tokensOut: number, model?: ModelInfo): string {
  const price = model?.price;
  if (!price || (price.inputPrice == null && price.outputPrice == null)) return '$0.00';
  const batch = price.batchSize || 1;
  const cents =
    (tokensIn / batch) * (price.inputPrice ?? 0) +
    (tokensOut / batch) * (price.outputPrice ?? 0);
  return '$' + (cents / 100).toFixed(2);
}

export function estimateUsage(
  messages: AppUIMessage[],
  model?: ModelInfo,
): UsageEstimate {
  let tokensIn = 0;
  let tokensOut = 0;
  for (const m of messages) {
    if (m.role === 'assistant') tokensOut += estTokens(m);
    else tokensIn += estTokens(m);
  }
  const usedTokens = tokensIn + tokensOut;
  const maxTokens = model?.contextWindow ?? 200_000;
  const pct = Math.min(100, Math.round((usedTokens / maxTokens) * 100));

  // "This message" estimate = the last user+assistant pair.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const msgIn = lastUser ? estTokens(lastUser) : 0;
  const msgOut = lastAssistant ? estTokens(lastAssistant) : 0;

  return {
    usedTokens,
    maxTokens,
    pct,
    tokensIn,
    tokensOut,
    messageCost: costUsd(msgIn, msgOut, model),
    sessionCost: costUsd(tokensIn, tokensOut, model),
    measured: false,
  };
}

/** Builds the usage panel from MEASURED per-session token counts. */
export function usageFromReal(usage: SessionUsage, model?: ModelInfo): UsageEstimate {
  const maxTokens = model?.contextWindow ?? 200_000;
  // The last turn's input tokens approximate the current context-window fill.
  const usedTokens = usage.lastContext || usage.lastIn;
  const pct = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  return {
    usedTokens,
    maxTokens,
    pct,
    tokensIn: usage.cumIn,
    tokensOut: usage.cumOut,
    messageCost: costUsd(usage.lastIn, usage.lastOut, model),
    sessionCost: costUsd(usage.cumIn, usage.cumOut, model),
    measured: true,
  };
}
