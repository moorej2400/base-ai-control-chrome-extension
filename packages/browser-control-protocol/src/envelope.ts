import { z } from 'zod';
import { BrowserCommandSchema } from './commands';
import { BrowserControlErrorSchema } from './errors';

export const PROTOCOL_VERSION = 1 as const;

const SessionIdSchema = z.string().min(1);
const TurnIdSchema = z.string().min(1);

export const BrowserControlRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1),
  browserSessionId: SessionIdSchema.optional(),
  turnId: TurnIdSchema.optional(),
  tabId: z.number().int().nonnegative().optional(),
  deadlineMs: z.number().int().positive().optional(),
  command: BrowserCommandSchema,
}).strict().superRefine((request, context) => {
  const requireSession = () => {
    if (!request.browserSessionId) {
      context.addIssue({ code: 'custom', message: 'browserSessionId is required for this command' });
    }
  };
  const requireTurn = () => {
    if (!request.turnId) {
      context.addIssue({ code: 'custom', message: 'turnId is required for this command' });
    }
  };

  // Session creation and resume have deliberately asymmetric identifiers: a
  // resume proves ownership of an existing session before a new turn exists.
  if (request.command.type === 'session.start') {
    if (request.browserSessionId || request.turnId) {
      context.addIssue({ code: 'custom', message: 'session.start cannot include session or turn identifiers' });
    }
    return;
  }

  if (request.command.type === 'session.resume' || request.command.type === 'session.end') {
    requireSession();
    if (request.turnId) {
      context.addIssue({ code: 'custom', message: `${request.command.type} cannot include turnId` });
    }
    return;
  }

  if (request.command.type === 'turn.start') {
    requireSession();
    if (request.turnId) {
      context.addIssue({ code: 'custom', message: 'turn.start cannot include turnId' });
    }
    return;
  }

  if (request.command.type === 'browser.status') {
    return;
  }


  requireSession();
  requireTurn();
});

export const BrowserControlResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: BrowserControlErrorSchema.optional(),
}).strict().superRefine((response, context) => {
  if (response.ok && response.error) {
    context.addIssue({ code: 'custom', message: 'successful responses cannot contain an error' });
  }
  if (!response.ok && !response.error) {
    context.addIssue({ code: 'custom', message: 'failed responses require an error' });
  }
});

export const BrowserControlProgressSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1),
  stage: z.enum(['queued', 'resolving', 'cursor', 'input', 'settling']),
  message: z.string().min(1),
}).strict();

export type BrowserControlRequest = z.infer<typeof BrowserControlRequestSchema>;
export type BrowserControlResponse = z.infer<typeof BrowserControlResponseSchema>;
export type BrowserControlProgress = z.infer<typeof BrowserControlProgressSchema>;
