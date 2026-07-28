import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { resultToMcpContent } from './results.js';
import { McpBrowserSession, type McpProtocolClient } from './session.js';
import { MCP_TOOL_DEFINITIONS, commandForTool } from './tools.js';

const anyToolInput = z.object({}).passthrough();

export function createBrowserMcpServer(client: McpProtocolClient): McpServer {
  const session = new McpBrowserSession(client);
  const server = new McpServer({ name: 'ai-page-chat-browser', version: '0.1.0' });
  // MCP clients do not always call browser_end_session before their stdio
  // transport closes. Release the shared tab lease at the protocol boundary so
  // a departed external client cannot block the embedded side-panel agent.
  server.server.onclose = () => {
    void session.close().catch(() => {});
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
  return server;
}

export async function runBrowserMcp(client: McpProtocolClient): Promise<void> {
  const server = createBrowserMcpServer(client);
  await server.connect(new StdioServerTransport());
  process.stderr.write('[ai-page-chat-browser] MCP stdio server ready\n');
}
