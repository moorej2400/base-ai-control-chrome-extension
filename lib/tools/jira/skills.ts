import { defineSubagent } from '../../agents/subagent';
import type { ToolModule } from '../types';
import { jiraLeafTools } from './leaf-tools';
import { isJiraTab } from './page-data';

const TICKET_REVIEW_INSTRUCTIONS = [
  'You are a Jira ticket-review specialist working inside a browser extension.',
  'Use get_current_jira_issue to read the issue open in the user\'s tab, then',
  'review it: summarize what it asks for, flag anything missing or ambiguous',
  '(unclear acceptance criteria, no repro steps, missing owner/estimate), and',
  'suggest a concrete next step.',
  'If the tool reports it cannot access the page, relay its guidance briefly.',
  'Be concise and use markdown. Return only the review — no preamble.',
].join(' ');

/**
 * Scaffold skill: delegates a Jira ticket review to a focused sub-agent.
 * This is the ONLY Jira skill for now — additional skills will be added later.
 * Gated by isAvailable so it only surfaces on Jira pages.
 */
export const jiraTicketReviewModule: ToolModule = {
  id: 'jira-ticket-review',
  label: 'Jira: Ticket Review',

  isAvailable: (ctx) => isJiraTab(ctx),

  getTools(ctx) {
    return {
      jira_ticket_review: defineSubagent(ctx, {
        label: 'Jira ticket review',
        description:
          'Delegate a review of the Jira issue on the current page to a ' +
          'specialist sub-agent. It reads the open ticket and returns a ' +
          'summary, gaps/risks, and a suggested next step.',
        instructions: TICKET_REVIEW_INSTRUCTIONS,
        tools: jiraLeafTools,
        maxSteps: 10,
      }),
    };
  },
};
