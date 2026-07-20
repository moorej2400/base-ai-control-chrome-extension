import { storageGet, storageSet, storageRemove } from './chrome-storage';

const USAGE_KEY = 'usage.bySession';

/**
 * Real, measured token usage per session, accumulated from the model's
 * `onFinish` totals (transport.ts). `cum*` are cumulative across every turn (what
 * you actually pay for — input is re-billed each turn); `last*` is the most
 * recent turn; `lastContext` approximates the current context-window size.
 */
export interface SessionUsage {
  cumIn: number;
  cumOut: number;
  lastIn: number;
  lastOut: number;
  lastContext: number;
  cacheRead: number;
  updatedAt: number;
}

const EMPTY: SessionUsage = {
  cumIn: 0,
  cumOut: 0,
  lastIn: 0,
  lastOut: 0,
  lastContext: 0,
  cacheRead: 0,
  updatedAt: 0,
};

export const USAGE_STORAGE_KEY = USAGE_KEY;

async function readAll(): Promise<Record<string, SessionUsage>> {
  return (await storageGet<Record<string, SessionUsage>>(USAGE_KEY)) ?? {};
}

export async function getSessionUsage(sessionId: string): Promise<SessionUsage | undefined> {
  return (await readAll())[sessionId];
}

/** Folds one turn's measured usage into the session's running totals. */
export async function addSessionUsage(
  sessionId: string,
  turn: { inTokens: number; outTokens: number; cacheReadTokens?: number },
): Promise<void> {
  const all = await readAll();
  const prev = all[sessionId] ?? EMPTY;
  all[sessionId] = {
    cumIn: prev.cumIn + turn.inTokens,
    cumOut: prev.cumOut + turn.outTokens,
    lastIn: turn.inTokens,
    lastOut: turn.outTokens,
    lastContext: turn.inTokens + turn.outTokens,
    cacheRead: prev.cacheRead + (turn.cacheReadTokens ?? 0),
    updatedAt: Date.now(),
  };
  await storageSet(USAGE_KEY, all);
}

/** Drops every session's usage record (called when all chats are cleared). */
export async function clearAllUsage(): Promise<void> {
  await storageRemove(USAGE_KEY);
}
