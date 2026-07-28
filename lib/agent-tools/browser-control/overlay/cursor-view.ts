import type { Point } from './cursor-path';

export class CursorView {
  readonly host: HTMLElement;
  private readonly cursor: HTMLElement;

  constructor(private readonly doc: Document) {
    this.host = doc.createElement('div');
    this.host.dataset.aiPageChatCursor = '';
    this.host.setAttribute('aria-hidden', 'true');
    Object.assign(this.host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483646' });
    const shadow = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = `.cursor { position: fixed; width: 18px; height: 24px; opacity: 0; transform: translate(-2px,-2px); transition: opacity .12s; } .cursor::before { content: ''; display:block; width:0; height:0; border-left: 10px solid #2f7cf6; border-top: 7px solid transparent; border-bottom: 7px solid transparent; filter: drop-shadow(0 1px 2px #0008); } .pulse { animation: pulse .24s ease-out; } @keyframes pulse { 0% { filter: drop-shadow(0 0 0 #2f7cf6); } 100% { filter: drop-shadow(0 0 12px #2f7cf600); } }`;
    this.cursor = doc.createElement('div');
    this.cursor.className = 'cursor';
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
