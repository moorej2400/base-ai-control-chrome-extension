import { useCallback, useEffect, useState } from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';

const STYLES_KEY = 'settings.styles';

/**
 * A response Style: a short instruction appended to the system prompt to shape
 * tone/format (e.g. "Concise", "Detailed"). Distinct from a Mode, which also
 * carries a model, temperature and tool selection.
 */
export interface Style {
  id: string;
  name: string;
  desc: string;
  /** Guidance appended to the system prompt when this style is active. */
  prompt: string;
}

const DEFAULT_STYLES: Style[] = [
  {
    id: 'concise',
    name: 'Concise',
    desc: 'Short, direct answers with no preamble',
    prompt:
      'Be concise. Lead with the answer, cut preamble and filler, and prefer tight bullet points over long paragraphs.',
  },
  {
    id: 'detailed',
    name: 'Detailed',
    desc: 'Thorough explanations with context and examples',
    prompt:
      'Be thorough. Explain your reasoning, cover edge cases, and include concrete examples where they aid understanding.',
  },
  {
    id: 'friendly',
    name: 'Friendly',
    desc: 'Warm, conversational tone',
    prompt: 'Use a warm, encouraging, conversational tone while staying accurate and useful.',
  },
];

/** Persisted, editable style library (UI-owned). */
export function useStyles() {
  const [styles, setStyles] = useState<Style[]>(DEFAULT_STYLES);

  useEffect(() => {
    void storageGet<Style[]>(STYLES_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) setStyles(saved);
    });
  }, []);

  const save = useCallback((style: Style) => {
    setStyles((prev) => {
      const exists = prev.some((s) => s.id === style.id);
      const next = exists ? prev.map((s) => (s.id === style.id ? style : s)) : [...prev, style];
      void storageSet(STYLES_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setStyles((prev) => {
      const next = prev.filter((s) => s.id !== id);
      void storageSet(STYLES_KEY, next);
      return next;
    });
  }, []);

  return { styles, save, remove };
}

export type StylesApi = ReturnType<typeof useStyles>;
