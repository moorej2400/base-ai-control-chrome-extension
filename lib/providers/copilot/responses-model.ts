import type { LanguageModel } from 'ai';
import { copilotFetch } from './copilot-fetch';

type LanguageModelV3 = Extract<LanguageModel, { specificationVersion: 'v3' }>;
type CallOptions = Parameters<LanguageModelV3['doGenerate']>[0];
type GenerateResult = Awaited<ReturnType<LanguageModelV3['doGenerate']>>;
type StreamResult = Awaited<ReturnType<LanguageModelV3['doStream']>>;
type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part>
  ? Part
  : never;
type PromptMessage = CallOptions['prompt'][number];
type FunctionTool = NonNullable<CallOptions['tools']>[number] & {
  type: 'function';
  name: string;
  description?: string;
  inputSchema: unknown;
  strict?: boolean;
};

interface ResponsesBody {
  model: string;
  input: unknown[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  text?: unknown;
  truncation: 'disabled';
}

interface ResponsesUsage {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
  total_tokens?: number;
}

interface ResponsesOutputMessage {
  type: 'message';
  role?: string;
  content?: Array<{ type: string; text?: string }>;
}

interface ResponsesFunctionCall {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

interface ResponsesReasoning {
  type: 'reasoning';
  summary?: Array<{ text?: string }>;
}

type ResponsesOutput =
  | ResponsesOutputMessage
  | ResponsesFunctionCall
  | ResponsesReasoning
  | Record<string, unknown>;

interface ResponsesData {
  id?: string;
  created_at?: number;
  model?: string;
  status?: string;
  output?: ResponsesOutput[];
  usage?: ResponsesUsage;
}

export function createCopilotResponsesModel(modelId: string): LanguageModel {
  return new CopilotResponsesLanguageModel(modelId);
}

class CopilotResponsesLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'copilot.responses';
  readonly supportedUrls = {};

  constructor(readonly modelId: string) {}

  async doGenerate(options: CallOptions): Promise<GenerateResult> {
    const { body, warnings } = prepareBody(this.modelId, options);
    const res = await copilotFetch('https://api.githubcopilot.com/responses', {
      method: 'POST',
      headers: {
        ...definedHeaders(options.headers),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    const text = await res.text();
    let data: ResponsesData;
    try {
      data = JSON.parse(text) as ResponsesData;
    } catch {
      throw new Error(`Copilot /responses returned non-JSON (${res.status})`);
    }

    if (!res.ok) {
      const message =
        typeof (data as { error?: { message?: unknown } }).error?.message ===
        'string'
          ? (data as { error: { message: string } }).error.message
          : text;
      throw new Error(`Copilot /responses failed (${res.status}): ${message}`);
    }

    const content = contentFromResponse(data);
    return {
      content,
      finishReason: finishReasonFrom(data, content),
      usage: usageFrom(data.usage),
      providerMetadata: { copilot: {} },
      request: { body },
      response: {
        id: data.id,
        modelId: data.model,
        timestamp: data.created_at ? new Date(data.created_at * 1000) : undefined,
        headers: Object.fromEntries(res.headers.entries()),
        body: data,
      },
      warnings,
    };
  }

  async doStream(options: CallOptions): Promise<StreamResult> {
    const result = await this.doGenerate(options);
    return {
      stream: new ReadableStream<StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: result.warnings });
          if (result.response) {
            controller.enqueue({
              type: 'response-metadata',
              id: result.response.id,
              modelId: result.response.modelId,
              timestamp: result.response.timestamp,
            });
          }
          for (const part of result.content) {
            if (part.type === 'reasoning') {
              controller.enqueue({ type: 'reasoning-start', id: 'reasoning-0' });
              controller.enqueue({
                type: 'reasoning-delta',
                id: 'reasoning-0',
                delta: part.text,
              });
              controller.enqueue({ type: 'reasoning-end', id: 'reasoning-0' });
            } else if (part.type === 'text') {
              controller.enqueue({ type: 'text-start', id: 'txt-0' });
              controller.enqueue({
                type: 'text-delta',
                id: 'txt-0',
                delta: part.text,
              });
              controller.enqueue({ type: 'text-end', id: 'txt-0' });
            } else if (part.type === 'tool-call') {
              const input =
                typeof part.input === 'string'
                  ? part.input
                  : JSON.stringify(part.input);
              controller.enqueue({
                type: 'tool-input-start',
                id: part.toolCallId,
                toolName: part.toolName,
              });
              controller.enqueue({
                type: 'tool-input-delta',
                id: part.toolCallId,
                delta: input,
              });
              controller.enqueue({ type: 'tool-input-end', id: part.toolCallId });
              controller.enqueue(part);
            }
          }
          controller.enqueue({
            type: 'finish',
            finishReason: result.finishReason,
            usage: result.usage,
            providerMetadata: result.providerMetadata,
          });
          controller.close();
        },
      }),
      request: result.request,
      response: result.response,
    };
  }
}

