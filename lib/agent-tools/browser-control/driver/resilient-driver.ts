import type {
  ActionResult,
  BrowserDriver,
  DriverError,
  EvaluateResult,
  NavResult,
  ScreenshotResult,
  SessionDriverFactory,
  SnapshotOptions,
  SnapshotResult,
  TabInfo,
  WaitCondition,
  WaitResult,
} from './types';
import { createExtensionDriver } from './extension/extension-driver';

interface SessionFallback {
  active: boolean;
  driver: BrowserDriver;
  screenshotTurnId?: string;
  turnId?: string;
}

type ResultWithError = { ok: boolean; error?: string };

/**
 * Keeps CDP as the preferred engine while surviving Chrome's hard refusal to
 * debug pages that expose another extension's frame (for example, 1Password).
 * Fallback state and DOM-reference epochs remain isolated per browser session.
 */
export class ResilientDriverFactory implements SessionDriverFactory {
  private readonly fallbacks = new Map<string, SessionFallback>();

  constructor(
    private readonly primary: SessionDriverFactory,
    private readonly createFallback: (
      browserSessionId: string,
      getTurnId: () => string | undefined,
    ) => BrowserDriver = (browserSessionId, getTurnId) =>
      createExtensionDriver({ browserSessionId, getTurnId }),
  ) {}

  forSession(browserSessionId: string, turnId?: string): BrowserDriver {
    let fallback = this.fallbacks.get(browserSessionId);
    if (!fallback) {
      fallback = this.createFallbackState(browserSessionId, turnId);
      this.fallbacks.set(browserSessionId, fallback);
    }
    fallback.turnId = turnId;
    return new ResilientSessionDriver(
      this.primary.forSession(browserSessionId, turnId),
      fallback,
      turnId,
    );
  }

  async claimTab(browserSessionId: string, tabId: number): Promise<void> {
    try {
      await this.primary.claimTab?.(browserSessionId, tabId);
    } catch (error) {
      if (!isDebuggerUnavailable(error instanceof Error ? error.message : String(error))) throw error;
      const fallback = this.fallbackFor(browserSessionId);
      fallback.active = true;
      const selected = await fallback.driver.setTargetTab(tabId);
      if ('ok' in selected && !selected.ok) throw new Error(selected.error);
    }
  }

  async releaseTab(browserSessionId: string, tabId: number): Promise<void> {
    await this.primary.releaseTab?.(browserSessionId, tabId).catch(() => {});
  }

  async releaseSession(browserSessionId: string): Promise<void> {
    this.fallbacks.delete(browserSessionId);
    // Chrome may have already forced the root debugger closed. Session/lease
    // cleanup must still complete when the redundant detach rejects.
    await this.primary.releaseSession?.(browserSessionId).catch(() => {});
  }

  private fallbackFor(browserSessionId: string): SessionFallback {
    let fallback = this.fallbacks.get(browserSessionId);
    if (!fallback) {
      fallback = this.createFallbackState(browserSessionId);
      this.fallbacks.set(browserSessionId, fallback);
    }
    return fallback;
  }

  private createFallbackState(browserSessionId: string, turnId?: string): SessionFallback {
    const state = { active: false, driver: undefined as unknown as BrowserDriver, turnId };
    state.driver = this.createFallback(browserSessionId, () => state.turnId);
    return state;
  }
}

class ResilientSessionDriver implements BrowserDriver {
  constructor(
    private readonly primary: BrowserDriver,
    private readonly fallback: SessionFallback,
    private readonly turnId?: string,
  ) {}

  async getTargetTab(): Promise<TabInfo> {
    return (this.fallback.active ? this.fallback.driver : this.primary).getTargetTab();
  }

  async setTargetTab(tabId: number): Promise<TabInfo | DriverError> {
    const [primary, fallback] = await Promise.all([
      this.primary.setTargetTab(tabId),
      this.fallback.driver.setTargetTab(tabId),
    ]);
    return this.fallback.active ? fallback : primary;
  }

  async listTabs(): Promise<TabInfo[]> {
    return (this.fallback.active ? this.fallback.driver : this.primary).listTabs();
  }

  navigate(url: string): Promise<NavResult> {
    return this.retrySafe('navigate', [url]);
  }

