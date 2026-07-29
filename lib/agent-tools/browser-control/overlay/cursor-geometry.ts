export const CURSOR_CENTER_X = 20.5;
export const CURSOR_BASE_WIDTH = 33;
export const CURSOR_HEIGHT = 41;
export const CURSOR_NOTCH_DEPTH = 9;
export const CURSOR_TIP = { x: CURSOR_CENTER_X, y: 1.5 } as const;

export const CURSOR_VIEWBOX_WIDTH = 41;
export const CURSOR_VIEWBOX_HEIGHT = 45;
export const CURSOR_RENDERED_HEIGHT = 30;

// Keep the CSS hotspot values stable at the precision used by the SVG overlay.
const roundCursorGeometry = (value: number) => Number(value.toFixed(6));
const cursorRenderScale = CURSOR_RENDERED_HEIGHT / CURSOR_VIEWBOX_HEIGHT;

export const CURSOR_RENDERED_WIDTH = roundCursorGeometry(CURSOR_VIEWBOX_WIDTH * cursorRenderScale);
export const CURSOR_GLYPH_LEFT = roundCursorGeometry(-CURSOR_TIP.x * cursorRenderScale);
export const CURSOR_GLYPH_TOP = roundCursorGeometry(-CURSOR_TIP.y * cursorRenderScale);
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

const cursorBaseHalfWidth = CURSOR_BASE_WIDTH / 2;
const cursorBaseY = CURSOR_TIP.y + CURSOR_HEIGHT;
const cursorNotchY = cursorBaseY - CURSOR_NOTCH_DEPTH;

export const CURSOR_PATH_D = [
  `M${CURSOR_TIP.x} ${CURSOR_TIP.y}`,
  `L${CURSOR_CENTER_X + cursorBaseHalfWidth} ${cursorBaseY}`,
  `L${CURSOR_CENTER_X} ${cursorNotchY}`,
  `L${CURSOR_CENTER_X - cursorBaseHalfWidth} ${cursorBaseY}`,
  'Z',
].join(' ');
