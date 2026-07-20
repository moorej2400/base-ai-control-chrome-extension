import { storageGet, storageSet } from '../../storage/chrome-storage';

const CUSTOM_PROVIDERS_KEY = 'settings.customProviders';

/**
 * A user-configured, OpenAI-compatible provider (Ollama, LM Studio, OpenAI,
 * OpenRouter, vLLM, or any endpoint that speaks the OpenAI `/models` +
 * `/chat/completions` shape). Persisted in chrome.storage.local. The API key,
 * when present, is sent as `Authorization: Bearer <key>`.
 */
export interface CustomProviderConfig {
  /** Stable id, also used as the ChatProvider id (e.g. `custom-ab12`). */
  id: string;
  /** Display name shown in Settings and the model picker. */
  label: string;
  /**
   * OpenAI-compatible base URL, INCLUDING any version path. For Ollama this is
   * `http://localhost:11434/v1`; for OpenAI `https://api.openai.com/v1`.
   */
  baseUrl: string;
  /** Optional bearer key. Ollama and other local servers need none. */
  apiKey?: string;
  createdAt: number;
}

/** Presets that pre-fill the config form when adding a provider. */
export interface ProviderTemplate {
  key: string;
  label: string;
  initial: string;
  baseUrl: string;
  /** Hint shown under the base-URL field. */
  hint: string;
  needsKey: boolean;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    key: 'ollama',
    label: 'Ollama (local)',
    initial: 'L',
    baseUrl: 'http://localhost:11434/v1',
    hint: 'Local Ollama server. Run `OLLAMA_ORIGINS=* ollama serve` so the extension can reach it.',
    needsKey: false,
  },
  {
    key: 'openai',
    label: 'OpenAI',
    initial: 'O',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'Official OpenAI API. Requires an API key.',
    needsKey: true,
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    initial: 'R',
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: 'Aggregator for many models. Requires an API key.',
    needsKey: true,
  },
  {
    key: 'custom',
    label: 'Custom endpoint',
    initial: 'C',
    baseUrl: '',
    hint: 'Any OpenAI-compatible base URL (must include the version path, e.g. /v1).',
    needsKey: false,
  },
];

export async function listCustomProviders(): Promise<CustomProviderConfig[]> {
  const list = await storageGet<CustomProviderConfig[]>(CUSTOM_PROVIDERS_KEY);
  return Array.isArray(list) ? list.filter(isConfig) : [];
}

export async function getCustomProvider(
  id: string,
): Promise<CustomProviderConfig | undefined> {
  return (await listCustomProviders()).find((c) => c.id === id);
}

export async function saveCustomProvider(
  config: CustomProviderConfig,
): Promise<void> {
  const list = await listCustomProviders();
  const i = list.findIndex((c) => c.id === config.id);
  if (i === -1) list.push(config);
  else list[i] = config;
  await storageSet(CUSTOM_PROVIDERS_KEY, list);
}

export async function removeCustomProvider(id: string): Promise<void> {
  const list = await listCustomProviders();
  await storageSet(
    CUSTOM_PROVIDERS_KEY,
    list.filter((c) => c.id !== id),
  );
}

export function newCustomProviderId(): string {
  return `custom-${crypto.randomUUID().slice(0, 8)}`;
}

/** `http://localhost:11434/v1` -> `http://localhost:11434/*` for permissions. */
export function originPattern(baseUrl: string): string | null {
  try {
    return `${new URL(baseUrl).origin}/*`;
  } catch {
    return null;
  }
}

function isConfig(value: unknown): value is CustomProviderConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<CustomProviderConfig>;
  return (
    typeof c.id === 'string' &&
    typeof c.label === 'string' &&
    typeof c.baseUrl === 'string'
  );
}
