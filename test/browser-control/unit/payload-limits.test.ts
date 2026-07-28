import { afterEach, describe, expect, it, vi } from 'vitest';
import { CdpScreenshots, PAYLOAD_LIMITS } from '@/lib/agent-tools/browser-control/driver/cdp/screenshots';
import { enforceSnapshotLimit } from '@/lib/agent-tools/browser-control/driver/cdp/screenshots';
import { formatSnapshot } from '@/lib/agent-tools/browser-control/driver/cdp/snapshot-format';

describe('browser-control payload limits', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts a screenshot at the raw cap and retries one oversized screenshot compressed', async () => {
    const rawAtCap = Buffer.alloc(PAYLOAD_LIMITS.rawScreenshotBytes).toString('base64');
    const compressed = Buffer.alloc(10).toString('base64');
    const send = vi.fn()
      .mockResolvedValueOnce({ data: rawAtCap })
      .mockResolvedValueOnce({ data: Buffer.alloc(PAYLOAD_LIMITS.rawScreenshotBytes + 1).toString('base64') })
      .mockResolvedValueOnce({ data: compressed });
    const screenshots = new CdpScreenshots({ send });
    await expect(screenshots.capture()).resolves.toMatch(/^data:image\/jpeg;base64,/);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(screenshots.capture()).resolves.toContain(compressed);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][1]).toEqual(expect.objectContaining({ quality: 60, scale: 0.5 }));
  });

  it('refuses a screenshot still over the base64 cap after one downscale', async () => {
    const tooLarge = Buffer.alloc(Math.ceil(PAYLOAD_LIMITS.base64ScreenshotBytes * 0.76)).toString('base64');
    const screenshots = new CdpScreenshots({ send: vi.fn().mockResolvedValue({ data: tooLarge }) });
    await expect(screenshots.capture()).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('keeps snapshots protocol-safe at 256 KiB', () => {
    expect(enforceSnapshotLimit('a'.repeat(PAYLOAD_LIMITS.snapshotBytes))).toHaveLength(PAYLOAD_LIMITS.snapshotBytes);
    expect(enforceSnapshotLimit('a'.repeat(PAYLOAD_LIMITS.snapshotBytes + 1))).toBeUndefined();
  });

  it('uses Web Platform byte sizing instead of Node Buffer.byteLength', async () => {
    vi.spyOn(Buffer, 'byteLength').mockImplementation(() => {
      throw new Error('MV3 does not provide Buffer.byteLength');
    });
    const screenshots = new CdpScreenshots({ send: vi.fn().mockResolvedValue({ data: 'AQID' }) });

    await expect(screenshots.capture()).resolves.toBe('data:image/jpeg;base64,AQID');
    expect(enforceSnapshotLimit('é'.repeat(4))).toHaveLength(4);
    expect(formatSnapshot({
      nodes: [{ ref: 'r1', role: 'button', name: 'é'.repeat(4), states: [] }],
      mode: 'interactive',
      maxBytes: 10,
    }).truncated).toBe(true);
  });
});
