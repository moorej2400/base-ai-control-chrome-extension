import type { DriverError } from './types';

/**
 * Maps raw failures (thrown chrome errors, injected-script status codes) to
 * agent-actionable messages. Every message tells the model what happened AND
 * what to do next, so it can recover inside the same tool loop.
 */

/** Wrap any thrown error as a DriverError with recovery guidance. */
export function accessError(err: unknown): DriverError {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    error:
      `Cannot control the tab: ${detail}. ` +
      'The extension needs host access to this site. Tell the user to click ' +
      'the extension icon on that tab, or enable all-sites access in Settings, ' +
      'then retry. Browser-internal pages (chrome://, the Web Store) can never ' +
      'be controlled.',
  };
}

/** Injected action/snapshot scripts return a short status; expand it here. */
export function injectedStatusError(status: string): DriverError {
  switch (status) {
    case 'no-snapshot':
      return {
        ok: false,
        error:
          'No current snapshot for this page (it may have navigated or reloaded). ' +
          'Call take_snapshot before acting.',
      };
    case 'stale':
      return {
        ok: false,
        error:
          'That uid is from an old snapshot — the page has changed since. ' +
          'Call take_snapshot again and use a uid from the new result.',
      };
    case 'not-found':
      return {
        ok: false,
        error:
          'No element matches that uid in the current snapshot. ' +
          'Call take_snapshot and pick a uid from the latest tree.',
      };
    case 'detached':
      return {
        ok: false,
        error:
          'The target element was removed from the page after the snapshot. ' +
          'Call take_snapshot again and retry.',
      };
    case 'not-fillable':
      return {
        ok: false,
        error:
          'That element is not a text input, textarea, select, or ' +
          'contenteditable, so it cannot be filled. Pick an input uid.',
      };
    default:
      return { ok: false, error: `Action failed: ${status}.` };
  }
}

export function restrictedUrlError(url: string): DriverError {
  return {
    ok: false,
    error:
      `Refusing to act on a restricted URL (${url}). Browser-internal pages ` +
      '(chrome://, edge://, chrome-extension://, devtools://, the Chrome Web ' +
      'Store, about:) cannot be controlled by the extension. Ask the user to ' +
      'open a normal web page.',
  };
}
