import type { AppUIMessage } from '@/lib/chat/app-message';
import MessageItem from './MessageItem';

/**
 * Presentational message feed. The scroll container, active-skill card and
 * context banner live in ChatScreen; this just renders the turns and the
 * pre-stream "thinking" dots.
 */
export default function MessageList({
  messages,
  status,
  onRegenerate,
}: {
  messages: AppUIMessage[];
  status: string;
  onRegenerate?: () => void;
}) {
  const streaming = status === 'submitted' || status === 'streaming';
  const lastIndex = messages.length - 1;

  return (
    <>
      {messages.map((message, i) => (
        <MessageItem
          key={message.id}
          message={message}
          active={streaming && i === lastIndex && message.role === 'assistant'}
          onRegenerate={
            i === lastIndex && message.role === 'assistant' ? onRegenerate : undefined
          }
        />
      ))}
      {status === 'submitted' && (
        <div className="thinking-dots" aria-label="Thinking">
          <span />
          <span />
          <span />
        </div>
      )}
    </>
  );
}
