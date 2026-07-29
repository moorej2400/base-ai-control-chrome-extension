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
export const CURSOR_CORNER_TRIM_PX = 1;
// One rendered CSS pixel maps to 1.5 SVG units at the default 30px cursor height.
const cursorCornerTrim = CURSOR_CORNER_TRIM_PX / cursorRenderScale;

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
const cursorRightBase = { x: CURSOR_CENTER_X + cursorBaseHalfWidth, y: cursorBaseY };
const cursorNotch = { x: CURSOR_CENTER_X, y: cursorNotchY };
const cursorLeftBase = { x: CURSOR_CENTER_X - cursorBaseHalfWidth, y: cursorBaseY };

const pointToward = (
  from: Readonly<{ x: number; y: number }>,
  toward: Readonly<{ x: number; y: number }>,
) => {
  const deltaX = toward.x - from.x;
  const deltaY = toward.y - from.y;
  const distance = Math.hypot(deltaX, deltaY);

  return {
    x: roundCursorGeometry(from.x + (deltaX / distance) * cursorCornerTrim),
    y: roundCursorGeometry(from.y + (deltaY / distance) * cursorCornerTrim),
  };
};

const formatPoint = (point: Readonly<{ x: number; y: number }>) => `${point.x} ${point.y}`;

const tipTowardRight = pointToward(CURSOR_TIP, cursorRightBase);
const rightTowardTip = pointToward(cursorRightBase, CURSOR_TIP);
const rightTowardNotch = pointToward(cursorRightBase, cursorNotch);
const leftTowardNotch = pointToward(cursorLeftBase, cursorNotch);
const leftTowardTip = pointToward(cursorLeftBase, CURSOR_TIP);
const tipTowardLeft = pointToward(CURSOR_TIP, cursorLeftBase);
const tipRightControl = {
  x: roundCursorGeometry((CURSOR_TIP.x + tipTowardRight.x) / 2),
  y: CURSOR_TIP.y,
};
const tipLeftControl = {
  x: roundCursorGeometry((CURSOR_TIP.x + tipTowardLeft.x) / 2),
  y: CURSOR_TIP.y,
};

export const CURSOR_PATH_D = [
  `M${formatPoint(CURSOR_TIP)}`,
  `Q${formatPoint(tipRightControl)} ${formatPoint(tipTowardRight)}`,
  `L${formatPoint(rightTowardTip)}`,
  `Q${formatPoint(cursorRightBase)} ${formatPoint(rightTowardNotch)}`,
  `L${formatPoint(cursorNotch)}`,
  `L${formatPoint(leftTowardNotch)}`,
  `Q${formatPoint(cursorLeftBase)} ${formatPoint(leftTowardTip)}`,
  `L${formatPoint(tipTowardLeft)}`,
  `Q${formatPoint(tipLeftControl)} ${formatPoint(CURSOR_TIP)}`,
  'Z',
].join(' ');
