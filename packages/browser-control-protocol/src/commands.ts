import { z } from 'zod';
import { CursorArrivalSchema, CursorMoveSchema } from './cursor';

const NodeRefSchema = z.string().min(1);

const BatchOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), ref: NodeRefSchema, doubleClick: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('hover'), ref: NodeRefSchema }).strict(),
  z.object({ type: z.literal('fill'), ref: NodeRefSchema, value: z.string() }).strict(),
  z.object({ type: z.literal('select'), ref: NodeRefSchema, value: z.string().min(1) }).strict(),
  z.object({ type: z.literal('key'), key: z.string().min(1) }).strict(),
  z.object({ type: z.literal('scroll'), ref: NodeRefSchema.optional(), deltaY: z.number().finite().optional() }).strict(),
]);

export const BrowserCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.start'), origin: z.enum(['embedded', 'mcp']) }).strict(),
  z.object({ type: z.literal('session.resume'), resumeToken: z.string().min(1) }).strict(),
  z.object({ type: z.literal('session.end') }).strict(),
  z.object({ type: z.literal('turn.start') }).strict(),
  z.object({ type: z.literal('turn.cancel') }).strict(),
  z.object({ type: z.literal('turn.end') }).strict(),
  z.object({ type: z.literal('browser.status') }).strict(),
  z.object({ type: z.literal('tabs.list') }).strict(),
  z.object({ type: z.literal('tabs.claim'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('tabs.release'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('tabs.create'), url: z.string().url().optional(), active: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('tabs.close'), tabId: z.number().int().nonnegative().optional() }).strict(),
  z.object({ type: z.literal('tabs.select'), tabId: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('page.snapshot'), mode: z.enum(['interactive', 'full']).optional() }).strict(),
  z.object({ type: z.literal('page.screenshot'), format: z.enum(['jpeg', 'png']).optional() }).strict(),
  z.object({ type: z.literal('page.info') }).strict(),
  z.object({ type: z.literal('page.navigate'), url: z.string().url() }).strict(),
  z.object({ type: z.literal('page.history'), direction: z.enum(['back', 'forward']) }).strict(),
  z.object({ type: z.literal('page.wait'), selector: z.string().min(1).optional(), text: z.string().min(1).optional(), timeoutMs: z.number().int().positive().max(60_000).optional() })
    .strict()
    .refine((value) => value.selector !== undefined || value.text !== undefined, {
      message: 'page.wait requires selector or text',
    }),
  z.object({ type: z.literal('page.click'), ref: NodeRefSchema, doubleClick: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('page.hover'), ref: NodeRefSchema }).strict(),
  z.object({ type: z.literal('page.fill'), ref: NodeRefSchema, value: z.string() }).strict(),
  z.object({ type: z.literal('page.select'), ref: NodeRefSchema, value: z.string().min(1) }).strict(),
  z.object({ type: z.literal('page.key'), key: z.string().min(1) }).strict(),
  z.object({ type: z.literal('page.scroll'), ref: NodeRefSchema.optional(), deltaY: z.number().finite().optional() }).strict(),
  z.object({ type: z.literal('page.actBatch'), operations: z.array(BatchOperationSchema).min(1).max(20) }).strict(),
  z.object({ type: z.literal('page.evaluate'), expression: z.string().min(1) }).strict(),
  z.object({ type: z.literal('cdp.execute'), method: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }).strict(),
  CursorMoveSchema,
  CursorArrivalSchema,
]);

export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;
export type BatchOperation = z.infer<typeof BatchOperationSchema>;

const IDEMPOTENT_COMMAND_TYPES = new Set<BrowserCommand['type']>([
  'browser.status',
  'tabs.list',
  'page.snapshot',
  'page.screenshot',
  'page.info',
]);

export function isIdempotentCommand(command: BrowserCommand): boolean {
  return IDEMPOTENT_COMMAND_TYPES.has(command.type);
}
