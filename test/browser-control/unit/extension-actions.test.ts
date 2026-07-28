import { afterEach, describe, expect, it } from 'vitest';
import {
  approvalContextInPage,
  locateInPage,
} from '@/lib/agent-tools/browser-control/driver/extension/injected/actions';

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__agentBrowserControl__;
});

describe('fallback action location', () => {
  it('returns the viewport center only for a current connected reference', () => {
    const element = {
      isConnected: true,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 40 }),
    };
    (globalThis as Record<string, unknown>).__agentBrowserControl__ = {
      epoch: 3,
      els: new Map([['e3_2', element]]),
    };

    expect(locateInPage('e3_2')).toEqual({ ok: true, x: 50, y: 40 });
    expect(locateInPage('e2_2')).toEqual({ ok: false });
  });

  it('returns the current target label for approval policy classification', () => {
    const element = {
      isConnected: true,
      tagName: 'BUTTON',
      textContent: 'Delete account',
      getAttribute: () => null,
    };
    (globalThis as Record<string, unknown>).__agentBrowserControl__ = {
      epoch: 4,
      els: new Map([['e4_1', element]]),
    };

    expect(approvalContextInPage('e4_1', 'https://example.test/settings')).toEqual({
      documentRevision: 'https://example.test/settings#4',
      target: { role: 'button', name: 'Delete account' },
    });
  });
});
