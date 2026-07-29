# Fresh Page Context Instruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the embedded agent inspect current page state during every page-dependent turn instead of answering from earlier observations.

**Architecture:** Keep the change at the prompt-policy boundary. Add a focused regression test for `buildSystemPrompt`, then replace the narrow explicit-reference instruction with a same-turn freshness contract that selects snapshots for dynamic UI and page extraction for documents.

**Tech Stack:** TypeScript, Vitest, AI SDK system prompt

---

### Task 1: Enforce same-turn page inspection

**Files:**
- Create: `test/chat/system-prompt.test.ts`
- Modify: `lib/chat/system-prompt.ts:14-23`
- Modify: `docs/AGENT_ARCHITECTURE.md:160-164`
- Modify: `vitest.config.ts:10-13`

- [ ] **Step 1: Write the failing prompt regression test**

```ts
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

describe('page-context system instruction', () => {
  it('requires same-turn inspection for implicit page-dependent follow-ups', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('could depend on the current page');
    expect(prompt).toContain('during the current turn');
    expect(prompt).toContain('Never rely solely on page observations from previous turns');
    expect(prompt).toContain('take_snapshot');
    expect(prompt).toContain('read_page_content');
  });
});
```

- [ ] **Step 2: Include chat tests in Vitest**

Add `test/chat/**/*.test.ts` to `vitest.config.ts` so the focused regression and
the full `pnpm test:unit` suite both execute it.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `pnpm vitest run test/chat/system-prompt.test.ts`

Expected: FAIL because the current prompt only requires `read_page_content` for explicit references such as "this page."

- [ ] **Step 4: Implement the minimal prompt policy**

Replace the narrow explicit-reference sentence with instructions that:

- require inspection during the current turn whenever an answer could depend on current page or UI state;
- prohibit relying solely on earlier-turn page observations;
- select `take_snapshot` for dynamic UI and `read_page_content` for documents or articles;
- require reinspection after navigation, browser actions, or possible user updates;
- require an access limitation response instead of guessing.

- [ ] **Step 5: Update architecture documentation**

Document that prior page observations are historical and page-dependent answers require a current-turn tool invocation.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
pnpm vitest run test/chat/system-prompt.test.ts
pnpm test:unit
pnpm compile
git diff --check
```

Expected: all commands exit successfully with zero failing tests or type errors.

- [ ] **Step 7: Validate the real extension**

Start the instrumented test page in a terminal and leave it running:

```bash
node test/browser-control/bench-server.mjs
```

The existing `pnpm dev` watcher writes
`.output/chrome-mv3-dev`. Sync it non-destructively to Chrome's registered
unpacked path, reload the extension from `chrome://extensions`, close any stale
side panel, and reopen AI Page Chat:

```bash
rsync -a .output/chrome-mv3-dev/ \
  /path/to/chrome-registered-copy/.output/chrome-mv3-dev/
```

Use the live bridge to establish an earlier observation, mutate the same page
without changing its URL, then ask an implicit follow-up:

```bash
node scripts/live.mjs health
node scripts/live.mjs inspect "location.href='http://localhost:4599/'"
node scripts/live.mjs send "Inspect the current page and tell me the current Quantity value."
node scripts/live.mjs inspect "const el=document.querySelector('#quantity'); el.value='7'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.value"
node scripts/live.mjs send "Is that too high?"
node scripts/live.mjs read
```

Expected: the last assistant turn contains `tool-take_snapshot` before its
answer, and the answer identifies the updated value as 7 rather than the
earlier value.

- [ ] **Step 8: Review the resulting diff**

Run `git status --short` and `git diff`. Do not commit unless the user
explicitly requests a commit for this implementation.
