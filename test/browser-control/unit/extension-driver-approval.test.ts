import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionDriver } from '@/lib/agent-tools/browser-control/driver/extension/extension-driver';
import type { ApprovalAwareBrowserDriver } from '@/lib/agent-tools/browser-control/driver/types';

afterEach(() => vi.unstubAllGlobals());

describe('extension fallback approval context', () => {
  it('uses a serializable null reference for commands without a target', async () => {
    const executeScript = vi.fn(async (injection: { args?: unknown[] }) => {
      if (injection.args?.some((value) => value === undefined)) {
        throw new Error('Value is unserializable.');
      }
      return [{ result: { documentRevision: 'https://example.test/#1' } }];
    });
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{
          id: 7,
          index: 0,
          title: 'Example',
          url: 'https://example.test/',
          active: true,
        }]),
      },
      scripting: { executeScript },
    });
    const driver = createExtensionDriver() as ApprovalAwareBrowserDriver;

    await expect(driver.approvalContext()).resolves.toEqual({
      documentRevision: 'https://example.test/#1',
    });
    expect(executeScript.mock.calls[0]?.[0].args?.[0]).toBeNull();
  });
});
