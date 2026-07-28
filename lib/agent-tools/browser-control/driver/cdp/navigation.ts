export interface CdpNavigationTransport {
  send(method: string, params?: object): Promise<unknown>;
  onEvent(listener: (method: string, params?: unknown) => void): () => void;
}

export class CdpNavigation {
  constructor(private readonly transport: CdpNavigationTransport) {}

  async navigate(url: string, timeoutMs = 15_000): Promise<{ navigated: boolean; url: string }> {
    const result = await this.waitForNavigation(() => this.transport.send('Page.navigate', { url }), timeoutMs);
    return result ?? { navigated: false, url };
  }

  async navigateHistory(entryId: number, timeoutMs = 15_000): Promise<{ navigated: boolean; url: string }> {
    const result = await this.waitForNavigation(() => this.transport.send('Page.navigateToHistoryEntry', { entryId }), timeoutMs);
    return result ?? { navigated: false, url: '' };
  }

  private waitForNavigation(start: () => Promise<unknown>, timeoutMs: number): Promise<{ navigated: boolean; url: string } | undefined> {
    return new Promise(async (resolve, reject) => {
      let settled = false;
      let unsubscribe = () => {};
      const finish = (value: { navigated: boolean; url: string } | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      };
      const timer = setTimeout(() => finish(undefined), timeoutMs);
      unsubscribe = this.transport.onEvent((method, params) => {
        if (method !== 'Page.frameNavigated') return;
        const url = (params as { frame?: { url?: string } } | undefined)?.frame?.url;
        if (url) finish({ navigated: true, url });
      });
      try {
        await start();
      } catch (error) {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      }
    });
  }
}
