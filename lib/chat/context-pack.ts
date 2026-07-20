import { generateText, type LanguageModel, type UIMessagePart } from 'ai';
import type { AppUIMessage } from './app-message';
import {
  getContextSummary,
  saveContextSummary,
  type ContextSummaryRecord,
} from '../storage/context-db';

const COMPACT_AFTER_MESSAGES = 14;
const RECENT_MESSAGES_TO_KEEP = 8;
// Keep the cacheable summary prefix stable for a few sends before folding
// overflow tail messages into a new checkpoint.
const SUMMARY_REFRESH_BATCH_MESSAGES = 6;
const MAX_RECENT_MESSAGES_BEFORE_REFRESH =
  RECENT_MESSAGES_TO_KEEP + SUMMARY_REFRESH_BATCH_MESSAGES;
const MAX_SUMMARY_SOURCE_CHARS = 24_000;
const MAX_PREVIOUS_SUMMARY_CHARS = 12_000;
const MAX_TEXT_PART_CHARS = 8_000;
const MAX_TOOL_STRING_CHARS = 4_000;

export interface BuildContextMessagesOptions {
  sessionId: string;
  messages: AppUIMessage[];
  summaryModel: LanguageModel;
}

export async function buildContextMessages({
  sessionId,
  messages,
  summaryModel,
}: BuildContextMessagesOptions): Promise<AppUIMessage[]> {
  if (messages.length <= COMPACT_AFTER_MESSAGES) {
    return messages.map(sanitizeMessageForModel).filter(hasParts);
  }

  const existing = await getContextSummary(sessionId);
  const plan = planCompaction(messages, existing);

  const summary =
    plan.kind === 'reuse'
      ? plan.summary
      : await summarizeAndPersist({
          sessionId,
          previousSummary: plan.previousSummary,
          messages: plan.messagesToFold,
          compactedThroughMessageId: plan.compactedThroughMessageId,
          compactedMessageCount: plan.compactedMessageCount,
          summaryModel,
        });

  logContextPack({
    mode: plan.kind,
    compactedMessageCount: plan.compactedMessageCount,
    recentMessageCount: plan.recent.length,
    foldedMessageCount: plan.kind === 'refresh' ? plan.messagesToFold.length : 0,
    compactedThroughMessageId: plan.compactedThroughMessageId,
  });

  return [
    contextSummaryMessage(sessionId, summary, plan.compactedMessageCount),
    ...plan.recent.map(sanitizeMessageForModel).filter(hasParts),
  ];
}

type CompactionPlan =
  | {
      kind: 'reuse';
      summary: string;
      recent: AppUIMessage[];
      compactedMessageCount: number;
      compactedThroughMessageId: string;
    }
  | {
      kind: 'refresh';
      previousSummary?: string;
      messagesToFold: AppUIMessage[];
      recent: AppUIMessage[];
      compactedMessageCount: number;
      compactedThroughMessageId: string;
    };

function planCompaction(
  messages: AppUIMessage[],
  existing: ContextSummaryRecord | null,
): CompactionPlan {
  const existingBoundaryIndex = existing
    ? messages.findIndex((message) => message.id === existing.compactedThroughMessageId)
    : -1;

  if (existing && existingBoundaryIndex >= 0) {
    const recentStart = existingBoundaryIndex + 1;
    const recent = messages.slice(recentStart);

    if (recent.length <= MAX_RECENT_MESSAGES_BEFORE_REFRESH) {
      return {
        kind: 'reuse',
        summary: existing.summary,
        recent,
        compactedMessageCount: existingBoundaryIndex + 1,
        compactedThroughMessageId: existing.compactedThroughMessageId,
      };
    }

    return refreshPlan({
      messages,
      splitAt: Math.max(recentStart + 1, messages.length - RECENT_MESSAGES_TO_KEEP),
      foldStart: recentStart,
      previousSummary: existing.summary,
    });
  }

  return refreshPlan({
    messages,
    splitAt: Math.max(1, messages.length - RECENT_MESSAGES_TO_KEEP),
    foldStart: 0,
  });
}

function refreshPlan({
  messages,
  splitAt,
  foldStart,
  previousSummary,
}: {
  messages: AppUIMessage[];
  splitAt: number;
  foldStart: number;
  previousSummary?: string;
}): CompactionPlan {
  const messagesToFold = messages.slice(foldStart, splitAt);
  const compactedThrough = messages[splitAt - 1];

  return {
    kind: 'refresh',
    previousSummary,
    messagesToFold,
    recent: messages.slice(splitAt),
    compactedMessageCount: splitAt,
    compactedThroughMessageId: compactedThrough.id,
  };
}

function contextSummaryMessage(
  sessionId: string,
  summary: string,
  compactedMessageCount: number,
): AppUIMessage {
  return {
    id: `context-summary-${sessionId}`,
    role: 'user',
    parts: [
      {
        type: 'text',
        text:
          'Conversation context pack\n' +
          `Compacted messages: ${compactedMessageCount}\n\n` +
          'Use this summary as durable conversation state. Recent raw turns follow after it; if exact page or tool data is needed, call the relevant tool again.\n\n' +
          summary,
      },
    ],
  };
}

