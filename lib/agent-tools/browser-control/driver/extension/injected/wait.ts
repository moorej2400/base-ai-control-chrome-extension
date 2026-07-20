/**
 * Runs in the target page's ISOLATED world via `chrome.scripting.executeScript`.
 * MUST be fully self-contained (serialized and injected).
 *
 * Polls for a text substring and/or CSS selector to appear, up to `timeoutMs`.
 * A single injection owns its own poll loop (no persistent observers to leak),
 * and resolves as soon as the condition is met or the deadline passes.
 */

export interface WaitPayload {
  found: boolean;
  waitedMs: number;
  url: string;
  title: string;
}

export function waitInPage(
  text: string,
  selector: string,
  timeoutMs: number,
): Promise<WaitPayload> {
  const start = Date.now();
  const intervalMs = 250;

  const matches = (): boolean => {
    if (selector) {
      try {
        if (!document.querySelector(selector)) return false;
      } catch {
        return false; // invalid selector never matches
      }
    }
    if (text) {
      const body = document.body ? document.body.innerText || '' : '';
      if (!body.includes(text)) return false;
    }
    // Empty condition (no text, no selector) resolves immediately as "found".
    return true;
  };

  return new Promise<WaitPayload>((resolve) => {
    const done = (found: boolean) =>
      resolve({
        found,
        waitedMs: Date.now() - start,
        url: location.href,
        title: document.title,
      });
    if (matches()) return done(true);
    const timer = setInterval(() => {
      if (matches()) {
        clearInterval(timer);
        done(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        done(false);
      }
    }, intervalMs);
  });
}
