/**
 * URLs the extension cannot (or must not) drive. Enforced in the driver as
 * defense-in-depth: even if the model is told not to touch these, the driver
 * refuses. `chrome.scripting`/`captureVisibleTab` also hard-fail on most of
 * them, so this turns opaque platform errors into clear guidance.
 */

const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-untrusted://',
  'chrome-extension://',
  'devtools://',
  'edge://',
  'brave://',
  'about:',
  'view-source:',
];

/** Chrome blocks content scripts on its own Web Store, regardless of host perms. */
const RESTRICTED_HOSTS = [
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
];

export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (RESTRICTED_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (RESTRICTED_HOSTS.some((h) => lower.includes(h))) return true;
  return false;
}
