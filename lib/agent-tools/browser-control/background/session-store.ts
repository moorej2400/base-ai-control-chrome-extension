export type BrowserSessionOrigin = 'embedded' | 'mcp';
export type BrowserSessionState = 'active' | 'orphaned';

export interface BrowserSessionRecord {
  id: string;
  origin: BrowserSessionOrigin;
  connectionId: string;
  resumeTokenHash: string;
  state: BrowserSessionState;
  orphanExpiresAtMs?: number;
  createdAtMs: number;
  lastHeartbeatMs: number;
}

export interface SessionStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export class MemorySessionStorage implements SessionStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
}

/** Chrome's session storage survives service-worker restarts without syncing browser-control state. */
export class ChromeSessionStorage implements SessionStorage {
  async get<T>(key: string): Promise<T | undefined> {
    return (await chrome.storage.session.get(key))[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  }
}

export class SessionStoreError extends Error {
  constructor(
    readonly code: 'SESSION_NOT_FOUND' | 'SESSION_RESUME_FAILED',
    message: string,
  ) {
    super(message);
  }
}

export interface SessionStoreOptions {
  storage: SessionStorage;
  now?: () => number;
  createId?: () => string;
  createToken?: () => string;
  hashToken?: (token: string) => Promise<string>;
}

const SESSIONS_KEY = 'browser-control:sessions';
const RESUME_WINDOW_MS: Record<BrowserSessionOrigin, number> = {
  embedded: 15_000,
  mcp: 30_000,
};

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Persists only recoverable session metadata. Plaintext resume tokens stay in
 * the calling process so storage recovery cannot silently grant tab control.
 */
export class SessionStore {
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly createToken: () => string;
  private readonly hashToken: (token: string) => Promise<string>;

  constructor(private readonly options: SessionStoreOptions) {
    this.now = options.now ?? Date.now;
    // Native Crypto methods throw "Illegal invocation" when detached from their receiver.
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.createToken = options.createToken ?? randomToken;
    this.hashToken = options.hashToken ?? sha256;
  }

  async start(origin: BrowserSessionOrigin, connectionId: string): Promise<{ browserSessionId: string; resumeToken: string }> {
    const now = this.now();
    const resumeToken = this.createToken();
    const record: BrowserSessionRecord = {
      id: this.createId(),
      origin,
      connectionId,
      resumeTokenHash: await this.hashToken(resumeToken),
      state: 'active',
      createdAtMs: now,
      lastHeartbeatMs: now,
    };
    const records = await this.read();
    records.push(record);
    await this.write(records);
    return { browserSessionId: record.id, resumeToken };
  }

  async get(sessionId: string): Promise<BrowserSessionRecord | undefined> {
    return (await this.read()).find((record) => record.id === sessionId);
  }

  async resume(sessionId: string, resumeToken: string, connectionId: string, origin: BrowserSessionOrigin): Promise<BrowserSessionRecord> {
    const records = await this.read();
    const record = records.find((candidate) => candidate.id === sessionId);
    if (!record) throw new SessionStoreError('SESSION_NOT_FOUND', 'Browser session was not found.');
    const tokenHash = await this.hashToken(resumeToken);
    const expired = record.state === 'orphaned' && (record.orphanExpiresAtMs ?? 0) < this.now();
    if (record.origin !== origin || record.resumeTokenHash !== tokenHash || expired) {
      throw new SessionStoreError('SESSION_RESUME_FAILED', 'Browser session cannot be resumed.');
    }

    record.connectionId = connectionId;
    record.state = 'active';
    record.orphanExpiresAtMs = undefined;
    record.lastHeartbeatMs = this.now();
    await this.write(records);
    return record;
  }

  async heartbeat(sessionId: string): Promise<void> {
    const records = await this.read();
    const record = records.find((candidate) => candidate.id === sessionId);
    if (!record) throw new SessionStoreError('SESSION_NOT_FOUND', 'Browser session was not found.');
    record.lastHeartbeatMs = this.now();
    await this.write(records);
  }

  async end(sessionId: string): Promise<void> {
    await this.write((await this.read()).filter((record) => record.id !== sessionId));
  }

  async orphanAll(): Promise<BrowserSessionRecord[]> {
    const now = this.now();
    const records = await this.read();
    for (const record of records) {
      if (record.state !== 'active') continue;
      record.state = 'orphaned';
      record.orphanExpiresAtMs = now + RESUME_WINDOW_MS[record.origin];
    }
    await this.write(records);
    return records;
  }

  async orphanConnection(connectionId: string): Promise<BrowserSessionRecord[]> {
    const now = this.now();
    const records = await this.read();
    const orphaned = records.filter((record) => record.connectionId === connectionId && record.state === 'active');
    for (const record of orphaned) {
      record.state = 'orphaned';
      record.orphanExpiresAtMs = now + RESUME_WINDOW_MS[record.origin];
    }
    if (orphaned.length) await this.write(records);
    return orphaned;
  }

  async expireOrphans(): Promise<BrowserSessionRecord[]> {
    const now = this.now();
    const records = await this.read();
    const expired = records.filter(
      (record) => record.state === 'orphaned' && (record.orphanExpiresAtMs ?? 0) < now,
    );
    if (expired.length > 0) {
      await this.write(records.filter((record) => !expired.includes(record)));
    }
    return expired;
  }

  private async read(): Promise<BrowserSessionRecord[]> {
    return (await this.options.storage.get<BrowserSessionRecord[]>(SESSIONS_KEY)) ?? [];
  }

  private write(records: BrowserSessionRecord[]): Promise<void> {
    return this.options.storage.set(SESSIONS_KEY, records);
  }
}
