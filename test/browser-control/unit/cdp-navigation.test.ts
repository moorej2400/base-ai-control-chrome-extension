import { describe, expect, it, vi } from 'vitest';
import { CdpNavigation } from '@/lib/agent-tools/browser-control/driver/cdp/navigation';
import { CdpWaiter } from '@/lib/agent-tools/browser-control/driver/cdp/waiter';

describe('CDP navigation and waiting', () => {
  it('registers navigation listeners before issuing Page.navigate', async () => {
    let event: ((method: string, params?: unknown) => void) | undefined;
    const onEvent = vi.fn((listener) => { event = listener; return () => {}; });
    const send = vi.fn(async (method: string) => {
      if (method === 'Page.navigate') queueMicrotask(() => event?.('Page.frameNavigated', { frame: { url: 'https://after.test' } }));
      return {};
    });
    const nav = new CdpNavigation({ send, onEvent });
    const result = await nav.navigate('https://after.test', 100);
    expect(onEvent).toHaveBeenCalledBefore(send);
    expect(result).toEqual({ navigated: true, url: 'https://after.test' });
  });

  it('uses event-backed bounded polling for a page wait', async () => {
    let checks = 0;
    const waiter = new CdpWaiter({
      evaluate: async () => ({ value: ++checks > 1 }),
      onEvent: (listener) => { queueMicrotask(() => listener('DOM.documentUpdated')); return () => {}; },
    });
    const result = await waiter.waitFor({ selector: '#ready', timeoutMs: 100 });
    expect(result.found).toBe(true);
    expect(checks).toBeGreaterThanOrEqual(2);
  });

  it('waits for a history navigation event before returning', async () => {
    let event: ((method: string, params?: unknown) => void) | undefined;
    const send = vi.fn(async (method: string) => {
      if (method === 'Page.navigateToHistoryEntry') queueMicrotask(() => event?.('Page.frameNavigated', { frame: { url: 'https://before.test' } }));
      return {};
    });
    const nav = new CdpNavigation({ send, onEvent: (listener) => { event = listener; return () => {}; } });

    await expect(nav.navigateHistory(42, 100)).resolves.toEqual({ navigated: true, url: 'https://before.test' });
    expect(send).toHaveBeenCalledWith('Page.navigateToHistoryEntry', { entryId: 42 });
  });
});
