import { useEffect, useState } from 'react';

const ALL_URLS = { origins: ['<all_urls>'] };

/**
 * Real host-permission control (the extension's existing "read any site"
 * feature). By default the agent can only read a tab after the user clicks the
 * extension icon on it; granting all-sites lets it read whichever tab is active,
 * including after switching tabs.
 */
export function usePageAccess() {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    void chrome.permissions.contains(ALL_URLS).then(setGranted);
  }, []);

  const toggle = async () => {
    if (granted) await chrome.permissions.remove(ALL_URLS);
    else await chrome.permissions.request(ALL_URLS); // false if the user dismisses
    setGranted(await chrome.permissions.contains(ALL_URLS));
  };

  return { granted, toggle };
}
