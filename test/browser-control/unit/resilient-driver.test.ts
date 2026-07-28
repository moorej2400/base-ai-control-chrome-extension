import { describe, expect, it, vi } from 'vitest';
import { ResilientDriverFactory } from '@/lib/agent-tools/browser-control/driver/resilient-driver';
import type {
  ApprovalAwareBrowserDriver,
  BrowserDriver,
  SessionDriverFactory,
} from '@/lib/agent-tools/browser-control/driver/types';

const tab = {
  id: 7,
  index: 0,
  title: 'Bench',
  url: 'http://localhost:4599/',
  active: true,
  isTarget: true,
};

function createDrivers() {
  const primary = {
    getTargetTab: vi.fn(async () => tab),
    snapshot: vi.fn(async () => ({
      ok: false,
      error: 'CDP command failed: Cannot access a chrome-extension:// URL of different extension',
    })),
    fill: vi.fn(async () => ({
      ok: false,
      error: 'Detached while handling command.',
    })),
  } as unknown as BrowserDriver;
  const fallback = {
    setTargetTab: vi.fn(async () => tab),
    screenshot: vi.fn(async () => ({ ok: true, dataUrl: 'data:image/jpeg;base64,abc' })),
    snapshot: vi.fn(async () => ({
      ok: true,
      url: tab.url,
      title: tab.title,
      tree: 'e1_name textbox "Full name"',
      headings: '',
      nodeCount: 1,
      truncated: false,
    })),
  } as unknown as BrowserDriver;
  const primaryFactory = {
    forSession: vi.fn(() => primary),
  } as SessionDriverFactory;
  return { primary, fallback, primaryFactory };
}

describe('ResilientDriverFactory', () => {
  it('retries reference-free reads through the session fallback after CDP becomes unavailable', async () => {
    const { primary, fallback, primaryFactory } = createDrivers();
    const driver = new ResilientDriverFactory(primaryFactory, () => fallback).forSession('session-a');

    const result = await driver.snapshot();

    expect(result).toMatchObject({ ok: true, tree: expect.stringContaining('Full name') });
    expect(primary.getTargetTab).toHaveBeenCalled();
    expect(fallback.setTargetTab).toHaveBeenCalledWith(7);
    expect(fallback.snapshot).toHaveBeenCalled();
  });

  it('requires a fresh snapshot before reusing element references after fallback activation', async () => {
    const { fallback, primaryFactory } = createDrivers();
    const driver = new ResilientDriverFactory(primaryFactory, () => fallback).forSession('session-a');

    const result = await driver.fill('cdp-ref', 'Ada');

    expect(result).toEqual({
      ok: false,
      error: 'Chrome CDP became unavailable; take_snapshot to refresh element references and continue.',
    });
    await driver.snapshot();
    expect(fallback.snapshot).toHaveBeenCalled();
  });

  it('captures at most one screenshot per browser turn', async () => {
    const { fallback, primaryFactory } = createDrivers();
    const driver = new ResilientDriverFactory(primaryFactory, () => fallback).forSession('session-a', 'turn-a');
    await driver.fill('cdp-ref', 'Ada');

    expect(await driver.screenshot()).toMatchObject({ ok: true });
    expect(await driver.screenshot()).toEqual({
      ok: false,
      error: 'A screenshot was already captured this turn; use take_snapshot and direct controls.',
    });
    expect(fallback.screenshot).toHaveBeenCalledTimes(1);
  });

  it('preserves label-aware approval context across the resilient wrapper', async () => {
    const { primary, fallback, primaryFactory } = createDrivers();
    const primaryContext = vi.fn(async () => ({
      documentRevision: 'primary-revision',
      target: { name: 'Delete account' },
    }));
    const fallbackContext = vi.fn(async () => ({
      documentRevision: 'fallback-revision',
      target: { name: 'Delete account' },
    }));
    Object.assign(primary, { approvalContext: primaryContext });
    Object.assign(fallback, { approvalContext: fallbackContext });
    const driver = new ResilientDriverFactory(primaryFactory, () => fallback)
      .forSession('session-a') as ApprovalAwareBrowserDriver;

    await expect(driver.approvalContext('cdp-ref')).resolves.toEqual({
      documentRevision: 'primary-revision',
      target: { name: 'Delete account' },
    });
    expect(primaryContext).toHaveBeenCalledWith('cdp-ref');
    expect(fallbackContext).not.toHaveBeenCalled();
  });
});
