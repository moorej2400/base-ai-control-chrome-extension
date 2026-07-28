import { describe, expect, it, vi } from 'vitest';
import { CursorState } from '@/lib/agent-tools/browser-control/background/cursor-state';

describe('CursorState', () => {
  it('waits only for matching visible-tab arrival and fails open on timeout', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => {});
    const state = new CursorState({ send, isVisible: async () => true, timeoutMs: 50 });
    const wait = state.publish(1, { type: 'cursor.move', sessionId: 's', turnId: 't', moveSequence: 2, overlayX: 10, overlayY: 20, pulse: false });
    state.arrived({ type: 'cursor.arrived', sessionId: 's', turnId: 'bad', moveSequence: 2 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(wait).resolves.toBe('timed-out');
    vi.useRealTimers();
  });

  it('skips animation in hidden tabs', async () => {
    const state = new CursorState({ send: async () => {}, isVisible: async () => false });
    await expect(state.publish(1, { type: 'cursor.move', sessionId: 's', turnId: 't', moveSequence: 1, overlayX: 1, overlayY: 2, pulse: false })).resolves.toBe('hidden');
  });
});
