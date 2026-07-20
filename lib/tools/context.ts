import type { LanguageModel } from 'ai';
import type { SubagentTrace } from '../agents/subagent-trace';
import type { ToolContext } from './types';

export interface ToolContextOptions {
  /** Resolves the language model the parent agent is using (for sub-agents). */
  getModel: () => Promise<LanguageModel>;
  /** Forwards a sub-agent's live trace to the UI stream (optional). */
  emitSubagent?: (toolCallId: string, trace: SubagentTrace) => void;
}

export function createToolContext(opts: ToolContextOptions): ToolContext {
  return {
    async getActiveTab() {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) throw new Error('No active browser tab found.');
      return tab;
    },
    getModel: opts.getModel,
    emitSubagent: opts.emitSubagent,
  };
}
