import { CdpError, normalizeDebuggerError } from './cdp-errors';

export class DebuggerTransportError extends CdpError {}

export interface DebuggerEvent {
  tabId: number;
  method: string;
  params?: unknown;
  /** Present for a flattened child target (for example, an OOPIF). */
  sessionId?: string;
}

export interface ChromeDebuggerApi {
  attach(tabId: number, version: string): Promise<void>;
  detach(tabId: number): Promise<void>;
  sendCommand(tabId: number, method: string, params?: object, sessionId?: string): Promise<unknown>;
  getTargets(): Promise<unknown[]>;
  onEvent: {
    addListener(listener: (tabId: number, method: string, params?: unknown, sessionId?: string) => void): void;
    removeListener(listener: (tabId: number, method: string, params?: unknown, sessionId?: string) => void): void;
  };
  onDetach: {
    addListener(listener: (tabId: number, reason: string, sessionId?: string, targetId?: string) => void): void;
    removeListener(listener: (tabId: number, reason: string, sessionId?: string, targetId?: string) => void): void;
  };
}

export interface DebuggerTransportOptions {
  commandTimeoutMs?: number;
  onSuspect?: (tabId: number) => void | Promise<void>;
}

/**
 * A deliberately narrow CDP boundary. Keeping native debugger calls here lets
 * the coordinator treat timeout and detach as transport failures, not as page
 * behavior that a tool should silently retry.
 */
export class DebuggerTransport {
  private readonly timeoutMs: number;
  private readonly eventListeners = new Set<(event: DebuggerEvent) => void>();
  private readonly detachListeners = new Set<(event: { tabId: number; reason: string; sessionId?: string; targetId?: string }) => void>();
  private readonly onRawEvent = (tabId: number, method: string, params?: unknown, sessionId?: string) => {
    for (const listener of this.eventListeners) listener({ tabId, method, params, sessionId });
  };
  private readonly onRawDetach = (tabId: number, reason: string, sessionId?: string, targetId?: string) => {
    for (const listener of this.detachListeners) listener({ tabId, reason, sessionId, targetId });
  };

  constructor(private readonly api: ChromeDebuggerApi, private readonly options: DebuggerTransportOptions = {}) {
    this.timeoutMs = options.commandTimeoutMs ?? 15_000;
    api.onEvent.addListener(this.onRawEvent);
    api.onDetach.addListener(this.onRawDetach);
  }

  async attach(tabId: number): Promise<void> {
    try {
      await this.api.attach(tabId, '1.3');
    } catch (error) {
      const normalized = normalizeDebuggerError(error, 'attach');
      throw new DebuggerTransportError(normalized.code, normalized.message, normalized.retryable);
    }
  }

  async detach(tabId: number): Promise<void> {
    try {
      await this.api.detach(tabId);
    } catch (error) {
      const normalized = normalizeDebuggerError(error, 'detach');
      throw new DebuggerTransportError(normalized.code, normalized.message, normalized.retryable);
    }
  }

