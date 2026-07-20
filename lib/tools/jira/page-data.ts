import type { ToolContext } from '../types';
import { cachedToolResult } from '../tool-cache';

const JIRA_ISSUE_TTL_MS = 60 * 1000;

export interface JiraPageIssue {
  key: string;
  summary: string;
  status: string;
  description: string;
  comments: string[];
  url: string;
}

/**
 * True when the active tab looks like a Jira issue page. Keep this narrower
 * than "any Atlassian page" so the main agent does not see Jira issue tools on
 * dashboards, Confluence pages, admin screens, etc.
 */
export async function isJiraTab(ctx: ToolContext): Promise<boolean> {
  try {
    const tab = await ctx.getActiveTab();
    if (!tab.url) return false;
    const issueKey = '[A-Z][A-Z0-9]+-\\d+';
    return new RegExp(
      `(?:/browse/|/issues/|[?&]selectedIssue=)${issueKey}`,
      'i',
    ).test(tab.url);
  } catch {
    return false;
  }
}

/**
 * Best-effort DOM scrape of the Jira issue open in the active tab. Requires host
 * access to that tab (activeTab grant via the icon, or the optional all-sites
 * permission from Settings); the error path explains how to grant it.
 *
 * Selectors target Jira Cloud and are intentionally tolerant — this is a
 * scaffold and the structure may drift. Returns `{ error }` rather than
 * throwing so the child agent can relay guidance to the user.
 */
export async function readJiraIssueFromTab(
  ctx: ToolContext,
): Promise<JiraPageIssue | { error: string }> {
  try {
    const tab = await ctx.getActiveTab();
    return cachedToolResult(
      `jira-issue:${tab.id}:${tab.url ?? ''}`,
      JIRA_ISSUE_TTL_MS,
      async () => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: scrapeJiraIssue,
        });
        const data = result?.result as JiraPageIssue | null;
        if (!data || !data.summary) {
          return {
            error:
              'Could not find a Jira issue on the current page. Open a Jira issue ' +
              '(e.g. a .../browse/KEY-123 page) and try again.',
          };
        }
        return data;
      },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      error:
        `Cannot read the Jira page: ${detail}. ` +
        'Open the Jira issue, click the extension icon on that tab to grant ' +
        'access (or enable all-sites access in Settings), then try again.',
    };
  }
}

/** Runs in the page context — must be self-contained (no outer references). */
function scrapeJiraIssue(): {
  key: string;
  summary: string;
  status: string;
  description: string;
  comments: string[];
  url: string;
} {
  const text = (el: Element | null | undefined): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const pick = (selectors: string[]): Element | null => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const keyFromUrl = location.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  const comments: string[] = [];
  for (const el of document.querySelectorAll(
    '.activity-comment .action-body, [data-testid*="comment" i]',
  )) {
    const value = text(el);
    if (!value) continue;
    comments.push(value.slice(0, 2000));
    if (comments.length >= 20) break;
  }

  // Selector lists cover both Jira Cloud (data-testid attributes) and Jira
  // Server / Data Center (classic #*-val element IDs), tried in order.
  return {
    key:
      keyFromUrl?.[1] ??
      text(
        pick([
          '#key-val', // Server/DC
          '[data-issue-key]',
          '[data-testid*="issue-key" i]', // Cloud
          'a[href*="/browse/"]',
        ]),
      ),
    summary: text(
      pick([
        '#summary-val', // Server/DC
        '[data-testid*="summary" i] h1', // Cloud
        '[data-testid*="summary" i]',
        'h1',
      ]),
    ),
    status: text(
      pick([
        '.jira-issue-status-lozenge', // Server/DC status lozenge
        '[data-testid*="status" i] button', // Cloud
        '[data-testid*="status" i]',
      ]),
    ),
    description: text(
      pick([
        '#descriptionmodule .user-content-block', // Server/DC
        '#description',
        '[data-testid*="description" i]', // Cloud
        '[role="article"]',
      ]),
    ).slice(0, 4000),
    comments,
    url: location.href,
  };
}
