import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_CONTROL_MODULE_ID } from '@/lib/agent-tools/browser-control/module';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/storage/chrome-storage', () => ({
  storageGet: storage.get,
  storageSet: storage.set,
}));

import { listSessions } from '@/lib/sessions/store';

const legacySession = {
  id: 'session-1',
  title: 'Legacy chat',
  createdAt: 1,
  updatedAt: 2,
  providerId: 'copilot',
  modelId: 'model-1',
  enabledToolModules: ['page'],
};

describe('embedded-agent browser-control defaults', () => {
  beforeEach(() => {
    storage.get.mockReset();
    storage.set.mockReset();
  });

  it('migrates a legacy session to browser control on', async () => {
    storage.get.mockResolvedValue([legacySession]);

    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({
        browserControlConfigured: true,
        enabledToolModules: ['page', BROWSER_CONTROL_MODULE_ID],
      }),
    ]);
  });

  it('preserves an explicit per-session opt-out', async () => {
    storage.get.mockResolvedValue([
      { ...legacySession, browserControlConfigured: true },
    ]);

    await expect(listSessions()).resolves.toEqual([
      expect.objectContaining({
        browserControlConfigured: true,
        enabledToolModules: ['page'],
      }),
    ]);
  });
});
