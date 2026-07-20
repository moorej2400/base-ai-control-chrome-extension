import { Readability } from '@mozilla/readability';
import { defineUnlistedScript } from '#imports';

export interface ExtractedPage {
  title: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  textContent: string;
  truncated: boolean;
}

const MAX_CHARS = 20_000;

/**
 * Injected into the active tab via chrome.scripting.executeScript({ files }).
 * Its return value is surfaced as the executeScript result.
 */
export default defineUnlistedScript((): ExtractedPage => {
  let article: ReturnType<Readability['parse']> = null;
  try {
    // Readability mutates the DOM it is given — work on a clone.
    const clone = document.cloneNode(true) as Document;
    article = new Readability(clone).parse();
  } catch {
    // Fall through to raw body text below.
  }

  let text =
    article?.textContent?.trim() || document.body?.innerText?.trim() || '';
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  return {
    title: article?.title || document.title,
    byline: article?.byline ?? undefined,
    siteName: article?.siteName ?? undefined,
    excerpt: article?.excerpt ?? undefined,
    textContent: text,
    truncated,
  };
});
