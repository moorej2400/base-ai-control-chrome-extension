import { useCallback, useEffect, useState } from 'react';
import { copilotProvider } from '@/lib/providers/copilot';
import { listCustomProviders } from '@/lib/providers/custom/config';
import { useAuthState } from '../hooks';

// Real provider catalog for the Settings / Onboarding / Provider-config screens.
// GitHub Copilot is the dedicated device-auth provider; everything else is a
// user-added, OpenAI-compatible endpoint (Ollama, OpenAI, OpenRouter, custom).
// There are no hard-coded "already connected" providers.

export interface ProviderRow {
  id: string;
  name: string;
  initial: string;
  tint: string;
  /** Status dot color token. */
  dot: string;
  detail: string;
  connected: boolean;
  /** Copilot routes to the dedicated device-auth screen. */
  isCopilot: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url || 'Not configured';
  }
}

/**
 * Live provider list: the Copilot row (auth state from the real provider) plus
 * every custom provider the user has saved. Re-reads on storage changes so
 * adding/removing a provider reflects immediately.
 */
export function useProviders(): ProviderRow[] {
  const auth = useAuthState(copilotProvider);
  const [custom, setCustom] = useState<ProviderRow[]>([]);

  const reload = useCallback(async () => {
    const configs = await listCustomProviders();
    setCustom(
      configs.map((c) => ({
        id: c.id,
        name: c.label,
        initial: (c.label.trim()[0] ?? 'C').toUpperCase(),
        tint: 'var(--accent-tint)',
        connected: Boolean(c.baseUrl.trim()),
        dot: c.baseUrl.trim() ? 'var(--ok)' : 'var(--dim)',
        detail: hostOf(c.baseUrl),
        isCopilot: false,
      })),
    );
  }, []);

  useEffect(() => {
    void reload();
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes['settings.customProviders']) void reload();
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [reload]);

  const signedIn = auth?.status === 'signed-in';
  const copilot: ProviderRow = {
    id: copilotProvider.id,
    name: 'GitHub Copilot',
    initial: 'GH',
    tint: 'var(--chip)',
    connected: signedIn,
    dot: signedIn ? 'var(--ok)' : 'var(--dim)',
    detail: signedIn
      ? auth?.status === 'signed-in' && auth.user
        ? `Connected · ${auth.user.login}`
        : 'Connected'
      : auth?.status === 'pending-device'
        ? 'Signing in…'
        : 'Device sign-in required',
    isCopilot: true,
  };

  return [copilot, ...custom];
}
