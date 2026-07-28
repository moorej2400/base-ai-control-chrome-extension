import { z } from 'zod';

export const BrowserErrorCodeSchema = z.enum([
  'EXTENSION_OFFLINE',
  'NATIVE_HOST_NOT_INSTALLED',
  'PROTOCOL_MISMATCH',
  'SESSION_NOT_FOUND',
  'SESSION_ORPHANED',
  'SESSION_RESUME_FAILED',
  'CONNECTION_LOST',
  'TURN_NOT_ACTIVE',
  'TAB_NOT_FOUND',
  'TAB_LEASED',
  'TAB_NOT_LEASED',
  'RESTRICTED_URL',
  'HOST_PERMISSION_REQUIRED',
  'DEBUGGER_PERMISSION_REQUIRED',
  'DEBUGGER_ATTACH_FAILED',
  'DEBUGGER_DETACHED',
  'COMMAND_TIMEOUT',
  'STALE_REFERENCE',
  'TARGET_NOT_FOUND',
  'TARGET_OCCLUDED',
  'CURSOR_UNAVAILABLE',
  'NAVIGATION_INTERRUPTED',
  'ACTION_REQUIRES_APPROVAL',
  'APPROVAL_NOT_FOUND',
  'APPROVAL_REJECTED',
  'APPROVAL_EXPIRED',
  'INSTANCE_SELECTION_REQUIRED',
  'UNSUPPORTED_OPERATION',
  'PAYLOAD_TOO_LARGE',
]);

export type BrowserErrorCode = z.infer<typeof BrowserErrorCodeSchema>;

export const BrowserControlErrorSchema = z.object({
  code: BrowserErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  recovery: z.string().min(1).optional(),
}).strict();

export type BrowserControlError = z.infer<typeof BrowserControlErrorSchema>;
