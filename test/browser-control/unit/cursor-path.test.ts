import { describe, expect, it } from 'vitest';
import { cursorPath, type Viewport } from '@/lib/agent-tools/browser-control/overlay/cursor-path';

const viewport: Viewport = { width: 400, height: 300 };

describe('cursor paths', () => {
  it('keeps long cubic cursor paths inside the visible viewport', () => {
    const path = cursorPath({ x: 10, y: 10 }, { x: 390, y: 290 }, viewport);
    expect(path.length).toBeGreaterThan(3);
    for (const point of path) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(400);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(300);
    }
  });

  it('uses a direct short path without meaningful overshoot', () => {
    expect(cursorPath({ x: 100, y: 100 }, { x: 110, y: 108 }, viewport)).toEqual([
      { x: 100, y: 100 }, { x: 110, y: 108 },
    ]);
  });
});
