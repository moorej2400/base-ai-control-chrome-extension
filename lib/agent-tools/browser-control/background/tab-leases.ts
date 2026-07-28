import type { BrowserSessionOrigin } from './session-store';

export type TabLeaseState = 'active' | 'orphaned';

export interface TabLease {
  tabId: number;
  sessionId: string;
  origin: BrowserSessionOrigin;
  label: string;
  state: TabLeaseState;
  updatedAtMs: number;
}

export interface LeaseOwner {
  sessionId: string;
  origin: BrowserSessionOrigin;
  label: string;
}

export class TabLeaseError extends Error {
  constructor(
    readonly code: 'TAB_LEASED' | 'TAB_NOT_LEASED',
    message: string,
    readonly origin?: BrowserSessionOrigin,
  ) {
    super(message);
  }
}

/** Keeps caller ownership explicit: a tab is never silently stolen by another agent. */
export class TabLeaseStore {
  private readonly leases = new Map<number, TabLease>();

  constructor(private readonly now: () => number = Date.now) {}

  claim(tabId: number, owner: LeaseOwner): TabLease {
    const existing = this.leases.get(tabId);
    if (existing && existing.sessionId !== owner.sessionId) {
      // A side-panel reload loses its in-memory resume token. Only that same
      // embedded origin may replace its orphan; MCP clients must still resume.
      const embeddedReload =
        existing.state === 'orphaned'
        && existing.origin === 'embedded'
        && owner.origin === 'embedded';
      if (!embeddedReload) {
        throw new TabLeaseError('TAB_LEASED', 'The tab is controlled by another browser session.', existing.origin);
      }
    }
    const lease: TabLease = {
      tabId,
      ...owner,
      state: 'active',
      updatedAtMs: this.now(),
    };
    this.leases.set(tabId, lease);
    return lease;
  }

  get(tabId: number): TabLease | undefined {
    return this.leases.get(tabId);
  }

  assertOwned(tabId: number, sessionId: string): TabLease {
    const lease = this.leases.get(tabId);
    if (!lease || lease.sessionId !== sessionId || lease.state !== 'active') {
      throw new TabLeaseError('TAB_NOT_LEASED', 'The session does not control this tab.');
    }
    return lease;
  }

  release(tabId: number, sessionId: string): void {
    const lease = this.leases.get(tabId);
    if (lease?.sessionId === sessionId) this.leases.delete(tabId);
  }

  releaseSession(sessionId: string): void {
    for (const [tabId, lease] of this.leases) {
      if (lease.sessionId === sessionId) this.leases.delete(tabId);
    }
  }

  orphanAll(): void {
    for (const lease of this.leases.values()) lease.state = 'orphaned';
  }

  orphanSession(sessionId: string): void {
    for (const lease of this.leases.values()) {
      if (lease.sessionId === sessionId) lease.state = 'orphaned';
    }
  }

  reactivateSession(sessionId: string): void {
    for (const lease of this.leases.values()) {
      if (lease.sessionId === sessionId) lease.state = 'active';
    }
  }

  async claimCreatedTab(
    createTab: () => Promise<number>,
    closeTab: (tabId: number) => Promise<void>,
    owner: LeaseOwner,
  ): Promise<TabLease> {
    const tabId = await createTab();
    try {
      return this.claim(tabId, owner);
    } catch (error) {
      // A created tab is useful only with its atomic lease; do not leave an
      // unowned agent-created tab behind when lease arbitration rejects it.
      await closeTab(tabId);
      throw error;
    }
  }
}
