import type { LanguageModel, Tool } from 'ai';
import type { SubagentTrace } from '../agents/subagent-trace';

export interface ToolContext {
  getActiveTab(): Promise<chrome.tabs.Tab>;
  /**
   * The language model the parent agent is currently using. Sub-agents reuse
   * it so delegated work runs on the same provider/model the user selected.
   */
  getModel(): Promise<LanguageModel>;
  /**
   * Emit a sub-agent's evolving trace (thinking + nested tool calls) for live
   * nested display. Backed by the UI stream writer; a no-op when running
   * outside a UI stream. Keyed by the delegating tool's call id.
   */
  emitSubagent?(toolCallId: string, trace: SubagentTrace): void;
}

/**
 * A pluggable group of agent tools (a "skill"). Future modules (e.g. Jira
 * ticket review) register alongside the page tools without touching the
 * agent loop.
 */
export interface ToolModule {
  id: string;
  label: string;
  getTools(ctx: ToolContext): Record<string, Tool>;
  /** Optionally gate the module by context (e.g. only on *.atlassian.net). */
  isAvailable?(ctx: ToolContext): Promise<boolean>;
}
