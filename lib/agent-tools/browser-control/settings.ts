/** Local-only opt-ins for the dual-client browser-control runtime. */
export const BROWSER_CONTROL_EXTERNAL_ENABLED_KEY = 'settings.browserControl.externalEnabled';
/** Distinguishes a current explicit user choice from the prior default-off value. */
export const BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY = 'settings.browserControl.externalConfigured';

export async function getExternalBrowserControlEnabled(): Promise<boolean> {
  const values = await chrome.storage.local.get([
    BROWSER_CONTROL_EXTERNAL_ENABLED_KEY,
    BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY,
  ]);
  // External clients are a first-class route: enable it for new installs while
  // retaining an explicit local opt-out for users who turn the switch off in
  // this version. Older installs stored `false` as the prior default, so it
  // must not silently remain an opt-out after the default changes.
  return values[BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY] !== true
    || values[BROWSER_CONTROL_EXTERNAL_ENABLED_KEY] !== false;
}

export async function setExternalBrowserControlEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({
    [BROWSER_CONTROL_EXTERNAL_ENABLED_KEY]: enabled,
    [BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY]: true,
  });
}
