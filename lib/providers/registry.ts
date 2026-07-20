import type { ChatProvider } from './types';
import { copilotProvider } from './copilot';
import { CustomProvider } from './custom/provider';
import { listCustomProviders } from './custom/config';

const providers = new Map<string, ChatProvider>();

export function registerProvider(provider: ChatProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): ChatProvider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
}

export function listProviders(): ChatProvider[] {
  return [...providers.values()];
}

registerProvider(copilotProvider);

export const DEFAULT_PROVIDER_ID = copilotProvider.id;

/**
 * Hydrates custom (OpenAI-compatible) providers from storage into the registry,
 * reconciling adds/edits/removes. Existing instances are updated in place so
 * that references held elsewhere (and their auth listeners) stay valid.
 *
 * Call once at sidepanel startup and again whenever `settings.customProviders`
 * changes. Returns the current custom-provider instances.
 */
export async function syncCustomProviders(): Promise<CustomProvider[]> {
  const configs = await listCustomProviders();
  const wantedIds = new Set(configs.map((c) => c.id));

  // Drop custom providers that were removed from storage.
  for (const provider of providers.values()) {
    if (provider instanceof CustomProvider && !wantedIds.has(provider.id)) {
      providers.delete(provider.id);
    }
  }

  const result: CustomProvider[] = [];
  for (const config of configs) {
    const existing = providers.get(config.id);
    if (existing instanceof CustomProvider) {
      existing.updateConfig(config);
      result.push(existing);
    } else {
      const provider = new CustomProvider(config);
      registerProvider(provider);
      result.push(provider);
    }
  }
  return result;
}
