import type { BrowserCommand } from '@ai-page-chat/browser-control-protocol';
import type { BrowserDriver } from '../driver/types';
import { executeActionBatch } from './action-batch';

/** Adapts the existing driver while the coordinator is introduced ahead of CDP. */
export class LegacyCommandHandler {
  constructor(private readonly driver: BrowserDriver) {}

  async execute(command: BrowserCommand): Promise<unknown> {
    switch (command.type) {
      case 'page.snapshot':
        return this.driver.snapshot({ mode: command.mode });
      case 'page.screenshot':
        return this.driver.screenshot();
      case 'page.navigate':
        return this.driver.navigate(command.url);
      case 'page.history':
        return this.driver.navigateHistory(command.direction);
      case 'page.wait':
        return this.driver.waitFor({ selector: command.selector, text: command.text, timeoutMs: command.timeoutMs });
      case 'page.click':
        return this.driver.click(command.ref, { dblClick: command.doubleClick });
      case 'page.hover':
        return this.driver.hover(command.ref);
      case 'page.fill':
      case 'page.select':
        return this.driver.fill(command.ref, command.value);
      case 'page.key':
        return this.driver.pressKey(command.key);
      case 'page.scroll':
        if (!command.ref) return { ok: false, error: 'Legacy driver requires an element reference to scroll.' };
        return this.driver.scrollTo(command.ref);
      case 'page.evaluate':
        return this.driver.evaluate(command.expression);
      case 'page.actBatch': {
        return executeActionBatch(command.operations, async (operation) => {
          const result = await this.executeBatchOperation(operation as Extract<BrowserCommand, { type: 'page.actBatch' }>['operations'][number]);
          if (isFailedDriverResult(result)) return result;
          return result as { ok: boolean; navigated?: boolean };
        });
      }
      default:
        return { ok: false, error: `Legacy driver cannot execute ${command.type}.` };
    }
  }

  private executeBatchOperation(
    operation: Extract<BrowserCommand, { type: 'page.actBatch' }>['operations'][number],
  ): Promise<unknown> {
    switch (operation.type) {
      case 'click':
        return this.driver.click(operation.ref, { dblClick: operation.doubleClick });
      case 'hover':
        return this.driver.hover(operation.ref);
      case 'fill':
      case 'select':
        return this.driver.fill(operation.ref, operation.value);
      case 'key':
        return this.driver.pressKey(operation.key);
      case 'scroll':
        return operation.ref
          ? this.driver.scrollTo(operation.ref)
          : Promise.resolve({ ok: false, error: 'Legacy driver requires an element reference to scroll.' });
    }
  }
}

export function isFailedDriverResult(value: unknown): value is { ok: false; error: string } {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as { ok?: unknown }).ok === false;
}
