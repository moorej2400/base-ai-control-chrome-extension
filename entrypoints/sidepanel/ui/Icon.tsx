// Single source for every SVG glyph used in the panel, ported verbatim from the
// mock. Stroke icons inherit `currentColor`; a few (star, github, play, dots)
// are fill glyphs. Paths are static literals, so dangerouslySetInnerHTML here is
// safe and keeps the registry compact.

export type IconName =
  | 'menu'
  | 'plus'
  | 'gear'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'x'
  | 'zap'
  | 'file'
  | 'file-plain'
  | 'brain'
  | 'check'
  | 'check-circle'
  | 'pencil'
  | 'copy'
  | 'refresh'
  | 'dots'
  | 'alert'
  | 'paperclip'
  | 'send'
  | 'search'
  | 'star'
  | 'maximize'
  | 'rows'
  | 'link2'
  | 'database'
  | 'trash'
  | 'shield'
  | 'download'
  | 'clipboard'
  | 'external'
  | 'eye'
  | 'github'
  | 'play';

interface IconDef {
  body: string;
  fill?: boolean;
  sw?: number;
  viewBox?: string;
}

const ICONS: Record<IconName, IconDef> = {
  menu: { body: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
  plus: { body: '<path d="M12 5v14M5 12h14"/>', sw: 2 },
  gear: {
    body: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
  'chevron-right': { body: '<path d="M9 6l6 6-6 6"/>', sw: 2.2 },
  'chevron-down': { body: '<path d="M6 9l6 6 6-6"/>', sw: 2.2 },
  'chevron-left': { body: '<path d="M15 18l-6-6 6-6"/>', sw: 2.2 },
  x: { body: '<path d="M18 6L6 18M6 6l12 12"/>', sw: 2.2 },
  zap: { body: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>', sw: 2 },
  file: { body: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>' },
  'file-plain': { body: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>', sw: 2.2 },
  brain: { body: '<path d="M9.5 2A6.5 6.5 0 0 0 6 14.3V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.7A6.5 6.5 0 0 0 9.5 2z"/><path d="M9 21h2"/>' },
  check: { body: '<path d="M20 6L9 17l-5-5"/>', sw: 2.5 },
  'check-circle': { body: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>', sw: 2.2 },
  pencil: { body: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>' },
  copy: { body: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' },
  refresh: { body: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>' },
  dots: { body: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', fill: true },
  alert: { body: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>' },
  paperclip: { body: '<path d="M21.4 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>' },
  send: { body: '<path d="M12 19V5M5 12l7-7 7 7"/>', sw: 2.2 },
  search: { body: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>' },
  star: { body: '<path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/>', fill: true, sw: 1.5 },
  maximize: { body: '<path d="M9 3H5a2 2 0 0 0-2 2v4M3 15v4a2 2 0 0 0 2 2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4"/>' },
  rows: { body: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>' },
  link2: { body: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>' },
  database: { body: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>' },
  trash: { body: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' },
  shield: { body: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
  download: { body: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>' },
  clipboard: { body: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/>' },
  external: { body: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>', sw: 2.2 },
  eye: { body: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>' },
  github: {
    body: '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>',
    fill: true,
    viewBox: '0 0 16 16',
  },
  play: { body: '<polygon points="6 4 18 12 6 20 6 4"/>', fill: true },
};

export default function Icon({
  name,
  size = 16,
  strokeWidth,
  color,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const def = ICONS[name];
  const fill = def.fill;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={def.viewBox ?? '0 0 24 24'}
      fill={fill ? color ?? 'currentColor' : 'none'}
      stroke={fill ? 'none' : color ?? 'currentColor'}
      strokeWidth={fill ? undefined : strokeWidth ?? def.sw ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: def.body }}
    />
  );
}
