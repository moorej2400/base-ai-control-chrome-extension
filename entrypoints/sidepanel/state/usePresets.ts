import { useCallback, useEffect, useState } from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';

const PRESETS_KEY = 'settings.presets';

/**
 * A Preset is a named pairing of a Mode and a Style, applied together from the
 * composer's PRESET tile. Ids reference `useModes`/`useStyles` entries; a
 * missing reference is simply skipped when applied.
 */
export interface Preset {
  id: string;
  name: string;
  modeId?: string;
  styleId?: string;
}

const DEFAULT_PRESETS: Preset[] = [
  { id: 'doc-researcher', name: 'Doc researcher', modeId: 'researcher', styleId: 'concise' },
  { id: 'quick-answers', name: 'Quick answers', modeId: 'quick', styleId: 'concise' },
  { id: 'careful-editor', name: 'Careful editor', modeId: 'editor', styleId: 'detailed' },
];

/** Persisted, editable preset library (UI-owned). */
export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);

  useEffect(() => {
    void storageGet<Preset[]>(PRESETS_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) setPresets(saved);
    });
  }, []);

  const save = useCallback((preset: Preset) => {
    setPresets((prev) => {
      const exists = prev.some((p) => p.id === preset.id);
      const next = exists ? prev.map((p) => (p.id === preset.id ? preset : p)) : [...prev, preset];
      void storageSet(PRESETS_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      void storageSet(PRESETS_KEY, next);
      return next;
    });
  }, []);

  return { presets, save, remove };
}

export type PresetsApi = ReturnType<typeof usePresets>;
