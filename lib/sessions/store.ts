import { DEFAULT_PROVIDER_ID } from '../providers/registry';
import { storageGet, storageSet } from '../storage/chrome-storage';
import { deleteContextSummary } from '../storage/context-db';
import { deleteMessages } from '../storage/message-db';
import { DEFAULT_TOOL_MODULES } from '../tools/registry';
import { BROWSER_CONTROL_MODULE_ID } from '../agent-tools/browser-control/module';
import { NEW_CHAT_TITLE, type SessionMeta } from './types';

const INDEX_KEY = 'sessions.index';

export async function listSessions(): Promise<SessionMeta[]> {
  return (await readSessionIndex()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Constructs a session WITHOUT persisting it. The session only enters the
 * index once its first messages are saved (saveSessionMeta), so abandoned
 * "new chats" never clutter the list.
 */
export function createSession(modelId: string): SessionMeta {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: NEW_CHAT_TITLE,
    createdAt: now,
    updatedAt: now,
    providerId: DEFAULT_PROVIDER_ID,
    modelId,
    enabledToolModules: [...DEFAULT_TOOL_MODULES],
    browserControlConfigured: true,
  };
}

/** Upserts a session into the index. */
export async function saveSessionMeta(session: SessionMeta): Promise<void> {
  const index = await readSessionIndex();
  const i = index.findIndex((s) => s.id === session.id);
  if (i === -1) index.push(session);
  else index[i] = session;
  await storageSet(INDEX_KEY, index);
}

export async function deleteSession(id: string): Promise<void> {
  const index = await readSessionIndex();
  await storageSet(
    INDEX_KEY,
    index.filter((s) => s.id !== id),
  );
  await deleteMessages(id);
  await deleteContextSummary(id);
}

async function readSessionIndex(): Promise<SessionMeta[]> {
  const index = await storageGet<unknown>(INDEX_KEY);
  if (!Array.isArray(index)) return [];
  return index.filter(isSessionMeta).map(migrateSessionDefaults);
}

function migrateSessionDefaults(session: SessionMeta): SessionMeta {
  if (session.browserControlConfigured !== undefined) return session;
  return {
    ...session,
    enabledToolModules: [
      ...new Set([...session.enabledToolModules, BROWSER_CONTROL_MODULE_ID]),
    ],
    browserControlConfigured: true,
  };
}

function isSessionMeta(value: unknown): value is SessionMeta {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionMeta>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.providerId === 'string' &&
    typeof candidate.modelId === 'string' &&
    Array.isArray(candidate.enabledToolModules) &&
    (candidate.browserControlConfigured === undefined ||
      typeof candidate.browserControlConfigured === 'boolean')
  );
}
