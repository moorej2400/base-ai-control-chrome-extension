import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

describe('buildSystemPrompt', () => {
  it('requires fresh inspection for implicit page-dependent follow-ups', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('could depend on the current page or visible UI state');
    expect(prompt).toContain('during the current turn');
    expect(prompt).toContain('previous-turn page observations');
    expect(prompt).toMatch(
      /Use take_snapshot for dynamic or interactive UI and read_page_content for document or article content/,
    );
    expect(prompt).toMatch(
      /Reinspect after navigation, browser actions, user interaction, or any possible page update/,
    );
    expect(prompt).toContain('cannot be inspected, say so rather than guessing');
    expect(prompt).not.toContain('call read_page_content before answering instead of guessing');
  });
});
