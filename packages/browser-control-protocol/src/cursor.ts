import { z } from 'zod';

export const CursorMoveSchema = z.object({
  type: z.literal('cursor.move'),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  moveSequence: z.number().int().nonnegative(),
  overlayX: z.number().finite(),
  overlayY: z.number().finite(),
  pulse: z.boolean().default(false),
}).strict();

export const CursorArrivalSchema = z.object({
  type: z.literal('cursor.arrived'),
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  moveSequence: z.number().int().nonnegative(),
}).strict();

export type CursorMove = z.infer<typeof CursorMoveSchema>;
export type CursorArrival = z.infer<typeof CursorArrivalSchema>;
