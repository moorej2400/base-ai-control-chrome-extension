import { describe, expect, it } from 'vitest';
import { CoordinateMapper } from '@/lib/agent-tools/browser-control/driver/cdp/coordinate-mapper';

describe('CoordinateMapper', () => {
  it('keeps the top-frame viewport point aligned with CDP input and the overlay', () => {
    const point = new CoordinateMapper().map({
      target: { x: 120, y: 80 },
      visualViewport: { offsetX: 20, offsetY: 30, scale: 1.25 },
      frames: [],
    });
    expect(point).toEqual({ topLevelLayoutX: 120, topLevelLayoutY: 80, overlayX: 120, overlayY: 80, visualViewportScale: 1.25 });
  });

  it('accumulates nested iframe owner offsets using actual content quads', () => {
    const point = new CoordinateMapper().map({
      target: { x: 25, y: 10 },
      visualViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      frames: [
        { contentWidth: 50, contentHeight: 50, quad: [10, 20, 110, 20, 110, 120, 10, 120] },
        { contentWidth: 100, contentHeight: 100, quad: [100, 50, 300, 50, 300, 250, 100, 250] },
      ],
    });
    expect(point.topLevelLayoutX).toBe(220);
    expect(point.topLevelLayoutY).toBe(130);
  });

  it('uses an affine quad transform for a rotated iframe rather than translation only', () => {
    const point = new CoordinateMapper().map({
      target: { x: 50, y: 50 },
      visualViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      frames: [{ contentWidth: 100, contentHeight: 100, quad: [0, 0, 100, 100, 0, 200, -100, 100] }],
    });
    expect(point.topLevelLayoutX).toBe(0);
    expect(point.topLevelLayoutY).toBe(100);
  });
});