function prepareBody(
  modelId: string,
  options: CallOptions,
): { body: ResponsesBody; warnings: GenerateResult['warnings'] } {
  const warnings: GenerateResult['warnings'] = [];
  if (options.topK != null) warnings.push({ type: 'unsupported', feature: 'topK' });
  if (options.stopSequences?.length) {
    warnings.push({ type: 'unsupported', feature: 'stopSequences' });
  }
  if (options.frequencyPenalty != null) {
    warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
  }
  if (options.presencePenalty != null) {
    warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
  }
  if (options.seed != null) warnings.push({ type: 'unsupported', feature: 'seed' });

  const { instructions, input } = inputFromPrompt(options.prompt);
  const body: ResponsesBody = {
    model: modelId,
    input,
    instructions,
    max_output_tokens: options.maxOutputTokens,
    temperature: options.temperature,
    top_p: options.topP,
    tools: toolsFrom(options.tools, warnings),
    tool_choice: toolChoiceFrom(options.toolChoice),
    text: textFormatFrom(options.responseFormat),
    truncation: 'disabled',
  };
  return { body: stripUndefined(body) as ResponsesBody, warnings };
}

function inputFromPrompt(prompt: CallOptions['prompt']): {
  instructions?: string;
  input: unknown[];
} {
  const instructions: string[] = [];
  const input: unknown[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      instructions.push(message.content);
    } else if (message.role === 'user') {
      input.push({ role: 'user', content: textFromParts(message.content) });
    } else if (message.role === 'assistant') {
      const textParts: string[] = [];
      for (const part of message.content) {
        if (part.type === 'text') textParts.push(part.text);
        else if (part.type === 'tool-call') {
          input.push({
            type: 'function_call',
            call_id: part.toolCallId,
            name: part.toolName,
            arguments:
              typeof part.input === 'string'
                ? part.input
                : JSON.stringify(part.input),
          });
        }
      }
      const text = textParts.join('');
      if (text) input.push({ role: 'assistant', content: text });
    } else if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type !== 'tool-result') continue;
        input.push({
          type: 'function_call_output',
          call_id: part.toolCallId,
          output: outputToText(part.output as ToolResultOutput),
        });
      }
    }
  }

  return {
    instructions: instructions.length ? instructions.join('\n\n') : undefined,
    input,
  };
}

