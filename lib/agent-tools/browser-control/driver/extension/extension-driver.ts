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
} from '../types';
import { accessError, injectedStatusError, restrictedUrlError } from '../errors';
import { isRestrictedUrl } from './restricted-urls';
import { snapshotInPage } from './injected/snapshot';
import {
  actionInPage,
  locateInPage,
  type ActionOp,
} from './injected/actions';
import { waitInPage } from './injected/wait';

const LOAD_TIMEOUT_MS = 15_000;
const MAX_NODES_INTERACTIVE = 200;
const MAX_NODES_FULL = 500;
const EVAL_RESULT_CAP = 5_000;

export interface ExtensionDriverOptions {
  browserSessionId?: string;
  getTurnId?: () => string | undefined;
  cursor?: {
    publish(tabId: number, move: {
      type: 'cursor.move';
      sessionId: string;
      turnId: string;
      moveSequence: number;
      overlayX: number;
      overlayY: number;
      pulse: boolean;
    }): Promise<unknown>;
  };
}

/**
 * The chrome.* implementation of BrowserDriver. Holds the only mutable state:
 * which tab actions target (`targetTabId`) and a monotonic snapshot `epoch`.
 * A module-level singleton so the target tab persists across agent steps and
 * across chat messages within the session.
 */
class ExtensionDriver implements BrowserDriver {
  private targetTabId: number | null = null;
  private epoch = 0;
  private cursorSequence = 0;

  constructor(private readonly options: ExtensionDriverOptions = {}) {}

  // --- targeting ---

