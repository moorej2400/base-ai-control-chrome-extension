import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../types';
import { readJiraIssueFromTab } from './page-data';

/**
 * Low-level Jira tools handed ONLY to Jira sub-agents (never registered on the
 * main agent). Add more leaf tools here as skills grow.
 */
export function jiraLeafTools(ctx: ToolContext): ToolSet {
  return {
    get_current_jira_issue: tool({
      description:
        "Read the Jira issue currently open in the user's browser tab: " +
        'key, summary, status, description, and comments.',
      inputSchema: z.object({}),
      execute: async () => readJiraIssueFromTab(ctx),
    }),
  };
}
