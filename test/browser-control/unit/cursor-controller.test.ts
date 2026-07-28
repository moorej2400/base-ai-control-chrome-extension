// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CursorController } from '@/lib/agent-tools/browser-control/overlay/cursor-controller';

afterEach(() => document.querySelectorAll('[data-ai-page-chat-cursor]').forEach((element) => element.remove()));

describe('CursorController', () => {
  it('creates a non-intercepting, hidden-to-accessibility overlay and acknowledges reduced motion', async () => {
    const arrived = vi.fn();
    const cursor = new CursorController({ document, reducedMotion: () => true, onArrived: arrived });
    await cursor.move({ type: 'cursor.move', sessionId: 's', turnId: 't', moveSequence: 1, overlayX: 30, overlayY: 40, pulse: true });
    const root = document.querySelector('[data-ai-page-chat-cursor]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.style.pointerEvents).toBe('none');
    expect(root.dataset.aiPageChatCursorX).toBe('30');
    expect(root.dataset.aiPageChatCursorY).toBe('40');
    expect(arrived).toHaveBeenCalledWith({ type: 'cursor.arrived', sessionId: 's', turnId: 't', moveSequence: 1 });
    cursor.dispose();
  });

  it('repairs the overlay root if a page removes it', () => {
    const cursor = new CursorController({ document, reducedMotion: () => true, onArrived: () => {} });
    const root = document.querySelector('[data-ai-page-chat-cursor]')!;
    root.remove();
    cursor.ensure();
    expect(document.querySelector('[data-ai-page-chat-cursor]')).toBeTruthy();
    cursor.dispose();
  });

  it('replaces a stale overlay left by a reloaded extension context', () => {
    const stale = new CursorController({ document, reducedMotion: () => true, onArrived: () => {} });
    const current = new CursorController({ document, reducedMotion: () => true, onArrived: () => {} });

    expect(document.querySelectorAll('[data-ai-page-chat-cursor]')).toHaveLength(1);

    stale.dispose();
    current.dispose();
  });

  it('cleans up its DOM and observers', () => {
    const cursor = new CursorController({ document, reducedMotion: () => true, onArrived: () => {} });
    cursor.dispose();
    expect(document.querySelector('[data-ai-page-chat-cursor]')).toBeNull();
  });
});