  private async resolveTab(): Promise<chrome.tabs.Tab> {
    if (this.targetTabId != null) {
      try {
        const tab = await chrome.tabs.get(this.targetTabId);
        if (tab) return tab;
      } catch {
        this.targetTabId = null; // target closed; fall back to active
      }
    }
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!active) throw new Error('No active browser tab found.');
    return active;
  }

  private toInfo(tab: chrome.tabs.Tab, targetId: number | null): TabInfo {
    return {
      id: tab.id ?? -1,
      index: tab.index,
      title: tab.title ?? '',
      url: tab.url ?? '',
      active: tab.active ?? false,
      isTarget: tab.id != null && tab.id === targetId,
    };
  }

  async getTargetTab(): Promise<TabInfo> {
    const tab = await this.resolveTab();
    return this.toInfo(tab, tab.id ?? null);
  }

  async setTargetTab(tabId: number): Promise<TabInfo | DriverError> {
    try {
      const tab = await chrome.tabs.get(tabId);
      this.targetTabId = tabId;
      return this.toInfo(tab, tabId);
    } catch (err) {
      return accessError(err);
    }
  }

  async listTabs(): Promise<TabInfo[]> {
    const target = await this.resolveTab();
    const tabs = await chrome.tabs.query({});
    return tabs.map((t) => this.toInfo(t, target.id ?? null));
  }

  // --- navigation ---

  /** Resolves when the tab reaches `status: 'complete'` or the timeout lapses. */
  private waitForLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(finish, LOAD_TIMEOUT_MS);
      function finish() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
      function onUpdated(updatedId: number, info: { status?: string }) {
        if (updatedId === tabId && info.status === 'complete') finish();
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  }

  async navigate(url: string): Promise<NavResult> {
    let target: string = url;
    if (!/^[a-z]+:\/\//i.test(target)) target = 'https://' + target;
    if (isRestrictedUrl(target)) return restrictedUrlError(target);
    try {
      const tab = await this.resolveTab();
      const before = tab.url ?? '';
      await chrome.tabs.update(tab.id!, { url: target });
      await this.waitForLoad(tab.id!);
      const after = await chrome.tabs.get(tab.id!);
      return {
        ok: true,
        navigated: (after.url ?? '') !== before,
        url: after.url ?? target,
        title: after.title ?? '',
      };
    } catch (err) {
      return accessError(err);
    }
  }

  async navigateHistory(direction: 'back' | 'forward'): Promise<NavResult> {
    try {
      const tab = await this.resolveTab();
      const before = tab.url ?? '';
      if (direction === 'back') await chrome.tabs.goBack(tab.id!);
      else await chrome.tabs.goForward(tab.id!);
      await this.waitForLoad(tab.id!);
      const after = await chrome.tabs.get(tab.id!);
      return {
        ok: true,
        navigated: (after.url ?? '') !== before,
        url: after.url ?? '',
        title: after.title ?? '',
      };
    } catch (err) {
      return accessError(err);
    }
  }

  async newTab(url?: string): Promise<TabInfo | DriverError> {
    if (url && isRestrictedUrl(url)) return restrictedUrlError(url);
    try {
      const created = await chrome.tabs.create({ url, active: true });
      if (created.id != null) {
        this.targetTabId = created.id;
        await this.waitForLoad(created.id);
      }
      const tab = created.id != null ? await chrome.tabs.get(created.id) : created;
      return this.toInfo(tab, this.targetTabId);
    } catch (err) {
      return accessError(err);
    }
  }

  async closeTab(tabId?: number): Promise<{ ok: true } | DriverError> {
    try {
      const id = tabId ?? (await this.resolveTab()).id;
      if (id == null) return accessError('No tab to close.');
      const all = await chrome.tabs.query({});
      if (all.length <= 1) {
        return {
          ok: false,
          error: 'Refusing to close the last remaining tab.',
        };
      }
      await chrome.tabs.remove(id);
      if (this.targetTabId === id) this.targetTabId = null;
      return { ok: true };
    } catch (err) {
      return accessError(err);
    }
  }

  async waitFor(cond: WaitCondition): Promise<WaitResult> {
    const timeoutMs = Math.min(Math.max(cond.timeoutMs ?? 5_000, 100), 30_000);
    try {
      const tab = await this.resolveTab();
      if (isRestrictedUrl(tab.url)) return restrictedUrlError(tab.url ?? '');
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: waitInPage,
        args: [cond.text ?? '', cond.selector ?? '', timeoutMs],
      });
      const payload = res?.result;
      if (!payload) return accessError('Wait returned nothing.');
      return {
        ok: true,
        found: payload.found,
        waitedMs: payload.waitedMs,
        url: payload.url,
        title: payload.title,
      };
    } catch (err) {
      return accessError(err);
    }
  }

  // --- reading ---

  async snapshot(opts?: SnapshotOptions): Promise<SnapshotResult> {
    const mode = opts?.mode ?? 'interactive';
    const maxNodes = mode === 'full' ? MAX_NODES_FULL : MAX_NODES_INTERACTIVE;
    try {
      const tab = await this.resolveTab();
      if (isRestrictedUrl(tab.url)) return restrictedUrlError(tab.url ?? '');
      this.epoch += 1;
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: snapshotInPage,
        args: [this.epoch, mode, maxNodes],
      });
      const payload = res?.result;
      if (!payload) return accessError('Snapshot returned nothing.');
      return { ok: true, ...payload };
    } catch (err) {
      return accessError(err);
    }
  }

  async screenshot(): Promise<ScreenshotResult> {
    try {
      const tab = await this.resolveTab();
      if (isRestrictedUrl(tab.url)) return restrictedUrlError(tab.url ?? '');
      // captureVisibleTab only captures the focused tab, so bring it forward.
      if (!tab.active && tab.id != null) {
        await chrome.tabs.update(tab.id, { active: true });
      }
      // Keep screenshots readable without replaying a multi-megabyte base64
      // payload through every subsequent model step.
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 60,
      });
      return { ok: true, dataUrl };
    } catch (err) {
      return accessError(err);
    }
  }

  async evaluate(expression: string): Promise<EvaluateResult> {
    try {
      const tab = await this.resolveTab();
      if (isRestrictedUrl(tab.url)) return restrictedUrlError(tab.url ?? '');
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        world: 'MAIN',
        func: evaluateInPage,
        args: [expression],
      });
      const payload = res?.result;
      if (!payload) return accessError('Evaluate returned nothing.');
      if (!payload.ok) return { ok: false, error: payload.error };
      return { ok: true, value: payload.value.slice(0, EVAL_RESULT_CAP) };
    } catch (err) {
      return accessError(err);
    }
  }

  // --- acting ---

  private async act(
    op: ActionOp,
    uid: string,
    value: string,
    dblClick: boolean,
  ): Promise<ActionResult> {
    try {
      const tab = await this.resolveTab();
      if (isRestrictedUrl(tab.url)) return restrictedUrlError(tab.url ?? '');
      const before = tab.url ?? '';
      const turnId = this.options.getTurnId?.();
      if (uid && this.options.cursor && this.options.browserSessionId && turnId) {
        const [located] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: locateInPage,
          args: [uid],
        });
        if (located?.result?.ok && located.result.x !== undefined && located.result.y !== undefined) {
          this.cursorSequence += 1;
          await this.options.cursor.publish(tab.id!, {
            type: 'cursor.move',
            sessionId: this.options.browserSessionId,
            turnId,
            moveSequence: this.cursorSequence,
            overlayX: located.result.x,
            overlayY: located.result.y,
            pulse: op === 'click',
          });
        }
      }
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: actionInPage,
        args: [op, uid, value, dblClick],
      });
      const payload = res?.result;
      if (!payload) return accessError('Action returned nothing.');
      if (!payload.ok) return injectedStatusError(payload.status ?? 'unknown');
      return {
        ok: true,
        navigated: payload.url !== before,
        url: payload.url,
        title: payload.title,
      };
    } catch (err) {
      return accessError(err);
    }
  }

  click(uid: string, opts?: { dblClick?: boolean }): Promise<ActionResult> {
    return this.act('click', uid, '', opts?.dblClick ?? false);
  }
  hover(uid: string): Promise<ActionResult> {
    return this.act('hover', uid, '', false);
  }
  fill(uid: string, value: string): Promise<ActionResult> {
    return this.act('fill', uid, value, false);
  }
  async fillForm(
    fields: Array<{ uid: string; value: string }>,
  ): Promise<ActionResult> {
    let last: ActionResult = accessError('No fields provided.');
    for (const f of fields) {
      last = await this.act('fill', f.uid, f.value, false);
      if (!last.ok) return last; // stop at the first failure so the model can re-snapshot
    }
    return last;
  }
  pressKey(key: string): Promise<ActionResult> {
    return this.act('pressKey', '', key, false);
  }
  scrollTo(uid: string): Promise<ActionResult> {
    return this.act('scrollTo', uid, '', false);
  }
}

let singleton: ExtensionDriver | null = null;

/** A session-local fallback driver; unlike the legacy singleton, refs cannot leak across clients. */
export function createExtensionDriver(options: ExtensionDriverOptions = {}): BrowserDriver {
  return new ExtensionDriver(options);
}

/** The process-wide driver, so target-tab/epoch state survives between sends. */
export function getExtensionDriver(): BrowserDriver {
  if (!singleton) singleton = new ExtensionDriver();
  return singleton;
}

/** MAIN-world evaluator. Self-contained; serialized into the page. */
function evaluateInPage(
  expression: string,
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    // Indirect eval runs in global scope. Power tool; the tool description
    // steers the model to snapshot/click/fill first.
    const result = (0, eval)(expression);
    let serialized: string;
    try {
      serialized = JSON.stringify(result) ?? String(result);
    } catch {
      serialized = String(result);
    }
    return { ok: true, value: serialized };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
