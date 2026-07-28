import {
  convertToModelMessages,
  createUIMessageStream,
  smoothStream,
  stepCountIs,
  streamText,
  type ChatTransport,
} from 'ai';
import type { AppUIMessage } from './app-message';
import { getProvider } from '../providers/registry';
import { selectEconomicalModelId } from '../providers/model-selection';
import { createToolContext } from '../tools/context';
import { resolveTools } from '../tools/registry';
import { BROWSER_CONTROL_MODULE_ID } from '../agent-tools/browser-control';
import { ClientDriver } from '../agent-tools/browser-control/client/client-driver';
import { BrowserControlClient } from '../agent-tools/browser-control/client/runtime-client';
import { buildContextMessages } from './context-pack';
import { buildSystemPrompt, type SystemPromptOptions } from './system-prompt';
import { addSessionUsage } from '../storage/usage-store';

export interface ChatConfig {
  sessionId: string;
  providerId: string;
  modelId: string;
  toolModules: string[];
  /** Per-request system-prompt personalization (global/mode/style/skill). */
  personalization?: SystemPromptOptions;
  /** Sampling temperature from the active mode, if any. */
  temperature?: number;
}

/** Surface real error messages in the UI instead of the default mask. */
const unmask = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * A client-side ChatTransport: instead of POSTing to a server, it runs the
 * agent loop (streamText + tools) directly in the side panel page.
 *
 * The loop is wrapped in `createUIMessageStream` so the writer can be threaded
 * into tools (via the tool context). Sub-agents use it to emit their live
 * trace as `data-subagent` parts, which render nested under the delegating
 * tool chip.
 */
export class LocalChatTransport implements ChatTransport<AppUIMessage> {
  private readonly browserControlClient = new BrowserControlClient();

  constructor(private getConfig: () => ChatConfig) {}

  async dispose(): Promise<void> {
    await this.browserControlClient.endSession();
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<
    ChatTransport<AppUIMessage>['sendMessages']
  >[0]): ReturnType<ChatTransport<AppUIMessage>['sendMessages']> {
    const { sessionId, providerId, modelId, toolModules, personalization, temperature } =
      this.getConfig();
    if (!modelId) {
      throw new Error('No model selected.');
    }
    const provider = getProvider(providerId);
    const [model, summaryModelId] = await Promise.all([
      provider.getModel(modelId),
      selectEconomicalModelId(providerId, modelId),
    ]);
    const summaryModel =
      summaryModelId === modelId ? model : await provider.getModel(summaryModelId);

    // Word-pacing is purely cosmetic and runs on setTimeout, which Chrome
    // throttles/freezes when the panel's window is in the background. Only
    // pace when the panel is actually focused (real user watching); when it's
    // unfocused — e.g. driven headlessly via the dev bridge — stream at full
    // speed so completion isn't stalled by throttled timers.
    const focused = typeof document !== 'undefined' && document.hasFocus();

    // Browser-control tasks burn ~4 steps per UI action (snapshot → act → wait
    // → snapshot), and upcoming harness-level thinking (think/plan tools) will
    // consume steps too, so long-horizon tasks get a large budget. Ordinary
    // chats keep the smaller cap.
    const maxSteps = toolModules.includes(BROWSER_CONTROL_MODULE_ID) ? 180 : 35;

    return createUIMessageStream<AppUIMessage>({
      onError: unmask,
      execute: async ({ writer }) => {
        const browserControlDriver = toolModules.includes(BROWSER_CONTROL_MODULE_ID)
          ? new ClientDriver(this.browserControlClient)
          : undefined;
        if (browserControlDriver) await this.browserControlClient.startTurn();
        const ctx = createToolContext({
          getModel: async () => model,
          emitSubagent: (id, trace) =>
            writer.write({ type: 'data-subagent', id, data: trace }),
          browserControlDriver,
        });
        const tools = await resolveTools(toolModules, ctx);
        const contextMessages = await buildContextMessages({
          sessionId,
          messages,
          summaryModel,
        });

        const result = streamText({
          model,
          system: buildSystemPrompt(personalization),
          messages: await convertToModelMessages(contextMessages),
          tools,
          stopWhen: stepCountIs(maxSteps),
          temperature,
          abortSignal,
          onFinish: ({ totalUsage }) => {
            if (browserControlDriver) void this.browserControlClient.endTurn();
            // Record measured usage so the composer panel shows real tokens/cost.
            void addSessionUsage(sessionId, {
              inTokens: totalUsage.inputTokens ?? 0,
              outTokens: totalUsage.outputTokens ?? 0,
              cacheReadTokens: totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
            });
            if (import.meta.env.DEV) {
              console.info('[copilot-usage]', {
                inputTokens: totalUsage.inputTokens,
                outputTokens: totalUsage.outputTokens,
                cacheReadTokens: totalUsage.inputTokenDetails?.cacheReadTokens,
                cacheWriteTokens: totalUsage.inputTokenDetails?.cacheWriteTokens,
              });
            }
          },
          experimental_transform: focused
            ? smoothStream({ chunking: 'word', delayInMs: 18 })
            : undefined,
        });

        writer.merge(result.toUIMessageStream<AppUIMessage>({ onError: unmask }));
      },
    });
  }

  async reconnectToStream(): ReturnType<
    ChatTransport<AppUIMessage>['reconnectToStream']
  > {
    // Local streams die with the panel; there is nothing to reconnect to.
    return null;
  }
}
