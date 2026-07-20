import { useCallback, useEffect, useState } from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';

const FLAGS_KEY = 'settings.flags';

/**
 * A persisted bag of boolean preference flags, keyed by string. Used by the
 * Context, Edit-behavior, Privacy and provider screens for their many toggles.
 *
 * NOTE: these flags are stored, but most are not yet consumed by the engine —
 * see the TODO markers at each screen's call site. The store itself is real so
 * the UI round-trips correctly today.
 */
export function useFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void storageGet<Record<string, boolean>>(FLAGS_KEY).then((saved) => {
      if (saved) setFlags(saved);
    });
  }, []);

  const get = useCallback(
    (key: string, fallback: boolean) => (key in flags ? flags[key] : fallback),
    [flags],
  );

  const toggle = useCallback((key: string, fallback: boolean) => {
    setFlags((prev) => {
      const current = key in prev ? prev[key] : fallback;
      const next = { ...prev, [key]: !current };
      void storageSet(FLAGS_KEY, next);
      return next;
    });
  }, []);

  return { get, toggle };
}

export type FlagsApi = ReturnType<typeof useFlags>;
