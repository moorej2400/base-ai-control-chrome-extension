import type { Tool } from 'ai';
import type { ToolContext, ToolModule } from './types';
import { pageToolModule } from './page-tools';
import { jiraTicketReviewModule } from './jira/skills';
import { browserControlModule } from '../agent-tools/browser-control';

const modules = new Map<string, ToolModule>();

export function registerToolModule(module: ToolModule): void {
  if (modules.has(module.id)) {
    throw new Error(`Tool module already registered: ${module.id}`);
  }
  modules.set(module.id, module);
}

export function listToolModules(): ToolModule[] {
  return [...modules.values()];
}

/**
 * Resolves the tools for the enabled modules. Modules may gate themselves via
 * `isAvailable` (e.g. Jira tools only on *.atlassian.net), so this is async and
 * skips modules that report they are unavailable in the current context.
 */
export async function resolveTools(
  enabledIds: string[],
  ctx: ToolContext,
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};
  const enabled = new Set(enabledIds);
  for (const module of modules.values()) {
    if (!enabled.has(module.id)) continue;
    if (module.isAvailable && !(await module.isAvailable(ctx))) continue;
    Object.assign(tools, module.getTools(ctx));
  }
  return tools;
}

registerToolModule(pageToolModule);
registerToolModule(jiraTicketReviewModule);
registerToolModule(browserControlModule);

// Browser control defaults on for the embedded agent; users can still disable
// it per session. Jira remains gated by its own isAvailable check.
export const DEFAULT_TOOL_MODULES = [
  pageToolModule.id,
  jiraTicketReviewModule.id,
  browserControlModule.id,
];