function textFromParts(parts: Extract<PromptMessage, { role: 'user' }>['content']) {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

function toolsFrom(
  tools: CallOptions['tools'],
  warnings: GenerateResult['warnings'],
): unknown[] | undefined {
  if (!tools?.length) return undefined;
  const out: unknown[] = [];
  for (const tool of tools) {
    if (tool.type !== 'function') {
      warnings.push({
        type: 'unsupported',
        feature: `tool type ${tool.type}`,
      });
      continue;
    }
    const fn = tool as FunctionTool;
    out.push({
      type: 'function',
      name: fn.name,
      description: fn.description,
      parameters: fn.inputSchema,
      strict: fn.strict,
    });
  }
  return out.length ? out : undefined;
}

function toolChoiceFrom(choice: CallOptions['toolChoice']): unknown {
  if (!choice) return undefined;
  if (choice.type === 'tool') return { type: 'function', name: choice.toolName };
  return choice.type;
}

function textFormatFrom(format: CallOptions['responseFormat']): unknown {
  if (!format || format.type === 'text') return undefined;
  if (!format.schema) return { format: { type: 'json_object' } };
  return {
    format: {
      type: 'json_schema',
      name: format.name ?? 'response',
      description: format.description,
      schema: format.schema,
      strict: true,
    },
  };
}

function contentFromResponse(data: ResponsesData): GenerateResult['content'] {
  const content: GenerateResult['content'] = [];
  for (const item of data.output ?? []) {
    const type = (item as { type?: string }).type;
    if (type === 'reasoning') {
      const reasoning = (item as ResponsesReasoning).summary
        ?.map((part: { text?: string }) => part.text)
        .filter((text): text is string => Boolean(text))
        .join('\n');
      if (reasoning) content.push({ type: 'reasoning', text: reasoning });
    } else if (type === 'message') {
      const text = (item as ResponsesOutputMessage).content
        ?.filter((part: { type: string; text?: string }) => part.type === 'output_text')
        .map((part: { text?: string }) => part.text ?? '')
        .join('');
      if (text) content.push({ type: 'text', text });
    } else if (type === 'function_call') {
      const call = item as ResponsesFunctionCall;
      content.push({
        type: 'tool-call',
        toolCallId: call.call_id,
        toolName: call.name,
        input: call.arguments,
      });
    }
  }
  return content;
}

function finishReasonFrom(
  data: ResponsesData,
  content: GenerateResult['content'],
): GenerateResult['finishReason'] {
  if (content.some((part) => part.type === 'tool-call')) {
    return { unified: 'tool-calls', raw: data.status };
  }
  if (data.status === 'completed') return { unified: 'stop', raw: data.status };
  if (data.status === 'incomplete') return { unified: 'length', raw: data.status };
  return { unified: 'other', raw: data.status };
}

function usageFrom(usage: ResponsesUsage | undefined): GenerateResult['usage'] {
  return {
    inputTokens: {
      total: usage?.input_tokens,
      noCache:
        usage?.input_tokens != null
          ? usage.input_tokens - (usage.input_tokens_details?.cached_tokens ?? 0)
          : undefined,
      cacheRead: usage?.input_tokens_details?.cached_tokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage?.output_tokens,
      text:
        usage?.output_tokens != null
          ? usage.output_tokens -
            (usage.output_tokens_details?.reasoning_tokens ?? 0)
          : undefined,
      reasoning: usage?.output_tokens_details?.reasoning_tokens,
    },
    raw: stripUndefined({
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
      total_tokens: usage?.total_tokens,
    }),
  };
}

type ToolResultOutput =
  | { type: 'text' | 'error-text'; value: string }
  | { type: 'execution-denied'; reason?: string }
  | { type: 'json' | 'error-json' | 'content'; value: unknown };

function outputToText(output: ToolResultOutput) {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'execution-denied':
      return output.reason ?? 'Tool execution denied.';
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'content':
      // The Responses API `function_call_output` is text-only, so image parts
      // (e.g. from take_screenshot) cannot be delivered to the model here.
      // Extract the text and replace media with a clear note instead of
      // stringifying raw base64 — which would waste huge token budgets and
      // leave the model looping on an image it cannot actually see.
      return contentPartsToText(output.value);
  }
}

/**
 * Flattens a `content`-type tool output (array of text/media parts) to text.
 * Media parts are omitted with a note, because this provider cannot pass images
 * through a tool result. If a screenshot's pixels are needed, the model must be
 * told to rely on the DOM/snapshot tools instead.
 */
function contentPartsToText(value: unknown): string {
  const parts = Array.isArray(value) ? value : [];
  const texts: string[] = [];
  let images = 0;
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: string; text?: string };
    if (p.type === 'text' && typeof p.text === 'string') texts.push(p.text);
    else if (p.type === 'media' || p.type === 'file-data' || p.type === 'image')
      images += 1;
  }
  if (images) {
    texts.push(
      `[${images} image(s) captured but not visible to this model — image tool ` +
        'results are not supported here. Do not retry the screenshot; use the ' +
        'snapshot/DOM tools, or tell the user what you need them to look at.]',
    );
  }
  return texts.join('\n') || '[no text output]';
}

function definedHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      (entry): entry is [string, string] => entry[1] != null,
    ),
  );
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
