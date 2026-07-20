import { openDB, type IDBPDatabase } from 'idb';
import type { AppUIMessage } from '../chat/app-message';

const DB_NAME = 'chat-db';
const STORE = 'messages';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function getMessages(sessionId: string): Promise<AppUIMessage[]> {
  const db = await getDb();
  return ((await db.get(STORE, sessionId)) as AppUIMessage[] | undefined) ?? [];
}

export async function saveMessages(
  sessionId: string,
  messages: AppUIMessage[],
): Promise<void> {
  const db = await getDb();
  // UIMessages are plain JSON; structured clone handles them as-is.
  await db.put(STORE, messages, sessionId);
}

export async function deleteMessages(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, sessionId);
}
