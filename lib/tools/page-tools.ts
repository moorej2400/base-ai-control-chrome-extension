import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolModule } from './types';
import { cachedToolResult } from './tool-cache';

const PAGE_CONTENT_TTL_MS = 2 * 60 * 1000;

export const pageToolModule: ToolModule = {
  id: 'page',
  label: 'Current page',

  getTools(ctx: ToolContext) {
    return {
      get_page_info: tool({
        description:
          "Get the title and URL of the user's current browser tab.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const tab = await ctx.getActiveTab();
            return { title: tab.title ?? '', url: tab.url ?? '' };
          } catch (err) {
            return accessError(err);
          }
        },
      }),

      read_page_content: tool({
        description:
          "Extract the readable main content of the user's current page. " +
          'Use this before answering questions about "this page", "this article", etc.',
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const tab = await ctx.getActiveTab();
            return cachedToolResult(
              `page-content:${tab.id}:${tab.url ?? ''}`,
              PAGE_CONTENT_TTL_MS,
              async () => {
                const [result] = await chrome.scripting.executeScript({
                  target: { tabId: tab.id! },
                  files: ['/extract-page.js'],
                });
                return result?.result ?? accessError('Extraction returned nothing.');
              },
            );
          } catch (err) {
            return accessError(err);
          }
        },
      }),

      get_selected_text: tool({
        description:
          'Get the text the user currently has selected (highlighted) on the page.',
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const tab = await ctx.getActiveTab();
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: tab.id! },
              func: () => window.getSelection()?.toString() ?? '',
            });
            return { selectedText: result?.result ?? '' };
          } catch (err) {
            return accessError(err);
          }
        },
      }),
    };
  },
};

function accessError(err: unknown): { error: string } {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    error:
      `Cannot access the current tab: ${detail}. ` +
      'Tell the user to open the page they want analyzed, click the extension icon on that tab to grant access, then ask again. ' +
      'Note that browser-internal pages (chrome://, the Web Store) can never be read.',
  };
}
