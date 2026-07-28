import type { CursorArrival, CursorMove } from '@ai-page-chat/browser-control-protocol';

export type CursorStatus = 'arrived' | 'hidden' | 'timed-out' | 'unavailable';
export interface CursorStateOptions {
  send(tabId: number, move: CursorMove): Promise<void>;
  isVisible(tabId: number): Promise<boolean>;
  timeoutMs?: number;
}

interface PendingArrival { move: CursorMove; resolve(status: CursorStatus): void; timer: ReturnType<typeof setTimeout> }

/** Coordinates observed content-script cursor arrival without ever blocking input forever. */
export class CursorState {
  private readonly pending = new Map<string, PendingArrival>();
  private readonly timeoutMs: number;

  constructor(private readonly options: CursorStateOptions) { this.timeoutMs = options.timeoutMs ?? 900; }

  async publish(tabId: number, move: CursorMove): Promise<CursorStatus> {
    if (!await this.options.isVisible(tabId)) return 'hidden';
    try {
      await this.options.send(tabId, move);
    } catch {
      return 'unavailable';
    }
    return new Promise((resolve) => {
      const key = this.key(move);
      const timer = setTimeout(() => {
        this.pending.delete(key);
        resolve('timed-out');
      }, this.timeoutMs);
      this.pending.set(key, { move, resolve, timer });
    });
  }

  arrived(arrival: CursorArrival): void {
    const key = this.key(arrival);
    const pending = this.pending.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    pending.resolve('arrived');
  }

  private key(value: Pick<CursorMove, 'sessionId' | 'turnId' | 'moveSequence'>): string {
    return `${value.sessionId}:${value.turnId}:${value.moveSequence}`;
  }
}
