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
 * plugs into `lib/tools/registry.ts` exactly like `page`/`jira`. The side-panel
 * path receives a coordinator-backed CDP driver; the direct driver fallback is
 * reserved for isolated tests/non-panel callers.
 *
 * New embedded-agent sessions enable this module by default. The session-level
 * control remains available for an explicit user opt-out.
 */
export const browserControlModule: ToolModule = {
  id: BROWSER_CONTROL_MODULE_ID,
  label: 'Browser control',
  getTools(ctx): Record<string, Tool> {
    // The coordinator client preserves the historical BrowserDriver surface.
    const driver = ctx.browserControlDriver ?? getExtensionDriver();
    return {
      ...tabsTools(driver),
      ...navigationTools(driver),
      ...snapshotTools(driver),
      ...inputTools(driver),
      ...captureTools(driver),
    };
  },
};
