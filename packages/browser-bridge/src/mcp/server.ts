import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resultToMcpContent } from './results.js';
import { McpBrowserSession, type McpProtocolClient } from './session.js';
import { MCP_TOOL_DEFINITIONS, commandForTool } from './tools.js';

const anyToolInput = z.object({}).passthrough();

export interface BrowserMcpRuntime {
  server: McpServer;
  closed: Promise<void>;
  close(): Promise<void>;
}

export function createBrowserMcpServer(client: McpProtocolClient): BrowserMcpRuntime {
  const session = new McpBrowserSession(client);
  const server = new McpServer({ name: 'ai-page-chat-browser', version: '0.1.0' });
  let resolveClosed!: () => void;
  let rejectClosed!: (error: unknown) => void;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= session.close().then(resolveClosed, (error) => {
      rejectClosed(error);
      throw error;
    });
    return closing;
  };
  // MCP clients do not always call browser_end_session before their stdio
  // transport closes. Release the shared tab lease at the protocol boundary so
  // a departed external client cannot block the embedded side-panel agent.
  server.server.onclose = () => {
    void close().catch(() => {});
  };
  for (const definition of MCP_TOOL_DEFINITIONS) {
    server.registerTool(definition.name, { description: definition.description, inputSchema: anyToolInput }, async (args) => {
      if (definition.name === 'browser_end_session') {
        await session.close();
        return { content: [{ type: 'text' as const, text: 'Browser-control session ended.' }] };
      }
      const result = await session.request(commandForTool(definition.name, args));
      return { content: resultToMcpContent(result) };
    });
  }
  return { server, closed, close };
}

export async function runBrowserMcp(client: McpProtocolClient): Promise<void> {
  const runtime = createBrowserMcpServer(client);
  const terminate = () => {
    void runtime.close().catch(() => {});
  };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  try {
    await runtime.server.connect(new StdioServerTransport());
    process.stderr.write('[ai-page-chat-browser] MCP stdio server ready\n');
    // Keep the process alive until the async session-end handshake releases the
    // extension-side lease; otherwise Node may exit immediately after stdin EOF.
    await runtime.closed;
  } finally {
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', terminate);
  }
}