  navigateHistory(direction: 'back' | 'forward'): Promise<NavResult> {
    return this.retrySafe('navigateHistory', [direction]);
  }

  newTab(url?: string): Promise<TabInfo | DriverError> {
    return this.retrySafe('newTab', [url]);
  }

  closeTab(tabId?: number): Promise<{ ok: true } | DriverError> {
    return this.retrySafe('closeTab', [tabId]);
  }

  waitFor(cond: WaitCondition): Promise<WaitResult> {
    return this.retrySafe('waitFor', [cond]);
  }

  snapshot(opts?: SnapshotOptions): Promise<SnapshotResult> {
    return this.retrySafe('snapshot', [opts]);
  }

  async screenshot(): Promise<ScreenshotResult> {
    if (this.turnId && this.fallback.screenshotTurnId === this.turnId) {
      return {
        ok: false,
        error: 'A screenshot was already captured this turn; use take_snapshot and direct controls.',
      };
    }
    const result = await this.retrySafe('screenshot', []);
    if (result.ok && this.turnId) this.fallback.screenshotTurnId = this.turnId;
    return result;
  }

  evaluate(expression: string): Promise<EvaluateResult> {
    return this.retrySafe('evaluate', [expression]);
  }

  click(uid: string, opts?: { dblClick?: boolean }): Promise<ActionResult> {
    return this.runReferenceAction('click', [uid, opts]);
  }

  hover(uid: string): Promise<ActionResult> {
    return this.runReferenceAction('hover', [uid]);
  }

  fill(uid: string, value: string): Promise<ActionResult> {
    return this.runReferenceAction('fill', [uid, value]);
  }

  fillForm(fields: Array<{ uid: string; value: string }>): Promise<ActionResult> {
    return this.runReferenceAction('fillForm', [fields]);
  }

  pressKey(key: string): Promise<ActionResult> {
    return this.runReferenceAction('pressKey', [key]);
  }

  scrollTo(uid: string): Promise<ActionResult> {
    return this.runReferenceAction('scrollTo', [uid]);
  }

  private async retrySafe<K extends keyof BrowserDriver>(
    method: K,
    args: Parameters<BrowserDriver[K]>,
  ): Promise<Awaited<ReturnType<BrowserDriver[K]>>> {
    const driver = this.fallback.active ? this.fallback.driver : this.primary;
    const result = await invoke(driver, method, args);
    if (driver === this.primary && isUnavailableResult(result)) {
      await this.activateFallback();
      return invoke(this.fallback.driver, method, args);
    }
    return result;
  }

  private async runReferenceAction<K extends keyof BrowserDriver>(
    method: K,
    args: Parameters<BrowserDriver[K]>,
  ): Promise<Awaited<ReturnType<BrowserDriver[K]>>> {
    const driver = this.fallback.active ? this.fallback.driver : this.primary;
    const result = await invoke(driver, method, args);
    if (driver === this.primary && isUnavailableResult(result)) {
      await this.activateFallback();
      return {
        ok: false,
        error: 'Chrome CDP became unavailable; take_snapshot to refresh element references and continue.',
      } as Awaited<ReturnType<BrowserDriver[K]>>;
    }
    return result;
  }

  private async activateFallback(): Promise<void> {
    if (this.fallback.active) return;
    const target = await this.primary.getTargetTab();
    const selected = await this.fallback.driver.setTargetTab(target.id);
    if ('ok' in selected && !selected.ok) throw new Error(selected.error);
    this.fallback.active = true;
  }
}

async function invoke<K extends keyof BrowserDriver>(
  driver: BrowserDriver,
  method: K,
  args: Parameters<BrowserDriver[K]>,
): Promise<Awaited<ReturnType<BrowserDriver[K]>>> {
  const callable = driver[method] as (...values: Parameters<BrowserDriver[K]>) => ReturnType<BrowserDriver[K]>;
  return await callable.apply(driver, args);
}

function isUnavailableResult(result: unknown): boolean {
  const candidate = result as ResultWithError | undefined;
  return candidate?.ok === false && isDebuggerUnavailable(candidate.error ?? '');
}

function isDebuggerUnavailable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('chrome debugger')
    || lower.includes('extension debugger')
    || lower.includes('detached while handling command')
    || lower.includes('chrome-extension:// url of different extension')
    || lower.includes('debugger connection was lost')
  );
}
