/**
 * Runs in the target page's ISOLATED world via `chrome.scripting.executeScript`.
 * MUST be fully self-contained (serialized and injected).
 *
 * Resolves a `uid` against the registry that snapshot.ts left on the world
 * global, then dispatches SYNTHETIC input. Synthetic events are `isTrusted:
 * false`, which the vast majority of sites accept; the rare site that gates on
 * trusted input (some anti-bot / payment flows) will ignore these — an accepted
 * limitation until a `chrome.debugger`-backed driver is added.
 *
 * The registry key literal MUST match snapshot.ts.
 */

export type ActionOp = 'click' | 'hover' | 'fill' | 'pressKey' | 'scrollTo';

export interface ActionPayload {
  ok: boolean;
  status?: string; // set when ok=false: no-snapshot | stale | not-found | detached | not-fillable
  url: string;
  title: string;
}

export interface LocatedElement {
  ok: boolean;
  x?: number;
  y?: number;
}

/** Resolve a fallback-driver reference before acting so the shared cursor can arrive first. */
export function locateInPage(uid: string): LocatedElement {
  const reg = (globalThis as any).__agentBrowserControl__ as
    | { epoch: number; els: Map<string, Element> }
    | undefined;
  if (!reg || !uid || uid.split('_')[0] !== `e${reg.epoch}`) return { ok: false };
  const el = reg.els.get(uid);
  if (!el?.isConnected) return { ok: false };
  const rect = el.getBoundingClientRect();
  return {
    ok: true,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function actionInPage(
  op: ActionOp,
  uid: string,
  value: string,
  dblClick: boolean,
): ActionPayload {
  const KEY = '__agentBrowserControl__';
  const here = { url: location.href, title: document.title };
  const fail = (status: string): ActionPayload => ({ ok: false, status, ...here });

  const reg = (globalThis as any)[KEY] as
    | { epoch: number; els: Map<string, Element> }
    | undefined;
  if (!reg) return fail('no-snapshot');

  // pressKey without a uid targets the focused element.
  const needsUid = op !== 'pressKey' || Boolean(uid);
  let el: any = null;
  if (needsUid) {
    if (!uid) return fail('not-found');
    if (uid.split('_')[0] !== 'e' + reg.epoch) return fail('stale');
    el = reg.els.get(uid);
    if (!el) return fail('not-found');
    if (!el.isConnected) return fail('detached');
  } else {
    el = document.activeElement;
  }

  const rect = () => el.getBoundingClientRect();
  const center = () => {
    const r = rect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const fireMouse = (type: string) => {
    const { x, y } = center();
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
  };
  const firePointer = (type: string) => {
    if (typeof PointerEvent !== 'function') return;
    const { x, y } = center();
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  };

  const setNativeValue = (target: any, val: string) => {
    const proto =
      target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : target instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(target, val);
    else target.value = val;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  };

  try {
    if (op === 'scrollTo') {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      return { ok: true, ...here };
    }

    if (op === 'hover') {
      el.scrollIntoView({ block: 'center' });
      firePointer('pointerover');
      fireMouse('mouseover');
      fireMouse('mousemove');
      return { ok: true, ...here };
    }

    if (op === 'click') {
      el.scrollIntoView({ block: 'center' });
      if (typeof el.focus === 'function') el.focus();
      firePointer('pointerdown');
      fireMouse('mousedown');
      firePointer('pointerup');
      fireMouse('mouseup');
      if (dblClick) {
        fireMouse('dblclick');
      } else if (typeof el.click === 'function') {
        el.click();
      } else {
        fireMouse('click');
      }
      return { ok: true, ...here };
    }

    if (op === 'fill') {
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      const editable = el.isContentEditable;
      if (tag === 'select') {
        const options: any[] = Array.from(el.options || []);
        const match =
          options.find((o) => o.value === value) ||
          options.find(
            (o) => (o.textContent || '').trim() === value.trim(),
          );
        if (!match) return fail('not-fillable');
        el.value = match.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, ...here };
      }
      if (tag === 'input' || tag === 'textarea') {
        if (typeof el.focus === 'function') el.focus();
        setNativeValue(el, value);
        return { ok: true, ...here };
      }
      if (editable) {
        if (typeof el.focus === 'function') el.focus();
        el.textContent = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, ...here };
      }
      return fail('not-fillable');
    }

    if (op === 'pressKey') {
      const target = el || document.activeElement || document.body;
      const key = value;
      const common = { bubbles: true, cancelable: true, key };
      target.dispatchEvent(new KeyboardEvent('keydown', common));
      target.dispatchEvent(new KeyboardEvent('keypress', common));
      target.dispatchEvent(new KeyboardEvent('keyup', common));
      return { ok: true, ...here };
    }

    return fail('unsupported-op');
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
