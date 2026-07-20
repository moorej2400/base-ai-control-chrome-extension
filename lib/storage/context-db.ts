import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'context-db';
const STORE = 'summaries';

export interface ContextSummaryRecord {
  sessionId: string;
  compactedThroughMessageId: string;
  compactedMessageCount: number;
  summary: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function getContextSummary(
  sessionId: string,
): Promise<ContextSummaryRecord | null> {
  const db = await getDb();
  return ((await db.get(STORE, sessionId)) as ContextSummaryRecord | undefined) ?? null;
}

export async function saveContextSummary(
  record: ContextSummaryRecord,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE, record, record.sessionId);
}

export async function deleteContextSummary(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, sessionId);
}
