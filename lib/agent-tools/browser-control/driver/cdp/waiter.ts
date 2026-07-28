export interface WaitConditionLike { selector?: string; text?: string; timeoutMs?: number }
export interface CdpWaiterTransport {
  evaluate(expression: string): Promise<{ value: boolean }>;
  onEvent(listener: (method: string) => void): () => void;
}

/** Event-driven wakeups prevent expensive repeated full-snapshot polling. */
export class CdpWaiter {
  constructor(private readonly transport: CdpWaiterTransport) {}

  async waitFor(condition: WaitConditionLike): Promise<{ found: boolean; waitedMs: number }> {
    const started = Date.now();
    const timeoutMs = Math.min(Math.max(condition.timeoutMs ?? 5_000, 100), 60_000);
    const expression = condition.selector
      ? `Boolean(document.querySelector(${JSON.stringify(condition.selector)}))`
      : `document.body?.innerText?.includes(${JSON.stringify(condition.text ?? '')}) ?? false`;
    while (Date.now() - started < timeoutMs) {
      if ((await this.transport.evaluate(expression)).value) return { found: true, waitedMs: Date.now() - started };
      await this.waitForWakeup(Math.min(250, timeoutMs - (Date.now() - started)));
    }
    return { found: false, waitedMs: Date.now() - started };
  }

  private waitForWakeup(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let remove = () => {};
      const timer = setTimeout(() => { remove(); resolve(); }, Math.max(0, timeoutMs));
      remove = this.transport.onEvent((method) => {
        if (method !== 'DOM.documentUpdated' && method !== 'Page.lifecycleEvent') return;
        clearTimeout(timer);
        remove();
        resolve();
      });
    });
  }
}
