import { useCallback, useEffect, useState } from 'react';
import { storageGet, storageSet } from '@/lib/storage/chrome-storage';

const SKILLS_KEY = 'settings.skills';

export interface Skill {
  id: string;
  title: string;
  color: string;
  /** Raw Markdown with YAML front matter; `name:` becomes the /command. */
  text: string;
}

export interface EnrichedSkill extends Skill {
  name: string;
  slash: string;
  slashLabel: string;
  desc: string;
}

export const SKILL_COLORS = [
  '#6f68e0',
  '#3f9e5e',
  '#d9772f',
  '#7c5cdb',
  '#c6604f',
  '#3b82c4',
];

const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'summarize',
    title: 'Summarize page',
    color: '#6f68e0',
    text: '---\nname: summarize\ndescription: Condense the page or selection into key points\n---\n\n# Summarize page\n\nSummarize the selection or page into 3–5 tight bullet points.\n\nLead with the single most important takeaway, keep it plain-language, and skip any preamble.',
  },
  {
    id: 'rewrite',
    title: 'Rewrite clearly',
    color: '#3f9e5e',
    text: '---\nname: rewrite\ndescription: Improve clarity and concision, keep my voice\n---\n\n# Rewrite clearly\n\nRewrite the selection to be clearer and more concise.\n\nPreserve the author’s voice and any domain terms. Return the result as a tracked diff against the selection.',
  },
];

export function slugify(str: string): string {
  return (
    String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'skill'
  );
}

/** Parse YAML-ish front matter; returns name/description and the body. */
export function parseFrontMatter(text: string): {
  name: string;
  description: string;
  body: string;
} {
  const src = String(text || '');
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/.exec(src);
  const meta: Record<string, string> = {};
  let body = src;
  if (m) {
    body = m[2];
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  const firstBody = (body.split('\n').find((l) => l.trim() && !/^#/.test(l.trim())) || '').slice(0, 80);
  return { name: meta.name || '', description: meta.description || firstBody || '', body };
}

export function enrichSkill(skill: Skill): EnrichedSkill {
  const fm = parseFrontMatter(skill.text);
  const name = fm.name || slugify(skill.title);
  return {
    ...skill,
    name,
    slash: name,
    slashLabel: '/' + name,
    desc: fm.description || 'Custom skill',
  };
}

/** Persisted, editable skill library (UI-owned). */
export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>(DEFAULT_SKILLS);

  useEffect(() => {
    void storageGet<Skill[]>(SKILLS_KEY).then((saved) => {
      if (saved && Array.isArray(saved)) setSkills(saved);
    });
  }, []);

  const persist = (next: Skill[]) => {
    setSkills(next);
    void storageSet(SKILLS_KEY, next);
  };

  const update = useCallback((id: string, patch: Partial<Skill>) => {
    setSkills((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      void storageSet(SKILLS_KEY, next);
      return next;
    });
  }, []);

  const add = useCallback((skill: Skill) => {
    setSkills((prev) => {
      const next = [...prev, skill];
      void storageSet(SKILLS_KEY, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSkills((prev) => {
      const next = prev.filter((s) => s.id !== id);
      void storageSet(SKILLS_KEY, next);
      return next;
    });
  }, []);

  return {
    skills,
    enriched: skills.map(enrichSkill),
    update,
    add,
    remove,
    setAll: persist,
  };
}

export type SkillsApi = ReturnType<typeof useSkills>;
