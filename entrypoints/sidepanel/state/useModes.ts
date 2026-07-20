import { useCallback, useEffect, useState } from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';

const MODES_KEY = 'settings.modes';

export interface ModeTools {
  read: boolean;
  apply: boolean;
  search: boolean;
  fetch: boolean;
}

export interface Mode {
  id: string;
  name: string;
  icon: string;
  tint: string;
  iconColor: string;
  desc: string;
  model: string;
  temp: number;
  prompt: string;
  tools: ModeTools;
}

/** Tool catalog shown in the mode editor (labels + descriptions). */
export const MODE_TOOL_META: { key: keyof ModeTools; label: string; sub: string }[] = [
  { key: 'read', label: 'Read document', sub: 'Access the current page text' },
  { key: 'apply', label: 'Apply edits', sub: 'Propose tracked diffs to the note' },
  { key: 'search', label: 'Search notes', sub: 'Query across linked pages' },
  { key: 'fetch', label: 'Fetch URLs', sub: 'Read linked external pages' },
];

const DEFAULT_MODES: Mode[] = [
  {
    id: 'editor',
    name: 'Editor',
    icon: '✎',
    tint: 'var(--accent-tint)',
    iconColor: 'var(--accent-text)',
    desc: 'Rewrites and edits inline with tracked diffs',
    model: 'Sonnet 4.5',
    temp: 0.3,
    prompt:
      "You are a precise copy editor. Improve clarity and concision while preserving the author's voice. Always return changes as a tracked diff against the current selection.",
    tools: { read: true, apply: true, search: false, fetch: false },
  },
  {
    id: 'researcher',
    name: 'Researcher',
    icon: '◎',
    tint: 'var(--blue-tint)',
    iconColor: 'var(--text2)',
    desc: 'Searches linked pages and cites its sources',
    model: 'Sonnet 4.5',
    temp: 0.5,
    prompt:
      'You are a research assistant. Gather evidence across the linked pages before answering, and cite each claim with its source page.',
    tools: { read: true, apply: false, search: true, fetch: true },
  },
  {
    id: 'quick',
    name: 'Quick',
    icon: '⚡',
    tint: 'var(--warm-tint)',
    iconColor: 'var(--text2)',
    desc: 'Fast answers, no tools, minimal preamble',
    model: 'Haiku 3.5',
    temp: 0.7,
    prompt:
      'Answer quickly and directly. No preamble and no tools. Keep responses under three sentences whenever possible.',
    tools: { read: false, apply: false, search: false, fetch: false },
  },
  {
    id: 'coach',
    name: 'Coach',
    icon: '◑',
    tint: 'var(--ok-tint)',
    iconColor: 'var(--text2)',
    desc: 'Asks clarifying questions before acting',
    model: 'Sonnet 4.5',
    temp: 0.6,
    prompt:
      'Before taking action, ask up to two clarifying questions. Then proceed with a short, explicit plan.',
    tools: { read: true, apply: false, search: false, fetch: false },
  },
];

/** Persisted, editable mode library (UI-owned). */
export function useModes() {
  const [modes, setModes] = useState<Mode[]>(DEFAULT_MODES);

  useEffect(() => {
    void storageGet<Mode[]>(MODES_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) setModes(saved);
    });
  }, []);

  const save = useCallback((mode: Mode) => {
    setModes((prev) => {
      const exists = prev.some((m) => m.id === mode.id);
      const next = exists ? prev.map((m) => (m.id === mode.id ? mode : m)) : [...prev, mode];
      void storageSet(MODES_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setModes((prev) => {
      const next = prev.filter((m) => m.id !== id);
      void storageSet(MODES_KEY, next);
      return next;
    });
  }, []);

  return { modes, save, remove };
}

export type ModesApi = ReturnType<typeof useModes>;
