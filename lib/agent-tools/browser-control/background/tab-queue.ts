export class TabQueueError extends Error {
  constructor(readonly code: 'COMMAND_CANCELLED', message: string) {
    super(message);
  }
}

interface QueueEntry<T> {
  requestId: string;
  controller: AbortController;
  run: (signal: AbortSignal) => Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface QueueState {
  active?: QueueEntry<unknown>;
  pending: QueueEntry<unknown>[];
}

/** Serializes mutations per tab so a late click cannot race an earlier navigation. */
export class TabQueue {
  private readonly queues = new Map<number, QueueState>();

  enqueue<T>(tabId: number, requestId: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = { requestId, controller: new AbortController(), run, resolve, reject };
      const queue = this.queues.get(tabId) ?? { pending: [] };
      queue.pending.push(entry as QueueEntry<unknown>);
      this.queues.set(tabId, queue);
      void this.drain(tabId, queue);
    });
  }

  cancel(requestId: string): boolean {
    for (const [tabId, queue] of this.queues) {
      if (queue.active?.requestId === requestId) {
        queue.active.controller.abort();
        return true;
      }
      const pendingIndex = queue.pending.findIndex((entry) => entry.requestId === requestId);
      if (pendingIndex >= 0) {
        const [entry] = queue.pending.splice(pendingIndex, 1);
        entry.controller.abort();
        entry.reject(new TabQueueError('COMMAND_CANCELLED', 'Queued browser command was cancelled.'));
        if (!queue.active && queue.pending.length === 0) this.queues.delete(tabId);
        return true;
      }
    }
    return false;
  }

  private async drain(tabId: number, queue: QueueState): Promise<void> {
    if (queue.active) return;
    while (queue.pending.length > 0) {
      const entry = queue.pending.shift()!;
      queue.active = entry;
      try {
        entry.resolve(await entry.run(entry.controller.signal));
      } catch (error) {
        entry.reject(error);
      } finally {
        queue.active = undefined;
      }
    }
    if (queue.pending.length === 0) this.queues.delete(tabId);
  }
}
