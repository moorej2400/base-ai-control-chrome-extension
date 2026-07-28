import type { SessionStore } from './session-store';
import type { TabLeaseStore } from './tab-leases';

export interface RecoveryManagerOptions {
  sessions: SessionStore;
  leases: TabLeaseStore;
  scheduleExpiry: () => Promise<void>;
}

/** Recovered ownership starts orphaned so a restarted worker never acts for a vanished caller. */
export class RecoveryManager {
  constructor(private readonly options: RecoveryManagerOptions) {}

  async recover(): Promise<void> {
    await this.options.sessions.orphanAll();
    this.options.leases.orphanAll();
    await this.options.scheduleExpiry();
  }
}
