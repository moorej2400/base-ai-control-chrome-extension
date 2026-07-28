import { describe, expect, it, vi } from 'vitest';
import { UpdateManager } from '@/lib/agent-tools/browser-control/background/update-manager';

describe('UpdateManager', () => {
  it('defers an update while control work or leases exist then reloads after cleanup', async () => {
    let busy = true;
    const reload = vi.fn();
    const cleanup = vi.fn(async () => {});
    const updates = new UpdateManager({ isBusy: () => busy, cleanup, reload });
    await updates.onUpdateAvailable('2.0.0');
    expect(reload).not.toHaveBeenCalled();
    busy = false;
    await updates.maybeReload();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
});
