import { describe, expect, it } from 'vitest';
import { MCP_TOOL_DEFINITIONS, commandForTool } from '../src/mcp/tools.js';

describe('MCP browser tool mapping', () => {
  it('exposes the stable public tool surface without advanced evaluate/CDP tools', () => {
    expect(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'browser_status', 'browser_claim_tab', 'browser_snapshot', 'browser_click', 'browser_act_batch', 'browser_end_session',
    ]));
    expect(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
      'browser_evaluate', 'browser_cdp_execute', 'browser_approval_status', 'browser_resume_approved_action',
    ]));
  });

  it('maps every public browser action to one shared protocol command', () => {
    expect(commandForTool('browser_click', { ref: 'node-1' })).toEqual({ type: 'page.click', ref: 'node-1' });
    expect(commandForTool('browser_navigate', { url: 'https://example.test' })).toEqual({ type: 'page.navigate', url: 'https://example.test' });
  });
});
