// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CURSOR_BASE_WIDTH,
  CURSOR_CENTER_X,
  CURSOR_GLYPH_LEFT,
  CURSOR_GLYPH_TOP,
  CURSOR_HEIGHT,
  CURSOR_NOTCH_DEPTH,
  CURSOR_PATH_D,
  CURSOR_RENDERED_HEIGHT,
  CURSOR_RENDERED_WIDTH,
  CURSOR_TRANSFORM_ORIGIN_X,
  CURSOR_TRANSFORM_ORIGIN_Y,
  CURSOR_TIP,
  CURSOR_VIEWBOX_HEIGHT,
  CURSOR_VIEWBOX_WIDTH,
  CURSOR_WOBBLE_PIVOT,
  CURSOR_WOBBLE_PIVOT_FRACTION,
} from '@/lib/agent-tools/browser-control/overlay/cursor-geometry';
import {
  CURSOR_VIEW_STYLES,
  CursorView,
  createCursorGlyph,
} from '@/lib/agent-tools/browser-control/overlay/cursor-view';

describe('cursor appearance', () => {
  it('keeps the approved upright symmetric geometry', () => {
    expect(CURSOR_BASE_WIDTH).toBe(33);
    expect(CURSOR_HEIGHT).toBe(41);
    expect(CURSOR_NOTCH_DEPTH).toBe(9);
    expect(CURSOR_TIP).toEqual({ x: CURSOR_CENTER_X, y: 1.5 });
    expect(CURSOR_PATH_D).toBe('M20.5 1.5 L37 42.5 L20.5 33.5 L4 42.5 Z');
  });

  it('keeps the public SVG upright and synchronized', () => {
    const svg = readFileSync('public/browser-cursor.svg', 'utf8');

    expect(svg).toContain('viewBox="0 0 41 45"');
    expect(svg).toContain(`d="${CURSOR_PATH_D}"`);
    expect(svg).not.toMatch(/transform=/);
  });

  it('uses a lower-body ease-in-out wobble, layered shadow, and reduced-motion fallback', () => {
    expect(CURSOR_WOBBLE_PIVOT_FRACTION).toBe(0.3);
    expect(CURSOR_WOBBLE_PIVOT).toEqual({
      x: CURSOR_CENTER_X,
      y: CURSOR_TIP.y + CURSOR_HEIGHT * CURSOR_WOBBLE_PIVOT_FRACTION,
    });
    expect(CURSOR_VIEW_STYLES).toContain('drop-shadow(0 2px 2px rgb(0 0 0 / 48%))');
    expect(CURSOR_VIEW_STYLES).toContain('drop-shadow(0 6px 6px rgb(0 0 0 / 28%))');
    expect(CURSOR_VIEW_STYLES).toContain('cursor-wobble 1.6s ease-in-out infinite alternate');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-31deg)');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-25deg)');
    expect(CURSOR_VIEW_STYLES).toContain('prefers-reduced-motion: reduce');
    expect(CURSOR_VIEW_STYLES).toContain('rotate(-28deg)');
    expect(CURSOR_VIEW_STYLES).toContain(`left: ${CURSOR_GLYPH_LEFT}px;`);
    expect(CURSOR_VIEW_STYLES).toContain(`top: ${CURSOR_GLYPH_TOP}px;`);
    expect(CURSOR_VIEW_STYLES).toContain(`width: ${CURSOR_RENDERED_WIDTH}px;`);
    expect(CURSOR_VIEW_STYLES).toContain(`height: ${CURSOR_RENDERED_HEIGHT}px;`);
    expect(CURSOR_VIEW_STYLES).toContain(
      `transform-origin: ${CURSOR_TRANSFORM_ORIGIN_X}px ${CURSOR_TRANSFORM_ORIGIN_Y}px;`,
    );
    expect(CURSOR_VIEW_STYLES).toContain('box-sizing: border-box;');
  });

  it('maps the rendered SVG tip to the zero-size wrapper origin', () => {
    expect(CURSOR_RENDERED_WIDTH).toBeCloseTo(
      (CURSOR_VIEWBOX_WIDTH * CURSOR_RENDERED_HEIGHT) / CURSOR_VIEWBOX_HEIGHT,
      5,
    );
    expect(CURSOR_GLYPH_LEFT).toBeCloseTo(
      -(CURSOR_TIP.x / CURSOR_VIEWBOX_WIDTH) * CURSOR_RENDERED_WIDTH,
      5,
    );
    expect(CURSOR_GLYPH_TOP).toBeCloseTo(
      -(CURSOR_TIP.y / CURSOR_VIEWBOX_HEIGHT) * CURSOR_RENDERED_HEIGHT,
      5,
    );
    const tipX = CURSOR_GLYPH_LEFT + (CURSOR_TIP.x / CURSOR_VIEWBOX_WIDTH) * CURSOR_RENDERED_WIDTH;
    const tipY = CURSOR_GLYPH_TOP + (CURSOR_TIP.y / CURSOR_VIEWBOX_HEIGHT) * CURSOR_RENDERED_HEIGHT;

    expect(tipX).toBeCloseTo(0, 5);
    expect(tipY).toBeCloseTo(0, 5);
  });

  it('keeps the lower-body pivot fixed while the tip moves through the wobble', () => {
    const tip = {
      x: CURSOR_GLYPH_LEFT + (CURSOR_TIP.x / CURSOR_VIEWBOX_WIDTH) * CURSOR_RENDERED_WIDTH,
      y: CURSOR_GLYPH_TOP + (CURSOR_TIP.y / CURSOR_VIEWBOX_HEIGHT) * CURSOR_RENDERED_HEIGHT,
    };
    const pivot = {
      x: CURSOR_GLYPH_LEFT
        + (CURSOR_WOBBLE_PIVOT.x / CURSOR_VIEWBOX_WIDTH) * CURSOR_RENDERED_WIDTH,
      y: CURSOR_GLYPH_TOP
        + (CURSOR_WOBBLE_PIVOT.y / CURSOR_VIEWBOX_HEIGHT) * CURSOR_RENDERED_HEIGHT,
    };
    const transformOrigin = {
      x: CURSOR_GLYPH_LEFT + CURSOR_TRANSFORM_ORIGIN_X,
      y: CURSOR_GLYPH_TOP + CURSOR_TRANSFORM_ORIGIN_Y,
    };

    expect(transformOrigin.x).toBeCloseTo(pivot.x, 5);
    expect(transformOrigin.y).toBeCloseTo(pivot.y, 5);

    const rotatedTips: Array<{ x: number; y: number }> = [];
    for (const degrees of [-31, -25]) {
      const radians = (degrees * Math.PI) / 180;
      const rotate = (point: { x: number; y: number }) => {
        const dx = point.x - transformOrigin.x;
        const dy = point.y - transformOrigin.y;
        return {
          x: transformOrigin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
          y: transformOrigin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
        };
      };
      const rotatedPivot = rotate(pivot);
      const rotatedTip = {
        ...rotate(tip),
      };

      expect(rotatedPivot.x).toBeCloseTo(pivot.x, 5);
      expect(rotatedPivot.y).toBeCloseTo(pivot.y, 5);
      expect(rotatedTip.x).not.toBeCloseTo(tip.x, 2);
      expect(rotatedTip.y).not.toBeCloseTo(tip.y, 2);
      rotatedTips.push(rotatedTip);
    }
    expect(rotatedTips[0].x).not.toBeCloseTo(rotatedTips[1].x, 2);
    expect(rotatedTips[0].y).not.toBeCloseTo(rotatedTips[1].y, 2);
  });

  it('builds the inline SVG from the shared geometry', () => {
    const view = new CursorView(document);
    const glyph = createCursorGlyph(document);

    expect(glyph.getAttribute('viewBox')).toBe(`0 0 ${CURSOR_VIEWBOX_WIDTH} ${CURSOR_VIEWBOX_HEIGHT}`);
    expect(glyph.querySelector('path')?.getAttribute('d')).toBe(CURSOR_PATH_D);
    view.dispose();
  });

  it('records the requested point on the audit host', () => {
    const view = new CursorView(document);
    view.move({ x: 120, y: 80 }, false);

    expect(view.host.dataset.aiPageChatCursorX).toBe('120');
    expect(view.host.dataset.aiPageChatCursorY).toBe('80');
    view.dispose();
  });
});
