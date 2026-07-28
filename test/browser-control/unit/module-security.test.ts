import { describe, expect, it } from 'vitest';
import { browserControlModule } from '@/lib/agent-tools/browser-control/module';
import type { BrowserDriver } from '@/lib/agent-tools/browser-control/driver/types';
import { DEFAULT_TOOL_MODULES } from '@/lib/tools/registry';

const driver: BrowserDriver = {
  getTargetTab: async () => ({ id: 1, index: 0, title: '', url: '', active: true, isTarget: true }),
  setTargetTab: async () => ({ id: 1, index: 0, title: '', url: '', active: true, isTarget: true }),
  listTabs: async () => [], navigate: async () => ({ ok: false, error: '' }), navigateHistory: async () => ({ ok: false, error: '' }),
  newTab: async () => ({ ok: false, error: '' }), closeTab: async () => ({ ok: false, error: '' }), waitFor: async () => ({ ok: false, error: '' }),
  snapshot: async () => ({ ok: false, error: '' }), screenshot: async () => ({ ok: false, error: '' }), evaluate: async () => ({ ok: false, error: '' }),
  click: async () => ({ ok: false, error: '' }), hover: async () => ({ ok: false, error: '' }), fill: async () => ({ ok: false, error: '' }),
  fillForm: async () => ({ ok: false, error: '' }), pressKey: async () => ({ ok: false, error: '' }), scrollTo: async () => ({ ok: false, error: '' }),
};

describe('browser-control module safety', () => {
  it('enables browser control for new embedded-agent sessions by default', () => {
    expect(DEFAULT_TOOL_MODULES).toContain(browserControlModule.id);
  });

  it('does not expose raw page evaluation in an ordinary agent session', () => {
    const tools = browserControlModule.getTools({
      browserControlDriver: driver,
      getActiveTab: async () => ({ id: 1 } as chrome.tabs.Tab),
      getModel: async () => { throw new Error('not used'); },
    });

    expect(tools).toHaveProperty('take_screenshot');
    expect(tools).not.toHaveProperty('evaluate_script');
  });
});
