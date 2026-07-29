# Cursor Shadow and Wobble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the approved upright 33-unit cursor with a soft downward shadow and a continuous tip-anchored ease-in-out wobble.

**Architecture:** Keep cursor position on a zero-size wrapper fixed at the requested overlay coordinate. Render the shared upright SVG path inside a glyph layer whose offset places the SVG tip at wrapper origin, then animate only that glyph layer from `-31deg` to `-25deg`. Keep the click pulse on the wrapper so it does not replace the glyph shadow or wobble.

**Tech Stack:** TypeScript, DOM/SVG APIs, CSS animations, Vitest, jsdom

---

### Task 1: Add shared cursor geometry and visual behavior

**Files:**
- Create: `lib/agent-tools/browser-control/overlay/cursor-geometry.ts`
- Create: `test/browser-control/unit/cursor-appearance.test.ts`
- Modify: `lib/agent-tools/browser-control/overlay/cursor-view.ts`
- Modify: `public/browser-cursor.svg`

- [ ] **Step 1: Write failing geometry and appearance tests**

Create `test/browser-control/unit/cursor-appearance.test.ts` with tests that:

```ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CURSOR_BASE_WIDTH,
  CURSOR_CENTER_X,
  CURSOR_HEIGHT,
  CURSOR_NOTCH_DEPTH,
  CURSOR_PATH_D,
  CURSOR_TIP,
} from '@/lib/agent-tools/browser-control/overlay/cursor-geometry';
import { CURSOR_VIEW_STYLES, CursorView } from '@/lib/agent-tools/browser-control/overlay/cursor-view';

describe('cursor appearance', () => {
  it('keeps the approved upright symmetric geometry', () => {
    expect(CURSOR_BASE_WIDTH).toBe(33);
    expect(CURSOR_HEIGHT).toBe(41);
    expect(CURSOR_NOTCH_DEPTH).toBe(9);
    expect(CURSOR_TIP).toEqual({ x: CURSOR_CENTER_X, y: 1.5 });
    expect(CURSOR_PATH_D).toBe('M20.5 1.5 L37 42.5 L20.5 33.5 L4 42.5 Z');
  });

  it('keeps the public SVG upright and synchronized', () => {
    const svg = readFileSync(new URL('../../../public/browser-cursor.svg', import.meta.url), 'utf8');
    expect(svg).toContain('viewBox="0 0 41 45"');
    expect(svg).toContain(`d="${CURSOR_PATH_D}"`);
    expect(svg).not.toMatch(/transform=/);
  });

  it('uses a tip-anchored ease-in-out wobble, shadow, and reduced-motion fallback', () => {
    expect(CURSOR_VIEW_STYLES).toContain('drop-shadow(0 3px 3px rgb(0 0 0 / 35%))');
    expect(CURSOR_VIEW_STYLES).toContain('cursor-wobble 1.6s ease-in-out infinite alternate');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-31deg)');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-25deg)');
    expect(CURSOR_VIEW_STYLES).toContain('prefers-reduced-motion: reduce');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-28deg)');
  });

  it('keeps the requested point on the rendered tip', () => {
    const view = new CursorView(document);
    view.move({ x: 120, y: 80 }, false);
    expect(view.host.dataset.aiPageChatCursorX).toBe('120');
    expect(view.host.dataset.aiPageChatCursorY).toBe('80');
    view.dispose();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run test/browser-control/unit/cursor-appearance.test.ts
```

Expected: FAIL because `cursor-geometry.ts`, the approved SVG, and the wobble styles do not exist.

- [ ] **Step 3: Add the shared upright geometry**

Create `cursor-geometry.ts` with:

```ts
export const CURSOR_CENTER_X = 20.5;
export const CURSOR_BASE_WIDTH = 33;
export const CURSOR_HEIGHT = 41;
export const CURSOR_NOTCH_DEPTH = 9;
export const CURSOR_TIP = { x: CURSOR_CENTER_X, y: 1.5 } as const;
export const CURSOR_PATH_D = 'M20.5 1.5 L37 42.5 L20.5 33.5 L4 42.5 Z';
```

- [ ] **Step 4: Replace the public SVG**

Use the upright `0 0 41 45` view box, `CURSOR_PATH_D`, blue fill, white
`1.75` outline, and no transform:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 45" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Browser control cursor">
  <path d="M20.5 1.5 L37 42.5 L20.5 33.5 L4 42.5 Z" fill="#2f7cf6" stroke="#fff" stroke-width="1.75" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 5: Render and animate the inline SVG**

In `cursor-view.ts`:

- export `CURSOR_VIEW_STYLES`;
- make `.cursor` a zero-size fixed position wrapper;
- create an SVG glyph with `viewBox="0 0 41 45"` and `CURSOR_PATH_D`;
- size it to `27.333333px × 30px`;
- offset it by `left: -13.666667px; top: -1px`;
- use `transform-origin: 13.666667px 1px`;
- apply `filter: drop-shadow(0 3px 3px rgb(0 0 0 / 35%))`;
- animate `rotate(-31deg)` to `rotate(-25deg)` with
  `1.6s ease-in-out infinite alternate`;
- under `prefers-reduced-motion: reduce`, disable the animation and use
  `rotate(-28deg)`;
- render the click pulse through `.cursor::after` so it remains independent of
  the glyph filter and transform.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
pnpm vitest run test/browser-control/unit/cursor-appearance.test.ts
pnpm test:unit
pnpm compile
pnpm build
git diff --check
```

Expected: all commands exit successfully with no failures.

- [ ] **Step 7: Reload and visually validate the real extension**

Restart `pnpm dev` if the served module does not contain `cursor-wobble`. Sync
the output non-destructively to Chrome's registered unpacked path:

```bash
rsync -a .output/chrome-mv3-dev/ \
  /path/to/chrome-registered-copy/.output/chrome-mv3-dev/
```

Reload AI Page Chat at `chrome://extensions`, reopen the side panel, and run a
browser-control click on `http://localhost:4599/`. Capture screenshots at two
different animation phases and verify:

- the cursor uses the upright 33-unit source shape at a normal display angle;
- the shadow falls below it;
- the glyph rocks gently while the tip stays on the target;
- the click pulse remains visible;
- Chrome lists no extension errors.

- [ ] **Step 8: Review without committing**

Run `git status --short` and inspect the complete diff. Do not commit or push
unless the user explicitly asks.
