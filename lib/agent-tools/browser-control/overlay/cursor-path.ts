export interface Point { x: number; y: number }
export interface Viewport { width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Bounded cubic path; long jumps look intentional while short moves stay crisp. */
export function cursorPath(start: Point, end: Point, viewport: Viewport): Point[] {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance < 24) return [start, end];
  const perpendicular = { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance };
  const bend = Math.min(56, distance * 0.18);
  const control1 = bounded({ x: start.x + (end.x - start.x) * 0.32 + perpendicular.x * bend, y: start.y + (end.y - start.y) * 0.32 + perpendicular.y * bend }, viewport);
  const control2 = bounded({ x: start.x + (end.x - start.x) * 0.72 + perpendicular.x * bend * 0.35, y: start.y + (end.y - start.y) * 0.72 + perpendicular.y * bend * 0.35 }, viewport);
  return Array.from({ length: 13 }, (_, index) => {
    const t = index / 12;
    const inv = 1 - t;
    return bounded({
      x: inv ** 3 * start.x + 3 * inv ** 2 * t * control1.x + 3 * inv * t ** 2 * control2.x + t ** 3 * end.x,
      y: inv ** 3 * start.y + 3 * inv ** 2 * t * control1.y + 3 * inv * t ** 2 * control2.y + t ** 3 * end.y,
    }, viewport);
  });
}

function bounded(point: Point, viewport: Viewport): Point {
  return { x: clamp(point.x, 0, viewport.width), y: clamp(point.y, 0, viewport.height) };
}
