import { useCallback, useEffect, useState } from 'react';
import { copilotProvider } from '@/lib/providers/copilot';
import { listProviders, syncCustomProviders } from '@/lib/providers/registry';
import { getContextChoices, groupModels } from '@/lib/providers/model-groups';
import type { ProviderGroups } from './model-menu';

const CUSTOM_KEY = 'settings.customProviders';
const CONTEXT_KEY = 'settings.contextByFamily';

/**
 * Loads the model catalog across every connected provider (Copilot + any
 * custom OpenAI-compatible endpoints). Reloads when custom providers change,
 * context-variant choices change, or Copilot auth flips. Returns the grouped
 * catalog plus the saved context-variant choices.
 */
export function useModelCatalog() {
  const [providerGroups, setProviderGroups] = useState<ProviderGroups[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    await syncCustomProviders();
    const results: ProviderGroups[] = [];
    for (const provider of listProviders()) {
      const auth = await provider
        .getAuthState()
        .catch(() => ({ status: 'signed-out' as const }));
      if (auth.status !== 'signed-in') continue;
      const models = await provider.listModels().catch(() => []);
      if (models.length === 0) continue;
      const toolCapable = models.filter((m) => m.supportsToolCalls);
      results.push({
        providerId: provider.id,
        providerLabel: provider.label,
        isCopilot: provider.id === copilotProvider.id,
        groups: groupModels(toolCapable.length > 0 ? toolCapable : models),
      });
    }
    const savedChoices = await getContextChoices();
    setProviderGroups(results);
    setChoices(savedChoices);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && (changes[CUSTOM_KEY] || changes[CONTEXT_KEY])) {
        void reload();
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    const unsub = copilotProvider.onAuthStateChange(() => void reload());
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      unsub();
    };
  }, [reload]);

  return { providerGroups, choices, setChoices, loading, reload };
}
