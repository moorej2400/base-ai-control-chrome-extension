import type { AppUIMessage } from '../chat/app-message';
import type { SessionMeta } from '../sessions/types';
import { listSessions, deleteSession } from '../sessions/store';
import { getMessages } from './message-db';
import { clearAllUsage } from './usage-store';

/** Keys never included in an export (secrets). */
const SECRET_KEYS = ['copilot.ghoToken'];

export interface DataExport {
  exportedAt: number;
  version: string;
  settings: Record<string, unknown>;
  sessions: SessionMeta[];
  messages: Record<string, AppUIMessage[]>;
}

/**
 * Snapshot of everything the extension stores: settings, sessions, and their
 * messages. Secrets are redacted — the GitHub token is omitted and custom
 * provider API keys are masked — so an export is safe to share as a backup.
 */
export async function exportAllData(): Promise<DataExport> {
  const all = await chrome.storage.local.get(null);
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key === 'sessions.index') continue; // captured via `sessions` below
    if (SECRET_KEYS.includes(key)) continue;
    if (key === 'settings.customProviders' && Array.isArray(value)) {
      settings[key] = value.map((c) => ({
        ...c,
        apiKey: c?.apiKey ? '***redacted***' : '',
      }));
    } else {
      settings[key] = value;
    }
  }
  const sessions = await listSessions();
  const messages: Record<string, AppUIMessage[]> = {};
  for (const session of sessions) {
    messages[session.id] = await getMessages(session.id);
  }
  return { exportedAt: Date.now(), version: '1', settings, sessions, messages };
}

/** Deletes every chat (messages + context summaries + index). Returns the count. */
export async function clearAllChats(): Promise<number> {
  const sessions = await listSessions();
  for (const session of sessions) await deleteSession(session.id);
  await clearAllUsage();
  return sessions.length;
}

/**
 * Full reset: clears all chats and removes every `settings.*` key. The Copilot
 * auth token is intentionally preserved so the user isn't logged out.
 */
export async function wipeAllData(): Promise<void> {
  await clearAllChats();
  const all = await chrome.storage.local.get(null);
  const settingsKeys = Object.keys(all).filter((k) => k.startsWith('settings.'));
  if (settingsKeys.length) await chrome.storage.local.remove(settingsKeys);
}

/**
 * Deletes sessions whose last activity is older than `days`. `days >= 365` is
 * treated as "never". Returns the number removed. Call at startup.
 */
export async function purgeOldSessions(days: number): Promise<number> {
  if (!days || days >= 365) return 0;
  const cutoff = Date.now() - days * 86_400_000;
  const sessions = await listSessions();
  const stale = sessions.filter((s) => s.updatedAt < cutoff);
  for (const session of stale) await deleteSession(session.id);
  return stale.length;
}
