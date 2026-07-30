import { describe, expect, it } from 'vitest';
import {
  BrowserControlRequestSchema,
  BrowserErrorCodeSchema,
  PROTOCOL_VERSION,
} from '../src/index';

describe('BrowserControlRequestSchema', () => {
  it('accepts session.start without a session or turn identifier', () => {
    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-1',
        command: { type: 'session.start', origin: 'embedded' },
      }),
    ).not.toThrow();
  });

  it('requires a session and resume token but no turn for session.resume', () => {
    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-2',
        browserSessionId: 'session-1',
        command: { type: 'session.resume', resumeToken: 'token' },
      }),
    ).not.toThrow();

    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-3',
        command: { type: 'session.resume', resumeToken: 'token' },
      }),
    ).toThrow();
  });

  it('rejects removed approval commands', () => {
    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'approval-request',
        command: { type: 'approval.resolve', approvalId: 'approval-1', decision: 'approve' },
      }),
    ).toThrow();
  });

  it('requires session and turn identifiers for tab-bound commands', () => {
    const command = { type: 'page.click' as const, ref: 'node-1' };

    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-4',
        tabId: 1,
        command,
      }),
    ).toThrow();

    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-5',
        browserSessionId: 'session-1',
        turnId: 'turn-1',
        tabId: 1,
        command,
      }),
    ).not.toThrow();
  });

  it('rejects unknown command types and protocol revisions', () => {
    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: 2,
        requestId: 'request-6',
        command: { type: 'session.start', origin: 'embedded' },
      }),
    ).toThrow();

    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-7',
        command: { type: 'page.dangerouslyInventedCommand' },
      }),
    ).toThrow();
  });

  it('caps batches and requires all cursor arrival correlation identifiers', () => {
    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-8',
        browserSessionId: 'session-1',
        turnId: 'turn-1',
        tabId: 1,
        command: {
          type: 'page.actBatch',
          operations: Array.from({ length: 21 }, () => ({
            type: 'click',
            ref: 'node-1',
          })),
        },
      }),
    ).toThrow();

    expect(() =>
      BrowserControlRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'request-9',
        browserSessionId: 'session-1',
        turnId: 'turn-1',
        tabId: 1,
        command: {
          type: 'cursor.arrived',
          sessionId: 'session-1',
          turnId: 'turn-1',
          moveSequence: 1,
        },
      }),
    ).not.toThrow();
  });

  it('includes payload-too-large in the stable error codes', () => {
    expect(BrowserErrorCodeSchema.parse('PAYLOAD_TOO_LARGE')).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
});
