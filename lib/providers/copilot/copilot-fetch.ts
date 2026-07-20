import { clearSession, EDITOR_HEADERS, getSession } from './token-manager';

/**
 * A fetch wrapper for the Copilot API: injects a fresh session token and the
 * editor headers on every request, and rewrites the request origin to the
 * API base returned by the token exchange (handles per-account hosts like
 * api.individual.githubcopilot.com). Retries once on 401 with a freshly
 * exchanged session token.
 */
export const copilotFetch: typeof fetch = async (input, init) => {
  const attempt = async (): Promise<Response> => {
    const session = await getSession();

    const url =
      typeof input === 'string' || input instanceof URL
        ? new URL(input.toString())
        : new URL(input.url);
    const base = new URL(session.apiBase);
    url.protocol = base.protocol;
    url.host = base.host;

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set('Authorization', `Bearer ${session.token}`);
    for (const [key, value] of Object.entries(EDITOR_HEADERS)) {
      if (!headers.has(key)) headers.set(key, value);
    }

    return fetch(url.toString(), { ...init, headers });
  };

  let res = await attempt();
  if (res.status === 401) {
    clearSession();
    res = await attempt();
  }
  return res;
};
