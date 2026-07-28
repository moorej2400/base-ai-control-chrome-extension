import { describe, expect, it, vi } from 'vitest';
import { LegacyCommandHandler } from '../../../lib/agent-tools/browser-control/background/legacy-command-handler';
import type { BrowserDriver } from '../../../lib/agent-tools/browser-control/driver/types';

describe('LegacyCommandHandler', () => {
  it('executes batch operations in order using the matching driver methods', async () => {
    const driver = {
      click: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.test', title: 'Test', navigated: false }),
      fill: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.test', title: 'Test', navigated: false }),
    } as unknown as BrowserDriver;
    const handler = new LegacyCommandHandler(driver);

    const result = await handler.execute({
      type: 'page.actBatch',
      operations: [
        { type: 'click', ref: 'node-1' },
        { type: 'fill', ref: 'node-2', value: 'hello' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, results: [expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })] }));
    expect(driver.click).toHaveBeenCalledWith('node-1', { dblClick: undefined });
    expect(driver.fill).toHaveBeenCalledWith('node-2', 'hello');
  });
});
