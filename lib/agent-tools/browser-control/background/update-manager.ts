export interface UpdateManagerOptions {
  isBusy(): boolean;
  cleanup(): Promise<void>;
  reload(): void;
}

/** Keeps an extension update from discarding a live mutation or controlling lease. */
export class UpdateManager {
  private pendingVersion?: string;
  constructor(private readonly options: UpdateManagerOptions) {}

  async onUpdateAvailable(version: string): Promise<void> {
    this.pendingVersion = version;
    await this.maybeReload();
  }

  async maybeReload(): Promise<void> {
    if (!this.pendingVersion || this.options.isBusy()) return;
    await this.options.cleanup();
    this.options.reload();
    this.pendingVersion = undefined;
  }

  pending(): string | undefined { return this.pendingVersion; }
}
