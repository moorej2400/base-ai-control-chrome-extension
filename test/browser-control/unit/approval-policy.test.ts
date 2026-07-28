import { describe, expect, it } from 'vitest';
import { ApprovalPolicy } from '@/lib/agent-tools/browser-control/background/approval-policy';
import { ApprovalStore } from '@/lib/agent-tools/browser-control/background/approval-store';

describe('shared approval policy', () => {
  it('classifies a destructive target and binds approval to the exact action context', async () => {
    const policy = new ApprovalPolicy();
    expect(policy.classify({ type: 'page.click', ref: 'r' }, { role: 'button', name: 'Delete account' })).toMatchObject({ requiresApproval: true });
    const store = new ApprovalStore(() => 'approval-1', async () => 'hash-1');
    const challenge = await store.create({ sessionId: 's', turnId: 't', tabId: 1, documentRevision: 'r1', command: { type: 'page.click', ref: 'r' }, summary: 'Delete account' });
    await store.resolve(challenge.approvalId, 'approve', 'extension-ui');
    await expect(store.consume(challenge.approvalId, { sessionId: 's', turnId: 't', tabId: 1, documentRevision: 'r1', command: { type: 'page.click', ref: 'r' } })).resolves.toMatchObject({ command: { type: 'page.click', ref: 'r' } });
  });

  it('fails closed for non-UI approval, mismatched revision, expired/replayed IDs, and other sessions', async () => {
    const store = new ApprovalStore(() => 'approval-1', async () => 'hash-1', () => 1000);
    const challenge = await store.create({ sessionId: 's', turnId: 't', tabId: 1, documentRevision: 'r1', command: { type: 'page.click', ref: 'r' }, summary: 'Delete' });
    await expect(store.resolve(challenge.approvalId, 'approve', 'mcp')).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' });
    await store.resolve(challenge.approvalId, 'approve', 'extension-ui');
    await expect(store.consume(challenge.approvalId, { sessionId: 'other', turnId: 't', tabId: 1, documentRevision: 'r1', command: { type: 'page.click', ref: 'r' } })).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' });
    await expect(store.consume(challenge.approvalId, { sessionId: 's', turnId: 't', tabId: 1, documentRevision: 'r2', command: { type: 'page.click', ref: 'r' } })).rejects.toMatchObject({ code: 'APPROVAL_REJECTED' });
  });
});
