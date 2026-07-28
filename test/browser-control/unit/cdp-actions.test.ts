import { describe, expect, it, vi } from 'vitest';
import { CdpInput } from '@/lib/agent-tools/browser-control/driver/cdp/input';

describe('CDP trusted input', () => {
  it('uses the resolved ActionPoint for trusted click input', async () => {
    const send = vi.fn<(method: string, params?: object) => Promise<unknown>>(async () => ({}));
    const input = new CdpInput({ send });
    await input.click({ topLevelLayoutX: 40, topLevelLayoutY: 80, overlayX: 40, overlayY: 80, visualViewportScale: 1 }, false);
    expect(send.mock.calls).toEqual([
      ['Input.dispatchMouseEvent', expect.objectContaining({ type: 'mouseMoved', x: 40, y: 80, buttons: 0, pointerType: 'mouse' })],
      ['Input.dispatchMouseEvent', expect.objectContaining({ type: 'mousePressed', x: 40, y: 80, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' })],
      ['Input.dispatchMouseEvent', expect.objectContaining({ type: 'mouseReleased', x: 40, y: 80, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' })],
    ]);
  });

  it('uses focus, select-all, delete, and insertText for replacement', async () => {
    const send = vi.fn<(method: string, params?: object) => Promise<unknown>>(async () => ({}));
    const input = new CdpInput({ send });
    await input.replaceText('new value');
    expect(send.mock.calls.map(([method]) => method)).toEqual([
      'Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText',
    ]);
    expect(send).toHaveBeenLastCalledWith('Input.insertText', { text: 'new value' });
  });
});
