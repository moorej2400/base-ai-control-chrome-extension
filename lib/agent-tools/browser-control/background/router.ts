import {
  BrowserControlRequestSchema,
  PROTOCOL_VERSION,
  type BrowserControlResponse,
} from '@ai-page-chat/browser-control-protocol';
import type { BrowserConnectionContext } from './coordinator';

export interface BrowserControlRequestHandler {
  handle(connection: BrowserConnectionContext, request: ReturnType<typeof BrowserControlRequestSchema.parse>): Promise<BrowserControlResponse>;
}

/** Validates at the transport boundary so malformed native/runtime data cannot reach handlers. */
export class BrowserControlRouter {
  constructor(private readonly handler: BrowserControlRequestHandler) {}

  async handle(connection: BrowserConnectionContext, raw: unknown): Promise<BrowserControlResponse> {
    const parsed = BrowserControlRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const requestId = typeof raw === 'object' && raw !== null && 'requestId' in raw && typeof raw.requestId === 'string'
        ? raw.requestId
        : 'invalid-request';
      return {
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        ok: false,
        error: {
          code: 'PROTOCOL_MISMATCH',
          message: 'Browser-control request does not match protocol version 1.',
          retryable: false,
        },
      };
    }
    return this.handler.handle(connection, parsed.data);
  }
}
