import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_CONTROL_EXTERNAL_ENABLED_KEY,
  BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY,
  getExternalBrowserControlEnabled,
} from '../../../lib/agent-tools/browser-control/settings';

describe('external browser-control setting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to enabled until the user explicitly disables it', async () => {
    const get = vi.fn().mockResolvedValue({});
    vi.stubGlobal('chrome', { storage: { local: { get } } });

    await expect(getExternalBrowserControlEnabled()).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith([
      BROWSER_CONTROL_EXTERNAL_ENABLED_KEY,
      BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY,
    ]);
  });

  it('preserves an explicit user opt-out', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [BROWSER_CONTROL_EXTERNAL_ENABLED_KEY]: false,
            [BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY]: true,
          }),
        },
      },
    });

    await expect(getExternalBrowserControlEnabled()).resolves.toBe(false);
  });

  it('upgrades a legacy stored false to the default-on behavior', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockResolvedValue({ [BROWSER_CONTROL_EXTERNAL_ENABLED_KEY]: false }) } },
    });

    await expect(getExternalBrowserControlEnabled()).resolves.toBe(true);
  });
});