  async send<T>(tabId: number, method: string, params?: object, sessionId?: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void this.options.onSuspect?.(tabId);
        reject(new DebuggerTransportError('COMMAND_TIMEOUT', `CDP command ${method} timed out.`, true));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.api.sendCommand(tabId, method, params, sessionId), timeout]) as T;
    } catch (error) {
      if (error instanceof DebuggerTransportError) throw error;
      const normalized = normalizeDebuggerError(error, 'command');
      throw new DebuggerTransportError(normalized.code, normalized.message, normalized.retryable);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  onEvent(listener: (event: DebuggerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onDetach(listener: (event: { tabId: number; reason: string; sessionId?: string; targetId?: string }) => void): () => void {
    this.detachListeners.add(listener);
    return () => this.detachListeners.delete(listener);
  }

  getTargets(): Promise<unknown[]> {
    return this.api.getTargets();
  }

  dispose(): void {
    this.api.onEvent.removeListener(this.onRawEvent);
    this.api.onDetach.removeListener(this.onRawDetach);
    this.eventListeners.clear();
    this.detachListeners.clear();
  }
}

export function createChromeDebuggerApi(): ChromeDebuggerApi {
  // Chrome can start an MV3 service worker before an updated unpacked
  // manifest's newly-added debugger permission is visible. Do not let that
  // transient state crash the entire side panel; the first browser operation
  // returns a precise capability error instead.
  if (!chrome.debugger) {
    const unavailable = async (): Promise<never> => {
      throw new Error('Chrome debugger API is unavailable. Reload the extension after granting its debugger permission.');
    };
    const events = { addListener() {}, removeListener() {} };
    return {
      attach: unavailable,
      detach: unavailable,
      sendCommand: unavailable,
      getTargets: unavailable,
      onEvent: events,
      onDetach: events,
    };
  }
  const eventListeners = new Map<
    (tabId: number, method: string, params?: unknown, sessionId?: string) => void,
    (source: chrome.debugger.DebuggerSession, method: string, params?: object) => void
  >();
  const detachListeners = new Map<
    (tabId: number, reason: string, sessionId?: string, targetId?: string) => void,
    (source: chrome.debugger.Debuggee, reason: string) => void
  >();
  const rootTargets = new Map<number, string>();
  const tabIdFor = (source: chrome.debugger.Debuggee): number => {
    if (source.tabId !== undefined) return source.tabId;
    if (source.targetId) {
      for (const [tabId, targetId] of rootTargets) {
        if (targetId === source.targetId) return tabId;
      }
    }
    return -1;
  };
  return {
    async attach(tabId, version) {
      // Attaching by tab traverses foreign extension frames and can fail before
      // page control starts; the page target ID keeps the root boundary narrow.
      const targets = await chrome.debugger.getTargets();
      const root = targets.find((target) => target.tabId === tabId && target.type === 'page');
      if (!root) throw new Error(`No page debugger target exists for tab ${tabId}.`);
      await chrome.debugger.attach({ targetId: root.id }, version);
      rootTargets.set(tabId, root.id);
    },
    async detach(tabId) {
      const targetId = rootTargets.get(tabId);
      try {
        await chrome.debugger.detach(targetId ? { targetId } : { tabId });
      } finally {
        rootTargets.delete(tabId);
      }
    },
    // `DebuggerSession.sessionId` routes child-frame commands without modifying
    // the CDP payload. Passing it in params would make valid commands invalid.
    sendCommand: (tabId, method, params, sessionId) =>
      chrome.debugger.sendCommand(
        {
          ...(rootTargets.get(tabId) ? { targetId: rootTargets.get(tabId) } : { tabId }),
          ...(sessionId ? { sessionId } : {}),
        },
        method,
        params as Record<string, unknown> | undefined,
      ),
    getTargets: () => chrome.debugger.getTargets(),
    onEvent: {
      addListener(listener) {
        const wrapped = (source: chrome.debugger.DebuggerSession, method: string, params?: object) => {
          listener(tabIdFor(source), method, params, source.sessionId);
        };
        eventListeners.set(listener, wrapped);
        chrome.debugger.onEvent.addListener(wrapped);
      },
      removeListener(listener) {
        const wrapped = eventListeners.get(listener);
        if (!wrapped) return;
        chrome.debugger.onEvent.removeListener(wrapped);
        eventListeners.delete(listener);
      },
    },
    onDetach: {
      addListener(listener) {
        const wrapped = (source: chrome.debugger.Debuggee, reason: string) => {
          const session = source as chrome.debugger.DebuggerSession;
          const tabId = tabIdFor(source);
          listener(tabId, reason, session.sessionId, source.targetId);
          if (!session.sessionId && source.targetId === rootTargets.get(tabId)) {
            rootTargets.delete(tabId);
          }
        };
        detachListeners.set(listener, wrapped);
        chrome.debugger.onDetach.addListener(wrapped);
      },
      removeListener(listener) {
        const wrapped = detachListeners.get(listener);
        if (!wrapped) return;
        chrome.debugger.onDetach.removeListener(wrapped);
        detachListeners.delete(listener);
      },
    },
  };
}
