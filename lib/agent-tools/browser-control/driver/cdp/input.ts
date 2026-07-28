import type { ActionPoint } from './coordinate-mapper';

export interface CdpInputTransport {
  send(method: string, params?: object): Promise<unknown>;
}

/** Trusted pointer and keyboard input, never page-script event synthesis. */
export class CdpInput {
  constructor(private readonly transport: CdpInputTransport) {}

  async click(point: ActionPoint, doubleClick: boolean): Promise<void> {
    const clickCount = doubleClick ? 2 : 1;
    const position = {
      x: point.topLevelLayoutX,
      y: point.topLevelLayoutY,
      pointerType: 'mouse',
    };
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', ...position, button: 'none', buttons: 0,
    });
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', ...position, button: 'left', buttons: 1, clickCount,
    });
    await this.transport.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', ...position, button: 'left', buttons: 0, clickCount,
    });
  }

  hover(point: ActionPoint): Promise<unknown> {
    return this.transport.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.topLevelLayoutX, y: point.topLevelLayoutY });
  }

  async replaceText(text: string): Promise<void> {
    await this.transport.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
    await this.transport.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
    await this.transport.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace' });
    await this.transport.send('Input.insertText', { text });
  }

  async pressKey(key: string): Promise<void> {
    await this.transport.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
    await this.transport.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
  }

  scroll(point: Pick<ActionPoint, 'topLevelLayoutX' | 'topLevelLayoutY'>, deltaY: number): Promise<unknown> {
    return this.transport.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: point.topLevelLayoutX, y: point.topLevelLayoutY, deltaX: 0, deltaY });
  }
}
