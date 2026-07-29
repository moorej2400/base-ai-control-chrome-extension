# Cursor Lower Pivot and Visible Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the cursor wobble pivot to 30% down its body and make its downward shadow clearly visible.

**Architecture:** Keep the wrapper and unrotated SVG tip aligned with the requested browser coordinate. Derive a separate visual pivot from the upright geometry at `(centerX, tipY + height × 0.3)`, convert it through the existing render scale, and use it as the glyph transform origin. Apply two CSS drop shadows to the glyph without changing the independent click pulse.

**Tech Stack:** TypeScript, CSS animations, DOM/SVG APIs, Vitest, jsdom

---

### Task 1: Derive and apply the lower wobble pivot

**Files:**
- Modify: `lib/agent-tools/browser-control/overlay/cursor-geometry.ts`
- Modify: `lib/agent-tools/browser-control/overlay/cursor-view.ts`
- Test: `test/browser-control/unit/cursor-appearance.test.ts`
- Modify: `docs/superpowers/specs/2026-07-28-cursor-redesign-design.md`

- [x] **Step 1: Write the failing pivot and shadow assertions**

Update the appearance test to import `CURSOR_WOBBLE_PIVOT` and
`CURSOR_WOBBLE_PIVOT_FRACTION`, then assert:

```ts
expect(CURSOR_WOBBLE_PIVOT_FRACTION).toBe(0.3);
expect(CURSOR_WOBBLE_PIVOT).toEqual({
  x: CURSOR_CENTER_X,
  y: CURSOR_TIP.y + CURSOR_HEIGHT * CURSOR_WOBBLE_PIVOT_FRACTION,
});
expect(CURSOR_VIEW_STYLES).toContain(
  'drop-shadow(0 2px 2px rgb(0 0 0 / 48%))',
);
expect(CURSOR_VIEW_STYLES).toContain(
  'drop-shadow(0 6px 6px rgb(0 0 0 / 28%))',
);
```

Replace the former tip-invariance rotation test with a pivot test that:

1. converts `CURSOR_WOBBLE_PIVOT` to rendered glyph coordinates;
2. asserts those coordinates equal the CSS transform origin;
3. rotates both pivot and tip through `-31deg` and `-25deg`;
4. asserts the pivot is unchanged and the tip moves.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run test/browser-control/unit/cursor-appearance.test.ts
```

Expected: FAIL because the 30% pivot constants and layered shadow do not exist.

- [x] **Step 3: Derive the visual pivot**

In `cursor-geometry.ts`, add:

```ts
export const CURSOR_WOBBLE_PIVOT_FRACTION = 0.3;
export const CURSOR_WOBBLE_PIVOT = {
  x: CURSOR_CENTER_X,
  y: CURSOR_TIP.y + CURSOR_HEIGHT * CURSOR_WOBBLE_PIVOT_FRACTION,
} as const;

export const CURSOR_TRANSFORM_ORIGIN_X = roundCursorGeometry(
  CURSOR_WOBBLE_PIVOT.x * cursorRenderScale,
);
export const CURSOR_TRANSFORM_ORIGIN_Y = roundCursorGeometry(
  CURSOR_WOBBLE_PIVOT.y * cursorRenderScale,
);
```

Keep `CURSOR_GLYPH_LEFT` and `CURSOR_GLYPH_TOP` derived from `CURSOR_TIP`, so
the unrotated cursor tip remains at the wrapper coordinate.

- [x] **Step 4: Apply the layered shadow**

Replace the existing glyph filter in `cursor-view.ts` with:

```css
filter:
  drop-shadow(0 2px 2px rgb(0 0 0 / 48%))
  drop-shadow(0 6px 6px rgb(0 0 0 / 28%));
```

Do not change the wobble angles, duration, reduced-motion fallback, or pulse
layer.

- [x] **Step 5: Run automated verification**

Run:

```bash
pnpm vitest run test/browser-control/unit/cursor-appearance.test.ts
pnpm test:unit
pnpm compile
pnpm build
git diff --check
```

Expected: all commands pass. The production build may retain the existing
chunk-size warning.

- [x] **Step 6: Reload and visually validate**

Confirm `pnpm dev` serves the updated module, sync `.output/chrome-mv3-dev/`
non-destructively to Chrome's registered unpacked directory, reload AI Page
Chat, and run one browser-control click. Inspect screenshots at two animation
phases and confirm:

- the cursor rotates around a point approximately 30% down its body;
- the tip moves through the sway instead of remaining fixed;
- the two-layer shadow is visible below the cursor;
- the click pulse remains centered;
- Chrome lists no extension errors.

- [x] **Step 7: Review without committing**

Run `git status --short` and inspect the cursor-related diff. Do not commit or
push unless the user explicitly asks.
