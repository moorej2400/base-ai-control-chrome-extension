export interface McpToolDefinition { name: string; description: string }

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  ['browser_status', 'Read extension and browser-control status.'],
  ['browser_list_tabs', 'List available browser tabs.'],
  ['browser_claim_tab', 'Claim exclusive control of a tab.'],
  ['browser_release_tab', 'Release a claimed tab.'],
  ['browser_new_tab', 'Create and claim a new tab.'],
  ['browser_close_tab', 'Close a claimed tab.'],
  ['browser_navigate', 'Navigate the claimed tab.'],
  ['browser_snapshot', 'Capture accessible page controls.'],
  ['browser_screenshot', 'Capture the claimed tab.'],
  ['browser_wait', 'Wait for page text or a selector.'],
  ['browser_click', 'Click an opaque snapshot reference.'],
  ['browser_hover', 'Hover an opaque snapshot reference.'],
  ['browser_fill', 'Fill an opaque snapshot reference.'],
  ['browser_select', 'Select an option at an opaque reference.'],
  ['browser_press_key', 'Send a key to the claimed tab.'],
  ['browser_scroll', 'Scroll an opaque reference or the page.'],
  ['browser_act_batch', 'Run up to 20 ordered browser actions.'],
  ['browser_approval_status', 'Read this session’s approval challenge.'],
  ['browser_resume_approved_action', 'Resume an approved challenge.'],
  ['browser_end_session', 'End this MCP browser-control session.'],
].map(([name, description]) => ({ name, description }));

type Args = Record<string, unknown>;
export function commandForTool(name: string, args: Args): Record<string, unknown> {
  switch (name) {
    case 'browser_status': return { type: 'browser.status' };
    case 'browser_list_tabs': return { type: 'tabs.list' };
    case 'browser_claim_tab': return { type: 'tabs.claim', tabId: args.tabId };
    case 'browser_release_tab': return { type: 'tabs.release', tabId: args.tabId };
    case 'browser_new_tab': return { type: 'tabs.create', url: args.url };
    case 'browser_close_tab': return { type: 'tabs.close', tabId: args.tabId };
    case 'browser_navigate': return { type: 'page.navigate', url: args.url };
    case 'browser_snapshot': return { type: 'page.snapshot', mode: args.mode };
    case 'browser_screenshot': return { type: 'page.screenshot' };
    case 'browser_wait': return { type: 'page.wait', selector: args.selector, text: args.text, timeoutMs: args.timeoutMs };
    case 'browser_click': return { type: 'page.click', ref: args.ref, doubleClick: args.doubleClick };
    case 'browser_hover': return { type: 'page.hover', ref: args.ref };
    case 'browser_fill': return { type: 'page.fill', ref: args.ref, value: args.value };
    case 'browser_select': return { type: 'page.select', ref: args.ref, value: args.value };
    case 'browser_press_key': return { type: 'page.key', key: args.key };
    case 'browser_scroll': return { type: 'page.scroll', ref: args.ref, deltaY: args.deltaY };
    case 'browser_act_batch': return { type: 'page.actBatch', operations: args.operations };
    case 'browser_approval_status': return { type: 'approval.status' };
    case 'browser_resume_approved_action': return { type: 'approval.resume', approvalId: args.approvalId };
    case 'browser_end_session': return { type: 'session.end' };
    default: throw new Error(`Unknown MCP browser tool: ${name}`);
  }
}
