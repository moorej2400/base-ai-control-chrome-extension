import { describe, expect, it, vi } from 'vitest';
import { McpBrowserSession } from '../src/mcp/session.js';
import { createBrowserMcpServer } from '../src/mcp/server.js';

describe('MCP browser session lifecycle', () => {
  it('starts one MCP browser session lazily and ends it at process shutdown', async () => {
    const results = [
      { browserSessionId: 's', resumeToken: 'token' },
      { turnId: 't' },
      { tabs: [] },
      { ended: true },
      { ended: true },
    ];
    const request = vi.fn(async (envelope: Record<string, unknown>) => ({
      protocolVersion: 1,
      requestId: envelope.requestId,
      ok: true,
      result: results.shift(),
    }));
    const session = new McpBrowserSession({ request });
    await expect(session.request({ type: 'tabs.list' })).resolves.toEqual({ tabs: [] });
    await session.close();
    expect(request.mock.calls.map(([envelope]) => (
      envelope.command as { type: string }
    ).type)).toEqual(['session.start', 'turn.start', 'tabs.list', 'turn.end', 'session.end']);
  });

  it('surfaces an extension protocol error instead of treating it as session data', async () => {
    const request = vi.fn(async (envelope: Record<string, unknown>) => ({
      protocolVersion: 1,
      requestId: envelope.requestId,
      ok: false,
      error: { code: 'PROTOCOL_MISMATCH', message: 'Bad request.', retryable: false },
    }));
    const session = new McpBrowserSession({ request });

    await expect(session.request({ type: 'tabs.list' })).rejects.toThrow('PROTOCOL_MISMATCH: Bad request.');
  });

  it('ends the browser session when the MCP transport disconnects', async () => {
    const results = [
      { browserSessionId: 's', resumeToken: 'token' },
      { turnId: 't' },
      { tabs: [] },
      { ended: true },
      { ended: true },
    ];
    const request = vi.fn(async (envelope: Record<string, unknown>) => ({
      protocolVersion: 1,
      requestId: envelope.requestId,
      ok: true,
      result: results.shift(),
    }));
    const server = createBrowserMcpServer({ request });
    const registered = server as unknown as {
      _registeredTools: Record<string, { handler(args: Record<string, unknown>): Promise<unknown> }>;
    };
    const tool = registered._registeredTools.browser_list_tabs;

    await tool.handler({});
    server.server.onclose?.();

    await vi.waitFor(() => {
      expect(request.mock.calls.map(([envelope]) => (
        envelope.command as { type: string }
      ).type)).toEqual(['session.start', 'turn.start', 'tabs.list', 'turn.end', 'session.end']);
    });
  });
});
