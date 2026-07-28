import type { CursorArrival, CursorMove } from '@ai-page-chat/browser-control-protocol';
import { cursorPath, type Point } from './cursor-path';
import { CursorView } from './cursor-view';

export interface CursorControllerOptions {
  document: Document;
  reducedMotion: () => boolean;
  onArrived: (arrival: CursorArrival) => void;
}

export class CursorController {
  private view?: CursorView;
  private point?: Point;
  private observer?: MutationObserver;

  constructor(private readonly options: CursorControllerOptions) { this.ensure(); }

  ensure(): void {
    if (this.view?.host.isConnected) return;
    this.view?.dispose();
    this.view = new CursorView(this.options.document);
    this.observer ??= new MutationObserver(() => {
      if (!this.view?.host.isConnected) this.ensure();
    });
    this.observer.observe(this.options.document.documentElement, { childList: true, subtree: true });
  }

  async move(move: CursorMove): Promise<void> {
    this.ensure();
    const target = { x: move.overlayX, y: move.overlayY };
    if (this.options.reducedMotion() || !this.point) this.view!.move(target, move.pulse);
    else await this.animate(this.point, target, move.pulse);
    this.point = target;
    this.options.onArrived({ type: 'cursor.arrived', sessionId: move.sessionId, turnId: move.turnId, moveSequence: move.moveSequence });
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.view?.dispose();
    this.view = undefined;
  }

  private animate(start: Point, target: Point, pulse: boolean): Promise<void> {
    const viewport = this.options.document.defaultView?.visualViewport;
    const width = viewport?.width ?? this.options.document.documentElement.clientWidth;
    const height = viewport?.height ?? this.options.document.documentElement.clientHeight;
    const path = cursorPath(start, target, { width, height });
    return new Promise((resolve) => {
      let index = 0;
      const frame = () => {
        this.view!.move(path[index], pulse && index === path.length - 1);
        index += 1;
        if (index >= path.length) resolve();
        else (this.options.document.defaultView?.requestAnimationFrame ?? ((fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16)))(frame);
      };
      frame();
    });
  }
}
