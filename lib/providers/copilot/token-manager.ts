import { storageGet, storageRemove, storageSet } from '../../storage/chrome-storage';

/**
 * Manages the two Copilot credentials:
 *  - the long-lived GitHub OAuth token (`gho_*`), persisted in chrome.storage.local
 *  - the short-lived Copilot session token (~30 min), kept in memory only and
 *    refreshed on demand via the copilot_internal token exchange.
 */

const GHO_TOKEN_KEY = 'copilot.ghoToken';
const TOKEN_EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';
const DEFAULT_API_BASE = 'https://api.githubcopilot.com';
/** Refresh this many seconds before the session token actually expires. */
const REFRESH_MARGIN_S = 120;

export const EDITOR_HEADERS: Record<string, string> = {
  'Editor-Version': 'vscode/1.99.0',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
  // Required for Copilot to return current model metadata, including
  // 1M-context limits for eligible models like Claude Opus.
  'X-GitHub-Api-Version': '2026-06-01',
};

export interface CopilotSession {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
  apiBase: string;
}

export class CopilotAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopilotAuthError';
  }
}

let session: CopilotSession | null = null;
let inflightRefresh: Promise<CopilotSession> | null = null;

export function getGithubToken(): Promise<string | undefined> {
  return storageGet<string>(GHO_TOKEN_KEY);
}

export async function setGithubToken(token: string): Promise<void> {
  await storageSet(GHO_TOKEN_KEY, token);
  clearSession();
}

export async function clearGithubToken(): Promise<void> {
  await storageRemove(GHO_TOKEN_KEY);
  clearSession();
}

export function clearSession(): void {
  session = null;
}

/** Returns a valid Copilot session, refreshing the short-lived token if needed. */
export async function getSession(): Promise<CopilotSession> {
  if (session && session.expiresAt - REFRESH_MARGIN_S > Date.now() / 1000) {
    return session;
  }
  // Single-flight: concurrent callers share one refresh request.
  inflightRefresh ??= refreshSession().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

async function refreshSession(): Promise<CopilotSession> {
  const gho = await getGithubToken();
  if (!gho) {
    throw new CopilotAuthError('Not signed in to GitHub Copilot.');
  }

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    headers: {
      Authorization: `token ${gho}`,
      Accept: 'application/json',
      ...EDITOR_HEADERS,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new CopilotAuthError(
      'GitHub rejected the Copilot token. Please reconnect your account.',
    );
  }
  if (!res.ok) {
    throw new Error(`Copilot token exchange failed (${res.status})`);
  }

  const data = await res.json();
  if (!data.token) {
    throw new Error('Copilot token exchange returned no token.');
  }
  session = {
    token: data.token as string,
    expiresAt:
      typeof data.expires_at === 'number'
        ? data.expires_at
        : Date.now() / 1000 + 25 * 60,
    apiBase: data.endpoints?.api ?? DEFAULT_API_BASE,
  };
  return session;
}
