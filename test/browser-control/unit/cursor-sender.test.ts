import { describe, expect, it, vi } from 'vitest';
import { CursorSender } from '@/lib/agent-tools/browser-control/background/cursor-sender';

const move = {
  type: 'cursor.move' as const,
  sessionId: 'session-1',
  turnId: 'turn-1',
  moveSequence: 1,
  overlayX: 10,
  overlayY: 20,
  pulse: true,
};

describe('cursor sender', () => {
  it('injects the overlay on demand when a tab has no receiver', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce(undefined);
    const executeScript = vi.fn().mockResolvedValue([]);
    const sender = new CursorSender({ sendMessage, executeScript });

    await sender.send(42, move);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['browser-control-overlay.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
