const COPILOT_CACHE_CONTROL = { type: 'ephemeral' } as const;

type RequestBody = Record<string, unknown>;

/**
 * Copilot's compatible chat endpoint uses `copilot_cache_control`, not the
 * Anthropic `cache_control` field. Keep this in the request-body adapter so the
 * rest of the app can stay provider-neutral.
 */
export function transformCopilotRequestBody(body: RequestBody): RequestBody {
  const next = { ...body };
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((message, index) =>
      shouldCacheMessage(message, index)
        ? { ...(message as RequestBody), copilot_cache_control: COPILOT_CACHE_CONTROL }
        : message,
    );
  }

  if (next.stream === true) {
    next.stream_options = {
      ...((isRecord(next.stream_options) ? next.stream_options : {}) as RequestBody),
      include_usage: true,
    };
  }

  return next;
}

function shouldCacheMessage(message: unknown, index: number): boolean {
  if (!isRecord(message)) return false;
  if (index === 0 && message.role === 'system') return true;
  return (
    message.role === 'user' &&
    typeof message.content === 'string' &&
    message.content.startsWith('Conversation context pack')
  );
}

function isRecord(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
