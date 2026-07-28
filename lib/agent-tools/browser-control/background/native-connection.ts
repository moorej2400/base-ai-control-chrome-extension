import { PROTOCOL_VERSION } from '@ai-page-chat/browser-control-protocol';
import type { BrowserConnectionContext } from './coordinator';

const NATIVE_MESSAGE_LIMIT = 256 * 1024;

export interface NativePort {
  postMessage(message: unknown): void;
  disconnect?(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void; removeListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void; removeListener(listener: () => void): void };
}

export interface NativeRouter {
  handle(connection: BrowserConnectionContext, message: unknown): Promise<unknown>;
  disconnect?(connection: BrowserConnectionContext): Promise<void>;
}
export interface NativeConnectionOptions {
  enabled(): boolean;
  connect(): NativePort;
  router: NativeRouter;
  createId?: () => string;
}

export type NativeConnectionStatus = { state: 'disabled' | 'connecting' | 'connected' | 'offline'; error?: string };

/** Native messaging is optional: a missing or broken host never affects embedded control. */
export class NativeConnectionManager {
  private port?: NativePort;
  private connection?: BrowserConnectionContext;
  private current: NativeConnectionStatus = { state: 'disabled' };
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelayMs = 500;
  private readonly createId: () => string;

  constructor(private readonly options: NativeConnectionOptions) {
    // Native Crypto methods throw "Illegal invocation" when detached from their receiver.
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  start(): void {
    if (!this.options.enabled()) { this.stop(); return; }
    if (this.port) return;
    try {
      this.current = { state: 'connecting' };
      const port = this.options.connect();
      this.port = port;
      this.connection = { id: this.createId(), origin: 'mcp', advancedEnabled: false };
      port.onMessage.addListener((message) => { void this.receive(message); });
      port.onDisconnect.addListener(() => {
        const disconnected = this.connection;
        this.port = undefined;
        this.connection = undefined;
        this.current = { state: 'offline', error: 'Native host disconnected.' };
        if (disconnected) void this.options.router.disconnect?.(disconnected);
        this.scheduleRetry();
      });
      // Let Chrome finish binding the native stdio pipe before the first
      // message. Posting synchronously after connectNative can be dropped on
      // MV3 worker startup, leaving a host process with no bridge registry.
      queueMicrotask(() => {
        if (this.port === port) port.postMessage({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
      });
    } catch (error) {
      this.current = { state: 'offline', error: error instanceof Error ? error.message : String(error) };
      this.scheduleRetry();
    }
  }

  status(): NativeConnectionStatus { return this.current; }

  /** Reconcile a changed opt-in setting without requiring an extension reload. */
  refresh(): void {
    if (this.options.enabled()) this.start();
    else this.stop();
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const port = this.port;
    const connection = this.connection;
    this.port = undefined;
    this.connection = undefined;
    if (port) port.disconnect?.();
    if (connection) void this.options.router.disconnect?.(connection);
    this.current = { state: 'disabled' };
  }

  private async receive(message: unknown): Promise<void> {
    const port = this.port;
    const connection = this.connection;
    if (!port || !connection) return;
    const readyVersion = nativeReadyVersion(message);
    if (readyVersion !== undefined) {
      if (readyVersion !== PROTOCOL_VERSION) {
        this.current = { state: 'offline', error: 'Native host protocol version mismatch.' };
        return;
      }
      this.current = { state: 'connected' };
      this.retryDelayMs = 500;
      return;
    }
    if (utf8Bytes(message) > NATIVE_MESSAGE_LIMIT) {
      port.postMessage({ protocolVersion: PROTOCOL_VERSION, requestId: requestIdOf(message), ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Native message exceeds 256 KiB.', retryable: false } });
      return;
    }
    port.postMessage(await this.options.router.handle(connection, message));
  }

  private scheduleRetry(): void {
    if (!this.options.enabled() || this.retryTimer) return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 10_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.start();
    }, delay);
  }
}

function utf8Bytes(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
  catch { return NATIVE_MESSAGE_LIMIT + 1; }
}
function requestIdOf(value: unknown): string {
  return typeof value === 'object' && value !== null && typeof (value as { requestId?: unknown }).requestId === 'string'
    ? (value as { requestId: string }).requestId
    : 'native-invalid-request';
}

function nativeReadyVersion(value: unknown): number | undefined {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'ready'
    && typeof (value as { protocolVersion?: unknown }).protocolVersion === 'number'
    ? (value as { protocolVersion: number }).protocolVersion
    : undefined;
}
