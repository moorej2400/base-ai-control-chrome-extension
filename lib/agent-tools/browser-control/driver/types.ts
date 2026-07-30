/**
 * The swap seam. Tools NEVER touch `chrome.*` — they call a `BrowserDriver`.
 * The coordinator now supplies a CDP / `chrome.debugger` implementation while
 * the extension driver remains a direct-call fallback, with zero tool changes.
 *
 * Every method resolves (never rejects) with a structured result. Failure is
 * carried as `{ ok: false, error }` so the agent loop keeps running and the
 * model can self-correct instead of the stream aborting.
 */

export interface TabInfo {
  id: number;
  index: number;
  title: string;
  url: string;
  active: boolean;
  /** True when this is the tab the driver's actions currently target. */
  isTarget: boolean;
}

/** Shared shape for the "where are we now" summary appended to most results. */
export interface PageSummary {
  url: string;
  title: string;
}

export type DriverError = { ok: false; error: string };

export type NavResult =
  | ({ ok: true; navigated: boolean } & PageSummary)
  | DriverError;

export type WaitResult =
  | ({ ok: true; found: boolean; waitedMs: number } & PageSummary)
  | DriverError;

export interface SnapshotData extends PageSummary {
  /** uid-annotated interactive elements, one per line. */
  tree: string;
  /** Visible h1–h3 text, for page structure/context. */
  headings: string;
  nodeCount: number;
  truncated: boolean;
}
export type SnapshotResult = ({ ok: true } & SnapshotData) | DriverError;

export type ScreenshotResult =
  | { ok: true; dataUrl: string }
  | DriverError;

export type EvaluateResult =
  | { ok: true; value: string }
  | DriverError;

/**
 * Result of an interaction (click/fill/…). Includes a post-action page summary
 * and whether the URL changed, so the model can often continue without an
 * immediate re-snapshot.
 */
export type ActionResult =
  | ({ ok: true; navigated: boolean } & PageSummary)
  | DriverError;

export interface SnapshotOptions {
  /** `interactive` (default): only actionable elements. `full`: raise the cap. */
  mode?: 'interactive' | 'full';
}

export interface WaitCondition {
  text?: string;
  selector?: string;
  timeoutMs?: number;
}

export interface BrowserDriver {
  // --- targeting ---
  getTargetTab(): Promise<TabInfo>;
  setTargetTab(tabId: number): Promise<TabInfo | DriverError>;
  listTabs(): Promise<TabInfo[]>;

  // --- navigation ---
  navigate(url: string): Promise<NavResult>;
  navigateHistory(direction: 'back' | 'forward'): Promise<NavResult>;
  newTab(url?: string): Promise<TabInfo | DriverError>;
  closeTab(tabId?: number): Promise<{ ok: true } | DriverError>;
  waitFor(cond: WaitCondition): Promise<WaitResult>;

  // --- reading ---
  snapshot(opts?: SnapshotOptions): Promise<SnapshotResult>;
  screenshot(): Promise<ScreenshotResult>;
  evaluate(expression: string): Promise<EvaluateResult>;

  // --- acting (uids come from the most recent snapshot) ---
  click(uid: string, opts?: { dblClick?: boolean }): Promise<ActionResult>;
  hover(uid: string): Promise<ActionResult>;
  fill(uid: string, value: string): Promise<ActionResult>;
  fillForm(fields: Array<{ uid: string; value: string }>): Promise<ActionResult>;
  pressKey(key: string): Promise<ActionResult>;
  scrollTo(uid: string): Promise<ActionResult>;
}

/**
 * Gives the coordinator a driver view bound to one browser-control session and
 * turn. CDP references and cursor moves are therefore never shared between
 * the embedded agent and an external MCP client, even though they use the
 * same underlying Chrome debugger attachments.
 */
export interface SessionDriverFactory {
  forSession(browserSessionId: string, turnId?: string): BrowserDriver;
  claimTab?(browserSessionId: string, tabId: number): Promise<void>;
  releaseTab?(browserSessionId: string, tabId: number): Promise<void>;
  releaseSession?(browserSessionId: string): Promise<void>;
}

export function singleDriverFactory(driver: BrowserDriver): SessionDriverFactory {
  return { forSession: () => driver };
}
