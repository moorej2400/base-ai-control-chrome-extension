interface ToolCacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const cache = new Map<string, ToolCacheEntry<unknown>>();

/**
 * Nullary browser tools are easy for the model to call repeatedly. A short TTL
 * avoids duplicate DOM scrapes without pretending highly dynamic tabs are
 * immutable.
 */
export function cachedToolResult<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = load().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}
