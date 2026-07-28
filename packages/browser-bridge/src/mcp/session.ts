import {
  BrowserControlResponseSchema,
  PROTOCOL_VERSION,
} from '@ai-page-chat/browser-control-protocol';

export interface McpProtocolClient { request(envelope: Record<string, unknown>): Promise<unknown> }

/** Keeps the plaintext resume token only in the MCP process, never in the extension. */
export class McpBrowserSession {
  private browserSessionId?: string;
  private resumeToken?: string;
  private turnId?: string;
  constructor(private readonly client: McpProtocolClient) {}

  async request(command: Record<string, unknown>): Promise<unknown> {
    if (command.type === 'browser.status') return this.send(command, false);
    await this.ensureTurn();
    return this.send(command, true);
  }

  async close(): Promise<void> {
    if (this.turnId) await this.send({ type: 'turn.end' }, true);
    if (this.browserSessionId) await this.send({ type: 'session.end' }, false);
    this.turnId = undefined;
    this.browserSessionId = undefined;
    this.resumeToken = undefined;
  }

  sessionId(): string | undefined { return this.browserSessionId; }

  private async ensureTurn(): Promise<void> {
    if (!this.browserSessionId) {
      const started = await this.send({ type: 'session.start', origin: 'mcp' }, false) as { browserSessionId: string; resumeToken: string };
      this.browserSessionId = started.browserSessionId;
      this.resumeToken = started.resumeToken;
    }
    if (!this.turnId) {
      const turn = await this.send({ type: 'turn.start' }, false) as { turnId: string };
      this.turnId = turn.turnId;
    }
  }

  private async send(command: Record<string, unknown>, includeTurn: boolean): Promise<unknown> {
    const raw = await this.client.request({
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      ...(this.browserSessionId ? { browserSessionId: this.browserSessionId } : {}),
      ...(includeTurn && this.turnId ? { turnId: this.turnId } : {}),
      command,
    });
    const response = BrowserControlResponseSchema.parse(raw);
    if (!response.ok) {
      throw new Error(`${response.error?.code ?? 'INTERNAL'}: ${response.error?.message ?? 'Browser-control request failed.'}`);
    }
    return response.result;
  }
}
