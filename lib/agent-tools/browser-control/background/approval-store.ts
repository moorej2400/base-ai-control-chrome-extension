export interface ApprovalBinding {
  sessionId: string;
  turnId: string;
  tabId: number;
  documentRevision: string;
  command: unknown;
}
export interface ApprovalChallenge extends ApprovalBinding {
  approvalId: string;
  summary: string;
  actionHash: string;
  expiresAt: number;
  decision?: 'approve' | 'reject';
  consumed?: boolean;
}

export class ApprovalError extends Error {
  constructor(readonly code: 'APPROVAL_NOT_FOUND' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED', message: string) { super(message); }
}

export class ApprovalStore {
  private readonly challenges = new Map<string, ApprovalChallenge>();
  constructor(
    // Native Crypto methods throw "Illegal invocation" when detached from their receiver.
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly hash: (value: unknown) => Promise<string> = hashAction,
    private readonly now: () => number = Date.now,
  ) {}

  async create(input: ApprovalBinding & { summary: string }): Promise<ApprovalChallenge> {
    const challenge: ApprovalChallenge = {
      ...input,
      approvalId: this.createId(),
      actionHash: await this.hash(input.command),
      expiresAt: this.now() + 120_000,
    };
    this.challenges.set(challenge.approvalId, challenge);
    return challenge;
  }

  async resolve(approvalId: string, decision: 'approve' | 'reject', origin: 'extension-ui' | 'embedded' | 'mcp'): Promise<void> {
    if (origin !== 'extension-ui') throw new ApprovalError('APPROVAL_REJECTED', 'Only the extension UI may resolve browser approvals.');
    const challenge = this.requireLive(approvalId);
    challenge.decision = decision;
  }

  async consume(approvalId: string, binding: ApprovalBinding): Promise<ApprovalChallenge> {
    const challenge = this.requireLive(approvalId);
    if (challenge.consumed || challenge.decision !== 'approve') throw new ApprovalError('APPROVAL_REJECTED', 'This browser action was not approved.');
    const sameBinding = challenge.sessionId === binding.sessionId && challenge.turnId === binding.turnId && challenge.tabId === binding.tabId && challenge.documentRevision === binding.documentRevision;
    if (!sameBinding || challenge.actionHash !== await this.hash(binding.command)) throw new ApprovalError('APPROVAL_REJECTED', 'Approval does not match the current browser action.');
    challenge.consumed = true;
    return challenge;
  }

  status(sessionId: string): ApprovalChallenge[] {
    return [...this.challenges.values()].filter((challenge) => challenge.sessionId === sessionId && challenge.expiresAt > this.now() && !challenge.consumed && challenge.decision !== 'reject');
  }

  private requireLive(approvalId: string): ApprovalChallenge {
    const challenge = this.challenges.get(approvalId);
    if (!challenge) throw new ApprovalError('APPROVAL_NOT_FOUND', 'Browser approval was not found.');
    if (challenge.expiresAt <= this.now()) throw new ApprovalError('APPROVAL_EXPIRED', 'Browser approval expired; request a new action.');
    return challenge;
  }
}

async function hashAction(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
