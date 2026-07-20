import { stepCountIs, tool, ToolLoopAgent, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../tools/types';
import type { SubagentStep, SubagentTrace } from './subagent-trace';

export interface SubagentOptions {
  /** Short human label for the sub-agent, e.g. "Jira ticket review". */
  label: string;
  /** Description shown to the PARENT agent for this delegating tool. */
  description: string;
  /** System prompt (instructions) for the CHILD agent. */
  instructions: string;
  /** Tools available only to the child agent. */
  tools: (ctx: ToolContext) => ToolSet;
  /** Max generation steps for the child loop. Default 12. */
  maxSteps?: number;
}

// Flush the trace to the UI at least this often during token-level deltas, so
// long reasoning streams don't re-emit the whole trace on every token (O(n^2)).
// Structural events (tool start/call/result, status changes) always flush.
const DELTA_FLUSH_EVERY = 12;

/**
 * Builds a delegating tool backed by a child `ToolLoopAgent` (the AI SDK
 * agent-as-tool / subagent pattern). The parent calls the tool with a `task`;
 * the child runs autonomously in its own context window with its own tools and
 * step budget, then returns its final text.
 *
 * While it runs, the child's reasoning and internal tool calls are streamed to
 * the UI via `ctx.emitSubagent` as an evolving `SubagentTrace`, so they render
 * nested under the delegating tool chip. The child reuses the parent's model
 * via `ctx.getModel()` and does NOT see the chat history — all needed context
 * must be passed in `task`.
 */
export function defineSubagent(ctx: ToolContext, opts: SubagentOptions): Tool {
  return tool({
    description: opts.description,
    inputSchema: z.object({
      task: z
        .string()
        .describe(
          'A clear, self-contained description of what the sub-agent should do. ' +
            'The sub-agent cannot see the chat history, so include all needed context.',
        ),
    }),
    execute: async ({ task }, { abortSignal, toolCallId }) => {
      const agent = new ToolLoopAgent({
        model: await ctx.getModel(),
        instructions: opts.instructions,
        tools: opts.tools(ctx),
        stopWhen: stepCountIs(opts.maxSteps ?? 12),
      });

      const trace: SubagentTrace = {
        toolCallId,
        label: opts.label,
        status: 'running',
        steps: [],
      };
      // Emit a fresh deep copy so the client reconciles a stable snapshot
      // (the live `trace` keeps mutating). No timers — the panel is often
      // unfocused/headless, where Chrome freezes setTimeout.
      const emit = () => ctx.emitSubagent?.(toolCallId, structuredClone(trace));
      let sinceFlush = 0;
      const onDelta = () => {
        if (++sinceFlush >= DELTA_FLUSH_EVERY) {
          sinceFlush = 0;
          emit();
        }
      };
      const flush = () => {
        sinceFlush = 0;
        emit();
      };

      const findTool = (id: string) =>
        trace.steps.find(
          (s): s is Extract<SubagentStep, { kind: 'tool' }> =>
            s.kind === 'tool' && s.toolCallId === id,
        );
      const findReasoning = (id: string) =>
        trace.steps.find(
          (s): s is Extract<SubagentStep, { kind: 'reasoning' }> =>
            s.kind === 'reasoning' && s.id === id,
        );

      let finalText = '';
      emit();

      try {
        const result = await agent.stream({ prompt: task, abortSignal });
        for await (const ev of result.fullStream) {
          switch (ev.type) {
            case 'reasoning-start': {
              if (!findReasoning(ev.id))
                trace.steps.push({ kind: 'reasoning', id: ev.id, text: '' });
              flush();
              break;
            }
            case 'reasoning-delta': {
              let s = findReasoning(ev.id);
              if (!s) {
                s = { kind: 'reasoning', id: ev.id, text: '' };
                trace.steps.push(s);
              }
              s.text += ev.text;
              onDelta();
              break;
            }
            case 'tool-input-start': {
              if (!findTool(ev.id))
                trace.steps.push({
                  kind: 'tool',
                  toolCallId: ev.id,
                  toolName: ev.toolName,
                  state: 'input-streaming',
                });
              flush();
              break;
            }
            case 'tool-call': {
              let s = findTool(ev.toolCallId);
              if (!s) {
                s = {
                  kind: 'tool',
                  toolCallId: ev.toolCallId,
                  toolName: ev.toolName,
                  state: 'input-available',
                };
                trace.steps.push(s);
              }
              s.state = 'input-available';
              s.input = ev.input;
              flush();
              break;
            }
            case 'tool-result': {
              const s = findTool(ev.toolCallId);
              if (s) {
                s.state = 'output-available';
                s.output = ev.output;
              }
              flush();
              break;
            }
            case 'tool-error': {
              const s = findTool(ev.toolCallId);
              if (s) {
                s.state = 'output-error';
                s.errorText = errText(ev.error);
              }
              flush();
              break;
            }
            case 'text-delta': {
              // The child's answer becomes this tool's return value (and the
              // delegating chip's output) — not a nested trace step.
              finalText += ev.text;
              break;
            }
          }
        }
        trace.status = 'done';
        flush();
      } catch (err) {
        trace.status = 'error';
        flush();
        throw err;
      }

      return finalText;
    },
  });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
