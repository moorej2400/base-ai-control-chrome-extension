/** Correlates private IPC requests with extension native-message responses. */
export class NativeHostRelay {
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  constructor(private readonly writeToChrome: (message: unknown) => void) {}

  forward(envelope: unknown): Promise<unknown> {
    const requestId = requestIdOf(envelope);
    if (!requestId) return Promise.reject(new Error('IPC envelope is missing requestId.'));
    const response = new Promise<unknown>((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
    try {
      this.writeToChrome(envelope);
    } catch (error) {
      this.pending.delete(requestId);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return response;
  }

  receive(message: unknown): void {
    const requestId = requestIdOf(message);
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(message);
  }

  disconnect(): void {
    for (const pending of this.pending.values()) pending.reject(new Error('Chrome native connection disconnected.'));
    this.pending.clear();
  }
}

function requestIdOf(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && typeof (value as { requestId?: unknown }).requestId === 'string'
    ? (value as { requestId: string }).requestId
    : undefined;
}
