import { useEffect, useState } from 'react';
import {
  getSessionUsage,
  USAGE_STORAGE_KEY,
  type SessionUsage,
} from '@/lib/storage/usage-store';

/**
 * Live measured usage for a session. Reloads when the transport records a new
 * turn (it writes the whole `usage.bySession` map, which fires storage.onChanged).
 */
export function useSessionUsage(sessionId: string): SessionUsage | null {
  const [usage, setUsage] = useState<SessionUsage | null>(null);

  useEffect(() => {
    let active = true;
    void getSessionUsage(sessionId).then((u) => active && setUsage(u ?? null));
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes[USAGE_STORAGE_KEY]) return;
      const map = changes[USAGE_STORAGE_KEY].newValue as
        | Record<string, SessionUsage>
        | undefined;
      setUsage(map?.[sessionId] ?? null);
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, [sessionId]);

  return usage;
}
