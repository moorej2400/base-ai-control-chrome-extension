import type { CursorMove } from '@ai-page-chat/browser-control-protocol';

export interface CursorDeliveryApi {
  sendMessage(tabId: number, move: CursorMove): Promise<unknown>;
  executeScript(injection: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
}

/**
 * Delivers cursor movement to a tab and lazily installs the isolated-world
 * overlay after navigation or when browser control first targets that tab.
 */
export class CursorSender {
  constructor(private readonly api: CursorDeliveryApi) {}

  async send(tabId: number, move: CursorMove): Promise<void> {
    try {
      await this.api.sendMessage(tabId, move);
      return;
    } catch {
      await this.api.executeScript({
        target: { tabId },
        files: ['browser-control-overlay.js'],
      });
    }
    await this.api.sendMessage(tabId, move);
  }
}
