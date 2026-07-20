// Design tokens for the J Chat side panel.
//
// This is a faithful translation of the `tokens(dark, hue)` palette from the
// source-of-truth mockup (J Chat v3). Every value here is intentionally exact —
// the UI is meant to look pixel-identical to the mock, so do not "round" colors
// or swap oklch for hex. The accent ramp is parameterized by a single hue so the
// six accent swatches (and any future ones) all derive from one number.

/** The accent hues offered as swatches, in the mock's order. */
export const ACCENT_HUES = [286, 252, 215, 152, 75, 18] as const;
export type AccentHue = (typeof ACCENT_HUES)[number];

/** Human labels for each swatch, mirroring the mock. */
export const ACCENT_NAMES: Record<number, string> = {
  286: 'Violet',
  252: 'Blue',
  215: 'Cyan',
  152: 'Green',
  75: 'Amber',
  18: 'Rose',
};

/** Mock defaults: dark mode, violet accent. */
export const DEFAULT_DARK = true;
export const DEFAULT_HUE = 286;

/**
 * A flat map of CSS custom property name -> value for the given mode + hue.
 * Keys are the exact `--foo` names the components and stylesheet consume.
 */
export type ThemeVars = Record<string, string>;

export function buildThemeVars(dark: boolean, hue: number): ThemeVars {
  const h = String(hue);
  if (dark) {
    return {
      '--backdrop': 'radial-gradient(circle at 30% 18%, #2a2723, #131210)',
      '--panel-shadow': 'rgba(0,0,0,0.6)',
      '--ring': 'rgba(255,255,255,0.07)',
      '--bg': '#1b1a18',
      '--surface': '#242220',
      '--raised': '#2c2a26',
      '--border': '#34322e',
      '--border2': '#3c3934',
      '--chip': '#2e2c28',
      '--hover': '#34322e',
      '--text': '#f3efe8',
      '--text2': '#e7e2d9',
      '--mid': '#b2aca2',
      '--faint': '#8a857b',
      '--dim': '#6c685f',
      '--accent': `oklch(0.66 0.16 ${h})`,
      '--accent-hover': `oklch(0.71 0.16 ${h})`,
      '--accent-tint': `oklch(0.34 0.065 ${h})`,
      '--accent-tint-bd': `oklch(0.44 0.085 ${h})`,
      '--accent-text': `oklch(0.82 0.10 ${h})`,
      '--accent-glow': `oklch(0.66 0.16 ${h} / 0.45)`,
      '--focus-ring': `0 0 0 3px oklch(0.66 0.16 ${h} / 0.30)`,
      '--accent-deep': `oklch(0.54 0.16 ${h})`,
      '--ok': '#5cba7c',
      '--ok-tint': '#1d2a20',
      '--warm-tint': '#33271d',
      '--blue-tint': '#1e2730',
      '--del-bg': '#3a2120',
      '--del': '#dd8f8f',
      '--del-mark': '#e59494',
      '--add-bg': '#1d2d22',
      '--add': '#7fc79a',
      '--add-mark': '#7fc79a',
      '--err-bg': '#2f1f1a',
      '--err-bd': '#4c302a',
      '--err-title': '#e7a28d',
      '--err-text': '#cd998c',
      '--err-btn': '#c6604f',
      '--err-btn-hover': '#d06e5d',
      '--err-btn-bd': '#4c302a',
      '--star': '#e0a33a',
      '--send-off': '#3c3934',
    };
  }
  return {
    '--backdrop': 'radial-gradient(circle at 30% 18%, #ceccc6, #b9b5ad)',
    '--panel-shadow': 'rgba(40,36,30,0.5)',
    '--ring': 'rgba(40,36,30,0.07)',
    '--bg': '#fbfaf8',
    '--surface': '#ffffff',
    '--raised': '#faf9f6',
    '--border': '#ece9e3',
    '--border2': '#e6e3dc',
    '--chip': '#f3f1ec',
    '--hover': '#f0ede7',
    '--text': '#211f1c',
    '--text2': '#2a2722',
    '--mid': '#6b6660',
    '--faint': '#9b958b',
    '--dim': '#a8a298',
    '--accent': `oklch(0.55 0.17 ${h})`,
    '--accent-hover': `oklch(0.49 0.17 ${h})`,
    '--accent-tint': `oklch(0.955 0.028 ${h})`,
    '--accent-tint-bd': `oklch(0.89 0.055 ${h})`,
    '--accent-text': `oklch(0.47 0.15 ${h})`,
    '--accent-glow': `oklch(0.55 0.17 ${h} / 0.4)`,
    '--focus-ring': `0 0 0 3px oklch(0.55 0.17 ${h} / 0.22)`,
    '--accent-deep': `oklch(0.44 0.17 ${h})`,
    '--ok': '#3f9e5e',
    '--ok-tint': '#eef3ee',
    '--warm-tint': '#f6f0ee',
    '--blue-tint': '#eef2f6',
    '--del-bg': '#fcecec',
    '--del': '#a85656',
    '--del-mark': '#cc6b6b',
    '--add-bg': '#eaf6ee',
    '--add': '#3a7a52',
    '--add-mark': '#4f9e6a',
    '--err-bg': '#fcf0ee',
    '--err-bd': '#f1d9d4',
    '--err-title': '#9c4636',
    '--err-text': '#a86b5e',
    '--err-btn': '#c6604f',
    '--err-btn-hover': '#b25342',
    '--err-btn-bd': '#ecd2cc',
    '--star': '#e0a33a',
    '--send-off': '#cdcabf',
  };
}

/** Fill swatch color for an accent hue (used by the accent-color picker). */
export function accentSwatchFill(hue: number): string {
  return `oklch(0.62 0.18 ${hue})`;
}
