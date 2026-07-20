import { isToolUIPart } from 'ai';
import type { AppUIMessage } from '@/lib/chat/app-message';
import type { SubagentTrace } from '@/lib/agents/subagent-trace';
import MarkdownRenderer from './MarkdownRenderer';
import ThinkingPill from './ThinkingPill';
import ToolCallChip from './ToolCallChip';
import MessageActions from './MessageActions';

/**
 * One chat turn. User turns are a right-aligned bubble; assistant turns lay out
 * the mock's anatomy: a reasoning pill, inline tool-call cards (with nested
 * sub-agent traces), the markdown answer, then the action row.
 */
export default function MessageItem({
  message,
  active = false,
  onRegenerate,
}: {
  message: AppUIMessage;
  active?: boolean;
  onRegenerate?: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="msg-user-wrap">
        <div className="msg-user">{textOf(message)}</div>
      </div>
    );
  }

  // Consolidate all reasoning into one pill, render tool calls in order, and
  // nest sub-agent traces under their delegating tool by tool-call id.
  const reasoning = message.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => (p as { text: string }).text)
    .join('\n\n');

  const toolParts = message.parts.filter(isToolUIPart);

  const subagentByCall = new Map<string, SubagentTrace>();
  for (const part of message.parts) {
    if (part.type === 'data-subagent')
      subagentByCall.set(part.data.toolCallId, part.data);
  }

  const answer = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n');
  const hasAnswer = answer.trim().length > 0;
  const working = active && !hasAnswer;

  return (
    <div className="assistant">
      {(reasoning.trim() || working) && (
        <ThinkingPill text={reasoning} active={working} />
      )}

      {toolParts.map((part, i) => (
        <ToolCallChip
          key={i}
          part={part}
          subagent={subagentByCall.get(part.toolCallId)}
        />
      ))}

      {hasAnswer && <MarkdownRenderer markdown={answer} />}

      {/* TODO: render <ApplyEditCard> here when a propose-edit tool result is
          present in the parts (no such tool exists yet). */}

      {hasAnswer && !active && (
        <MessageActions answer={answer} onRegenerate={onRegenerate} />
      )}
    </div>
  );
}

function textOf(message: AppUIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}
