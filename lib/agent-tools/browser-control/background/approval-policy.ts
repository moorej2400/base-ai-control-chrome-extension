export interface ApprovalTarget { role?: string; name?: string; destination?: string }
export interface ApprovalClassification { requiresApproval: boolean; summary?: string }

/** Conservative classifier shared by embedded and MCP callers. */
export class ApprovalPolicy {
  classify(command: { type: string; [key: string]: unknown }, target?: ApprovalTarget): ApprovalClassification {
    if (command.type === 'tabs.close') return { requiresApproval: true, summary: 'Close a browser tab' };
    const label = `${target?.role ?? ''} ${target?.name ?? ''} ${target?.destination ?? ''}`.toLowerCase();
    if (/delete|remove|destroy|purchase|pay|place order|send|submit|transfer|publish|sign in|authorize/.test(label)) {
      return { requiresApproval: true, summary: target?.name || 'High-impact browser action' };
    }
    return { requiresApproval: false };
  }
}
