/**
 * Runs in the target page's ISOLATED world via `chrome.scripting.executeScript`.
 * MUST be fully self-contained (serialized and injected — no outer references,
 * no imports at call time).
 *
 * It walks the DOM for visible interactive elements, assigns each a `uid`, and
 * stores a `uid -> Element` registry on a world global that PERSISTS across
 * `executeScript` calls for the same document. Later action injections resolve
 * uids against that registry. Each snapshot bumps the epoch (encoded in the
 * uid, e.g. `e3_12`); actions carrying a stale-epoch uid are rejected so the
 * model is forced to re-snapshot after the page changes.
 *
 * The registry global key is duplicated as a literal in actions.ts — keep them
 * in sync (kept a plain literal precisely so both injected scripts stay
 * dependency-free).
 */

export interface SnapshotPayload {
  url: string;
  title: string;
  tree: string;
  headings: string;
  nodeCount: number;
  truncated: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function snapshotInPage(
  epoch: number,
  mode: 'interactive' | 'full',
  maxNodes: number,
): SnapshotPayload {
  const KEY = '__agentBrowserControl__';
  const reg = { epoch, els: new Map<string, Element>() };
  (globalThis as any)[KEY] = reg;

  const isVisible = (el: any): boolean => {
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const clean = (s: any): string =>
    String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  const nameOf = (el: any): string => {
    const labelledby = el.getAttribute('aria-labelledby');
    const labelledText = labelledby
      ? document.getElementById(labelledby)?.textContent
      : '';
    return clean(
      el.getAttribute('aria-label') ||
        labelledText ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        (el.labels && el.labels[0] ? el.labels[0].textContent : '') ||
        el.value ||
        el.textContent ||
        el.getAttribute('name') ||
        '',
    );
  };

  const roleOf = (el: any): string => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(t)) return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      return 'textbox';
    }
    return tag;
  };

  const INTERACTIVE =
    'a[href], button, input, textarea, select, summary, ' +
    '[role=button], [role=link], [role=checkbox], [role=radio], [role=tab], ' +
    '[role=menuitem], [role=switch], [role=combobox], [role=textbox], ' +
    '[contenteditable=""], [contenteditable=true], [onclick]';

  const lines: string[] = [];
  const seen = new Set<Element>();
  let n = 0;
  let truncated = false;

  for (const el of Array.from(document.querySelectorAll(INTERACTIVE))) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (!isVisible(el)) continue;
    if (n >= maxNodes) {
      truncated = true;
      break;
    }
    const uid = 'e' + epoch + '_' + n;
    reg.els.set(uid, el);

    const anyEl = el as any;
    const state: string[] = [];
    if (anyEl.disabled) state.push('disabled');
    if (anyEl.checked) state.push('checked');
    const expanded = el.getAttribute('aria-expanded');
    if (expanded) state.push('expanded=' + expanded);

    const name = nameOf(el);
    lines.push(
      'uid=' +
        uid +
        ' ' +
        roleOf(el) +
        (name ? ' "' + name + '"' : '') +
        (state.length ? ' [' + state.join(',') + ']' : ''),
    );
    n++;
  }

  const headings: string[] = [];
  for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
    if (!isVisible(h)) continue;
    const t = clean(h.textContent);
    if (t) headings.push(h.tagName.toLowerCase() + ' ' + t);
    if (headings.length >= 25) break;
  }
  void mode; // reserved for future 'full' variants; maxNodes already reflects it

  return {
    url: location.href,
    title: document.title,
    tree: lines.join('\n'),
    headings: headings.join('\n'),
    nodeCount: n,
    truncated,
  };
}
