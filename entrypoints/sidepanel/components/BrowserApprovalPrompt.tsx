import { useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '@ai-page-chat/browser-control-protocol';
import { BROWSER_CONTROL_APPROVAL_UI_PORT } from '@/lib/agent-tools/browser-control/client/runtime-client';

interface Approval { approvalId: string; summary: string; expiresAt: number }

/** The only UI that can approve high-impact browser actions from either client. */
export default function BrowserApprovalPrompt() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const approvalPort = useRef<chrome.runtime.Port | undefined>(undefined);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: BROWSER_CONTROL_APPROVAL_UI_PORT });
    approvalPort.current = port;
    const upsert = (approval: Approval) => setApprovals((current) => [
      ...current.filter((item) => item.approvalId !== approval.approvalId), approval,
    ]);
    const remove = (approvalId: string) => setApprovals((current) => current.filter((item) => item.approvalId !== approvalId));
    const handlePort = (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const value = message as { type?: string; approvals?: Approval[]; approvalId?: string };
      if (value.type === 'browser-control.approvals' && Array.isArray(value.approvals)) setApprovals(value.approvals);
      if (value.approvalId) remove(value.approvalId);
    };
    const handleRuntime = (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const value = message as { type?: string; approval?: Approval };
      if (value.type === 'browser-control.approval' && value.approval) upsert(value.approval);
    };
    port.onMessage.addListener(handlePort);
    chrome.runtime.onMessage.addListener(handleRuntime);
    port.postMessage({ type: 'browser-control.approvals.subscribe' });
    return () => {
      port.onMessage.removeListener(handlePort);
      chrome.runtime.onMessage.removeListener(handleRuntime);
      approvalPort.current = undefined;
      port.disconnect();
    };
  }, []);

  if (!approvals.length) return null;
  const approval = approvals[0];
  const resolve = (decision: 'approve' | 'reject') => {
    approvalPort.current?.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      command: { type: 'approval.resolve', approvalId: approval.approvalId, decision },
    });
    setApprovals((current) => current.filter((item) => item.approvalId !== approval.approvalId));
  };

  return (
    <div className="error-banner" style={{ margin: '8px 14px 0' }}>
      <strong>Browser approval required</strong>
      <div style={{ marginTop: 4 }}>{approval.summary}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="err-btn ghost" onClick={() => resolve('reject')}>Reject</button>
        <button className="btn btn-primary" onClick={() => resolve('approve')}>Approve</button>
      </div>
    </div>
  );
}