async function summarizeAndPersist({
  sessionId,
  previousSummary,
  messages,
  compactedThroughMessageId,
  compactedMessageCount,
  summaryModel,
}: {
  sessionId: string;
  previousSummary?: string;
  messages: AppUIMessage[];
  compactedThroughMessageId: string;
  compactedMessageCount: number;
  summaryModel: LanguageModel;
}): Promise<string> {
  const source = summaryPromptSource(previousSummary, messages);
  const fallback = deterministicSummary(messages, previousSummary);

  try {
    const { text } = await generateText({
      model: summaryModel,
      system:
        'Update a browser side-panel AI chat durable state summary for future turns. If an existing summary is provided, merge the new messages into it instead of re-summarizing from scratch. Preserve goals, decisions, user preferences, important page/tool facts, unresolved questions, and exact references or identifiers. Do not include filler.',
      prompt:
        'Return markdown with these headings: Summary, Durable Facts, Decisions, Open Questions, Tool/Page Artifacts.\n\n' +
        source,
    });
    const summary = text.trim() || fallback;
    await saveContextSummary({
      sessionId,
      compactedThroughMessageId,
      compactedMessageCount,
      summary,
      updatedAt: Date.now(),
    });
    return summary;
  } catch {
    await saveContextSummary({
      sessionId,
      compactedThroughMessageId,
      compactedMessageCount,
      summary: fallback,
      updatedAt: Date.now(),
    });
    return fallback;
  }
}

function summaryPromptSource(
  previousSummary: string | undefined,
  messages: AppUIMessage[],
): string {
  const nextMessages = messagesToSummarySource(messages);
  if (!previousSummary) return nextMessages.slice(0, MAX_SUMMARY_SOURCE_CHARS);

  return [
    'Existing durable summary:',
    previousSummary.slice(0, MAX_PREVIOUS_SUMMARY_CHARS),
    '',
    'New messages to fold into that summary:',
    nextMessages.slice(0, MAX_SUMMARY_SOURCE_CHARS - MAX_PREVIOUS_SUMMARY_CHARS),
  ].join('\n');
}

function sanitizeMessageForModel(message: AppUIMessage): AppUIMessage {
  return {
    ...message,
    parts: message.parts
      .map((part) => sanitizePart(part as UIMessagePart<never, never>))
      .filter((part): part is UIMessagePart<never, never> => Boolean(part)) as AppUIMessage['parts'],
  };
}

function sanitizePart(
  part: UIMessagePart<never, never>,
): UIMessagePart<never, never> | null {
  if (part.type === 'reasoning' || part.type === 'step-start') return null;
  if (part.type.startsWith('data-')) return null;
  if (part.type === 'text') {
    return {
      ...part,
      text: truncate(part.text, MAX_TEXT_PART_CHARS),
    };
  }
  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    return compactToolPart(part);
  }
  return part;
}

function compactToolPart(part: UIMessagePart<never, never>): UIMessagePart<never, never> {
  const obj = { ...(part as unknown as Record<string, unknown>) };
  if ('input' in obj) obj.input = compactValue(obj.input);
  if ('output' in obj) obj.output = compactValue(obj.output);
  return obj as unknown as UIMessagePart<never, never>;
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') return truncate(value, MAX_TOOL_STRING_CHARS);
  if (Array.isArray(value)) return value.slice(0, 20).map(compactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, compactValue(val)]),
    );
  }
  return value;
}

function messagesToSummarySource(messages: AppUIMessage[]): string {
  return messages
    .map((message, i) => {
      const body = message.parts
        .map((part) => partToSummaryText(part as UIMessagePart<never, never>))
        .filter(Boolean)
        .join('\n');
      return `## ${i + 1}. ${message.role}\n${body}`;
    })
    .join('\n\n');
}

function partToSummaryText(part: UIMessagePart<never, never>): string {
  if (part.type === 'text') return part.text;
  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    const obj = part as unknown as Record<string, unknown>;
    return [
      `Tool: ${part.type}`,
      obj.input !== undefined ? `Input: ${safeStringify(compactValue(obj.input))}` : '',
      obj.output !== undefined ? `Output: ${safeStringify(compactValue(obj.output))}` : '',
      obj.errorText !== undefined ? `Error: ${String(obj.errorText)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function deterministicSummary(
  messages: AppUIMessage[],
  previousSummary?: string,
): string {
  const source = messagesToSummarySource(messages).slice(0, 6_000);
  return [
    '## Summary',
    previousSummary
      ? 'Automatic LLM compaction was unavailable, so the prior durable summary is preserved and a bounded extract of newer messages is appended.'
      : 'Automatic LLM compaction was unavailable, so this is a bounded extract of earlier conversation state.',
    '',
    '## Durable Facts',
    previousSummary ? `Prior summary:\n${previousSummary.slice(0, 8_000)}\n` : '',
    source || 'No text content was available in compacted messages.',
    '',
    '## Decisions',
    '- Preserve exact details by re-reading page/tool artifacts when needed.',
    '',
    '## Open Questions',
    '- None recorded by the fallback compactor.',
    '',
    '## Tool/Page Artifacts',
    '- Earlier tool outputs may have been truncated in this fallback summary.',
  ].join('\n');
}

function hasParts(message: AppUIMessage): boolean {
  return message.parts.length > 0;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[Truncated ${text.length - limit} characters; call the relevant tool again if exact content is needed.]`;
}

function logContextPack({
  mode,
  compactedMessageCount,
  recentMessageCount,
  foldedMessageCount,
  compactedThroughMessageId,
}: {
  mode: CompactionPlan['kind'];
  compactedMessageCount: number;
  recentMessageCount: number;
  foldedMessageCount: number;
  compactedThroughMessageId: string;
}): void {
  if (!import.meta.env.DEV) return;
  console.info('[context-pack]', {
    mode,
    compactedMessageCount,
    recentMessageCount,
    foldedMessageCount,
    compactedThroughMessageId,
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
