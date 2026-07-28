import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const cli = join(root, 'packages/browser-bridge/dist/cli.js');
const targetPrefix = process.env.BENCH_URL || 'http://localhost:4599';
const client = new Client({ name: 'browser-control-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli, 'mcp'],
  stderr: 'pipe',
});

const parse = (response) => {
  const text = response.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error(`Expected MCP text content: ${JSON.stringify(response)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
const call = async (name, args = {}) => parse(await client.callTool({ name, arguments: args }));
const refForLine = (tree, pattern) => {
  const line = String(tree ?? '').split('\n').find((candidate) => pattern.test(candidate));
  return line?.match(/^uid=(\S+)/)?.[1] ?? line?.match(/^(\S+)/)?.[1];
};

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const status = await call('browser_status');
  const listed = await call('browser_list_tabs');
  const tab = listed.tabs.find((candidate) => candidate.url?.startsWith(targetPrefix));
  if (!tab) throw new Error(`No browser tab matches ${targetPrefix}`);
  await call('browser_claim_tab', { tabId: tab.id });
  const snapshot = await call('browser_snapshot');
  const promoRef = refForLine(snapshot.tree, /button "Load promo field"/i);
  if (!promoRef) throw new Error(`Promo button was not found: ${JSON.stringify(snapshot).slice(0, 1000)}`);
  await call('browser_click', { ref: promoRef });
  const waited = await call('browser_wait', { selector: '#promo', timeoutMs: 5_000 });
  const after = await call('browser_snapshot');
  const promoFieldRef = refForLine(after.tree, /textbox "Promo code"/i);
  if (!promoFieldRef) throw new Error(`Promo field was not found: ${JSON.stringify(after).slice(0, 1000)}`);
  await call('browser_fill', { ref: promoFieldRef, value: 'MCP2026' });
  process.stdout.write(`${JSON.stringify({
    toolCount: tools.tools.length,
    status,
    tab: { id: tab.id, url: tab.url },
    waitFound: waited.found,
    promoRef: promoFieldRef,
    endedExplicitly: process.argv.includes('--end'),
  }, null, 2)}\n`);
  if (process.argv.includes('--end')) await call('browser_end_session');
} finally {
  await client.close();
}
