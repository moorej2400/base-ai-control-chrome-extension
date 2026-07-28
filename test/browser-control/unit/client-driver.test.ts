import { describe, expect, it, vi } from 'vitest';
import { ClientDriver } from '../../../lib/agent-tools/browser-control/client/client-driver';

describe('ClientDriver', () => {
  it('keeps existing tool-facing results while sending protocol commands', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://example.test',
      title: 'Example',
      tree: 'button Save',
      headings: 'Example',
      nodeCount: 1,
      truncated: false,
    });
    const driver = new ClientDriver({ request });

    await expect(driver.snapshot()).resolves.toEqual(expect.objectContaining({ ok: true, tree: 'button Save' }));
    expect(request).toHaveBeenCalledWith({ type: 'page.snapshot', mode: undefined });
  });

  it('returns structured tool errors when the coordinator rejects a command', async () => {
    const driver = new ClientDriver({ request: vi.fn().mockRejectedValue(new Error('TAB_NOT_LEASED: claim it first')) });

    await expect(driver.click('node-1')).resolves.toEqual({ ok: false, error: 'TAB_NOT_LEASED: claim it first' });
  });
});
