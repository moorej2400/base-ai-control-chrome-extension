import {
  BrowserControlResponseSchema,
  PROTOCOL_VERSION,
  isIdempotentCommand,
  type BrowserCommand,
  type BrowserControlRequest,
  type BrowserControlResponse,
} from '@ai-page-chat/browser-control-protocol';

export const BROWSER_CONTROL_RUNTIME_PORT = 'ai-page-chat-browser-control';

export interface RuntimePort {
  postMessage(message: BrowserControlRequest): void;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
    removeListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
}

export class BrowserControlClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export interface BrowserControlClientOptions {
  connect?: () => RuntimePort;
  createId?: () => string;
}

export class BrowserControlClient {
  private port?: RuntimePort;
  private browserSessionId?: string;
  private resumeToken?: string;
  private turnId?: string;
  private endingTurn?: Promise<void>;
  private endingSession?: Promise<void>;
  private readonly pending = new Map<string, { resolve(response: BrowserControlResponse): void; reject(error: BrowserControlClientError): void }>();
  private readonly connect: () => RuntimePort;
  private readonly createId: () => string;

  constructor(options: BrowserControlClientOptions = {}) {
    this.connect = options.connect ?? (() => chrome.runtime.connect({ name: BROWSER_CONTROL_RUNTIME_PORT }));
    // Native Crypto methods throw "Illegal invocation" when detached from their receiver.
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async startSession(): Promise<{ browserSessionId: string; resumeToken: string }> {
    const result = await this.send({ type: 'session.start', origin: 'embedded' }, false) as { browserSessionId: string; resumeToken: string };
    this.browserSessionId = result.browserSessionId;
    this.resumeToken = result.resumeToken;
    return result;
  }

  async resumeSession(): Promise<void> {
    if (!this.browserSessionId || !this.resumeToken) throw new BrowserControlClientError('SESSION_RESUME_FAILED', 'No browser session is available to resume.');
    await this.send({ type: 'session.resume', resumeToken: this.resumeToken }, false);
  }

  async startTurn(): Promise<string> {
    await this.ensureSession();
    const result = await this.send({ type: 'turn.start' }, false) as { turnId: string };
    this.turnId = result.turnId;
    const tabList = await this.send({ type: 'tabs.list' }, true) as {
      tabs: Array<{ id: number; active: boolean }>;
    };
    const activeTab = tabList.tabs.find((tab) => tab.active);
    if (activeTab) {
      // Existing tools begin with a snapshot, not an explicit claim. Claim the
      // active tab at turn start so that legacy tool flow is lease-safe too.
      await this.send({ type: 'tabs.claim', tabId: activeTab.id }, true);
    }
    return result.turnId;
  }

  async endTurn(): Promise<void> {
    if (this.endingTurn) return this.endingTurn;
    if (!this.browserSessionId || !this.turnId) return;
    const ending = (async () => {
      await this.send({ type: 'turn.end' }, true);
      this.turnId = undefined;
    })();
    this.endingTurn = ending;
    try {
      await ending;
    } finally {
      if (this.endingTurn === ending) this.endingTurn = undefined;
    }
  }

  async endSession(): Promise<void> {
    if (this.endingSession) return this.endingSession;
    if (!this.browserSessionId) return;
    const ending = (async () => {
      await this.endTurn();
      await this.send({ type: 'session.end' }, false);
      this.browserSessionId = undefined;
      this.resumeToken = undefined;
    })();
    this.endingSession = ending;
    try {
      await ending;
    } finally {
      if (this.endingSession === ending) this.endingSession = undefined;
    }
  }

  async request(command: BrowserCommand): Promise<unknown> {
    if (command.type !== 'browser.status') {
      await this.ensureSession();
      if (!this.turnId) await this.startTurn();
    }
    try {
      return await this.send(command, true);
    } catch (error) {
      if (error instanceof BrowserControlClientError && error.code === 'CONNECTION_LOST' && isIdempotentCommand(command) && this.resumeToken) {
        await this.resumeSession();
        return this.send(command, true);
      }
      throw error;
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.browserSessionId && this.resumeToken) {
      if (!this.port) await this.resumeSession();
      return;
    }
    await this.startSession();
  }

  private async send(command: BrowserCommand, includeTurn: boolean): Promise<unknown> {
    const requestId = this.createId();
    const request: BrowserControlRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      ...(this.browserSessionId ? { browserSessionId: this.browserSessionId } : {}),
      ...(includeTurn && this.turnId ? { turnId: this.turnId } : {}),
      command,
    };
    const port = this.getPort();
    const response = await new Promise<BrowserControlResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      port.postMessage(request);
    });
    if (!response.ok) throw new BrowserControlClientError(response.error!.code, response.error!.message);
    return response.result;
  }

  private getPort(): RuntimePort {
    if (this.port) return this.port;
    const port = this.connect();
    const onMessage = (raw: unknown) => {
      const parsed = BrowserControlResponseSchema.safeParse(raw);
      if (!parsed.success) return;
      const pending = this.pending.get(parsed.data.requestId);
      if (!pending) return;
      this.pending.delete(parsed.data.requestId);
      pending.resolve(parsed.data);
    };
    const onDisconnect = () => {
      if (this.port !== port) return;
      this.port = undefined;
      for (const pending of this.pending.values()) {
        pending.reject(new BrowserControlClientError('CONNECTION_LOST', 'Browser-control runtime connection was lost.'));
      }
      this.pending.clear();
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    this.port = port;
    return port;
  }
}
