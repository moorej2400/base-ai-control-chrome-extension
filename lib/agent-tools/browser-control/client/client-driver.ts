import type {
  ActionResult,
  BrowserDriver,
  DriverError,
  EvaluateResult,
  NavResult,
  ScreenshotResult,
  SnapshotOptions,
  SnapshotResult,
  TabInfo,
  WaitCondition,
  WaitResult,
} from '../driver/types';
import type { BrowserCommand } from '@ai-page-chat/browser-control-protocol';

export interface BrowserControlRequester {
  request(command: BrowserCommand): Promise<unknown>;
}

/** Preserves the existing model-facing BrowserDriver API while routing through the coordinator. */
export class ClientDriver implements BrowserDriver {
  constructor(private readonly client: BrowserControlRequester) {}

  async getTargetTab(): Promise<TabInfo> {
    const fallback = { id: -1, index: -1, title: '', url: '', active: false, isTarget: false };
    const result = await this.invoke<TabInfo>({ type: 'page.info' }, fallback);
    return isDriverError(result) ? fallback : result;
  }

  async setTargetTab(tabId: number): Promise<TabInfo | DriverError> {
    return this.invoke<TabInfo>({ type: 'tabs.select', tabId }, undefined);
  }

  async listTabs(): Promise<TabInfo[]> {
    const result = await this.invoke<{ tabs: TabInfo[] }>({ type: 'tabs.list' }, { tabs: [] });
    return isDriverError(result) ? [] : result.tabs;
  }

  navigate(url: string): Promise<NavResult> {
    return this.invoke<NavResult>({ type: 'page.navigate', url }, undefined);
  }

  navigateHistory(direction: 'back' | 'forward'): Promise<NavResult> {
    return this.invoke<NavResult>({ type: 'page.history', direction }, undefined);
  }

  newTab(url?: string): Promise<TabInfo | DriverError> {
    return this.invoke<TabInfo>({ type: 'tabs.create', url }, undefined);
  }

  closeTab(tabId?: number): Promise<{ ok: true } | DriverError> {
    return this.invoke<{ ok: true }>({ type: 'tabs.close', tabId }, undefined);
  }

  waitFor(cond: WaitCondition): Promise<WaitResult> {
    return this.invoke<WaitResult>({ type: 'page.wait', selector: cond.selector, text: cond.text, timeoutMs: cond.timeoutMs }, undefined);
  }

  snapshot(opts?: SnapshotOptions): Promise<SnapshotResult> {
    return this.invoke<SnapshotResult>({ type: 'page.snapshot', mode: opts?.mode }, undefined);
  }

  screenshot(): Promise<ScreenshotResult> {
    return this.invoke<ScreenshotResult>({ type: 'page.screenshot' }, undefined);
  }

  evaluate(expression: string): Promise<EvaluateResult> {
    return this.invoke<EvaluateResult>({ type: 'page.evaluate', expression }, undefined);
  }

  click(uid: string, opts?: { dblClick?: boolean }): Promise<ActionResult> {
    return this.invoke<ActionResult>({ type: 'page.click', ref: uid, doubleClick: opts?.dblClick }, undefined);
  }

  hover(uid: string): Promise<ActionResult> {
    return this.invoke<ActionResult>({ type: 'page.hover', ref: uid }, undefined);
  }

  fill(uid: string, value: string): Promise<ActionResult> {
    return this.invoke<ActionResult>({ type: 'page.fill', ref: uid, value }, undefined);
  }

  async fillForm(fields: Array<{ uid: string; value: string }>): Promise<ActionResult> {
    const result = await this.invoke<{ ok: true; results: ActionResult[] }>({
      type: 'page.actBatch',
      operations: fields.map((field) => ({ type: 'fill' as const, ref: field.uid, value: field.value })),
    }, undefined);
    if ('ok' in result && result.ok === false) return result;
    return result.results.at(-1) ?? { ok: false, error: 'No fields were supplied.' };
  }

  pressKey(key: string): Promise<ActionResult> {
    return this.invoke<ActionResult>({ type: 'page.key', key }, undefined);
  }

  scrollTo(uid: string): Promise<ActionResult> {
    return this.invoke<ActionResult>({ type: 'page.scroll', ref: uid }, undefined);
  }

  private async invoke<T>(command: BrowserCommand, fallback: T | undefined): Promise<T | DriverError> {
    try {
      return await this.client.request(command) as T;
    } catch (error) {
      if (fallback !== undefined) return fallback;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function isDriverError(value: unknown): value is DriverError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as { ok?: unknown }).ok === false;
}
