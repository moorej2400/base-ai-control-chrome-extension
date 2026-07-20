import type { Tool } from 'ai';
import type { ToolModule } from '../../tools/types';
import { getExtensionDriver } from './driver/extension/extension-driver';
import { tabsTools } from './tools/tabs';
import { navigationTools } from './tools/navigation';
import { snapshotTools } from './tools/snapshot';
import { inputTools } from './tools/input';
import { captureTools } from './tools/capture';

/** Stable module id — the single string the rest of the app refers to. */
export const BROWSER_CONTROL_MODULE_ID = 'browser-control';

/**
 * The browser-control ToolModule: the ONLY thing that leaves this folder. It
 * plugs into `lib/tools/registry.ts` exactly like `page`/`jira`. All actual
 * control goes through a `BrowserDriver` (today: the chrome-extension driver),
 * so the underlying mechanism can be swapped without touching the agent loop.
 *
 * Intentionally NOT in DEFAULT_TOOL_MODULES: acting on a page is a higher trust
 * level than reading it, so it is opt-in per user (a Settings toggle enables the
 * module id for the session).
 */
export const browserControlModule: ToolModule = {
  id: BROWSER_CONTROL_MODULE_ID,
  label: 'Browser control',
  getTools(): Record<string, Tool> {
    const driver = getExtensionDriver();
    return {
      ...tabsTools(driver),
      ...navigationTools(driver),
      ...snapshotTools(driver),
      ...inputTools(driver),
      ...captureTools(driver),
    };
  },
};
