import type { Point } from './cursor-path';
import {
  CURSOR_GLYPH_LEFT,
  CURSOR_GLYPH_TOP,
  CURSOR_PATH_D,
  CURSOR_RENDERED_HEIGHT,
  CURSOR_RENDERED_WIDTH,
  CURSOR_TRANSFORM_ORIGIN_X,
  CURSOR_TRANSFORM_ORIGIN_Y,
  CURSOR_VIEWBOX_HEIGHT,
  CURSOR_VIEWBOX_WIDTH,
} from './cursor-geometry';

export const CURSOR_VIEW_STYLES = `
  .cursor {
    position: fixed;
    width: 0;
    height: 0;
    opacity: 0;
    transition: opacity .12s;
  }
  .cursor-glyph {
    position: absolute;
    left: ${CURSOR_GLYPH_LEFT}px;
    top: ${CURSOR_GLYPH_TOP}px;
    width: ${CURSOR_RENDERED_WIDTH}px;
    height: ${CURSOR_RENDERED_HEIGHT}px;
    transform-origin: ${CURSOR_TRANSFORM_ORIGIN_X}px ${CURSOR_TRANSFORM_ORIGIN_Y}px;
    filter:
      drop-shadow(0 2px 2px rgb(0 0 0 / 48%))
      drop-shadow(0 6px 6px rgb(0 0 0 / 28%));
    animation: cursor-wobble 1.6s ease-in-out infinite alternate;
  }
  .cursor::after {
    content: '';
    position: absolute;
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    border: 2px solid #2f7cf6;
    border-radius: 50%;
    opacity: 0;
    transform: translate(-9px, -9px) scale(.2);
  }
  .cursor.pulse::after {
    animation: cursor-pulse .24s ease-out;
  }
  @keyframes cursor-wobble {
    from { transform: rotate(-31deg); }
    to { transform: rotate(-25deg); }
  }
  @keyframes cursor-pulse {
    from { opacity: 1; transform: translate(-9px, -9px) scale(.2); }
    to { opacity: 0; transform: translate(-9px, -9px) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor-glyph {
      animation: none;
      transform: rotate(-28deg);
    }
  }
`;

export function createCursorGlyph(doc: Document): SVGSVGElement {
  const glyph = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.classList.add('cursor-glyph');
  glyph.setAttribute('viewBox', `0 0 ${CURSOR_VIEWBOX_WIDTH} ${CURSOR_VIEWBOX_HEIGHT}`);
  glyph.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CURSOR_PATH_D);
  path.setAttribute('fill', '#2f7cf6');
  path.setAttribute('stroke', '#000');
  path.setAttribute('stroke-width', '1.75');
  path.setAttribute('stroke-linejoin', 'miter');
  glyph.append(path);
  return glyph;
}

export class CursorView {
  readonly host: HTMLElement;
  private readonly cursor: HTMLElement;

  constructor(private readonly doc: Document) {
    for (const stale of doc.querySelectorAll('[data-ai-page-chat-cursor]')) {
      stale.remove();
    }
    this.host = doc.createElement('div');
    this.host.dataset.aiPageChatCursor = '';
    this.host.setAttribute('aria-hidden', 'true');
    Object.assign(this.host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483646' });
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = CURSOR_VIEW_STYLES;
    this.cursor = doc.createElement('div');
    this.cursor.className = 'cursor';
    this.cursor.append(createCursorGlyph(doc));
    shadow.append(style, this.cursor);
    doc.documentElement.append(this.host);
  }

  move(point: Point, pulse: boolean): void {
    // Expose only rendered coordinates on the inert host so live alignment is
    // auditable even though the cursor visual itself is closed-shadow.
    this.host.dataset.aiPageChatCursorX = String(point.x);
    this.host.dataset.aiPageChatCursorY = String(point.y);
    this.cursor.style.left = `${point.x}px`;
    this.cursor.style.top = `${point.y}px`;
    this.cursor.style.opacity = '1';
    if (pulse) {
      this.cursor.classList.remove('pulse');
      void this.cursor.getBoundingClientRect();
      this.cursor.classList.add('pulse');
    }
  }

  dispose(): void { this.host.remove(); }
}
