import { z } from 'zod';

export const ApprovalDecisionSchema = z.enum(['approve', 'reject']);

export const ApprovalChallengeSchema = z.object({
  approvalId: z.string().min(1),
  summary: z.string().min(1),
  expiresAtMs: z.number().int().positive(),
}).strict();

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type ApprovalChallenge = z.infer<typeof ApprovalChallengeSchema>;
