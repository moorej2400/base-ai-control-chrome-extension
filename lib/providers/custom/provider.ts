import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AuthState, ChatProvider, ModelInfo } from '../types';
import type { CustomProviderConfig } from './config';

/**
 * A ChatProvider backed by any OpenAI-compatible HTTP endpoint (Ollama,
 * LM Studio, OpenAI, OpenRouter, vLLM, …). It has no interactive sign-in:
 * "auth" simply reflects whether a base URL is configured. The config object
 * is mutable (via `updateConfig`) so the registry can keep a single instance in
 * sync as the user edits it, without invalidating references held elsewhere.
 */
export class CustomProvider implements ChatProvider {
  readonly id: string;
  private config: CustomProviderConfig;
  private listeners = new Set<(state: AuthState) => void>();

  constructor(config: CustomProviderConfig) {
    this.id = config.id;
    this.config = config;
  }

  get label(): string {
    return this.config.label;
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  updateConfig(config: CustomProviderConfig): void {
    this.config = config;
    void this.getAuthState().then((state) => this.emit(state));
  }

  async getAuthState(): Promise<AuthState> {
    // Configured (has a base URL) counts as "signed-in" for UI purposes. An
    // unreachable endpoint surfaces as a request error at send time, and the
    // config screen offers an explicit connection test.
    return this.config.baseUrl.trim()
      ? { status: 'signed-in' }
      : { status: 'signed-out' };
  }

  async signIn(): Promise<void> {
    this.emit(await this.getAuthState());
  }

  async signOut(): Promise<void> {
    // Nothing to revoke; clearing the provider is done by removing its config.
    this.emit({ status: 'signed-out' });
  }

  onAuthStateChange(cb: (state: AuthState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(this.url('/models'), { headers: this.headers() });
    if (!res.ok) {
      throw new Error(
        `Failed to list models from ${this.config.label} (${res.status})`,
      );
    }
    const data = await res.json();
    const entries: unknown[] = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models) // Ollama's native /api/tags shape, just in case
        ? data.models
        : [];
    return entries
      .map((entry) => this.toModelInfo(entry))
      .filter((m): m is ModelInfo => m !== null);
  }

  async getModel(modelId: string): Promise<LanguageModel> {
    const provider = createOpenAICompatible({
      name: this.id,
      baseURL: this.config.baseUrl,
      apiKey: this.config.apiKey || undefined,
      includeUsage: true,
    });
    return provider.chatModel(modelId);
  }

  /** Not part of ChatProvider; used by the config screen's "Test connection". */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const models = await this.listModels();
      return {
        ok: true,
        detail: `Reached endpoint · ${models.length} model${models.length === 1 ? '' : 's'}`,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  private toModelInfo(entry: unknown): ModelInfo | null {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : typeof e.name === 'string' ? e.name : '';
    if (!id) return null;
    return {
      id,
      label: id,
      family: id,
      // OpenAI-compatible servers rarely advertise tool support in /models, so
      // assume capable; the request simply won't call tools if unsupported.
      supportsToolCalls: true,
    };
  }

  private headers(): Record<string, string> {
    return this.config.apiKey
      ? { Authorization: `Bearer ${this.config.apiKey}` }
      : {};
  }

  private url(path: string): string {
    return this.config.baseUrl.replace(/\/+$/, '') + path;
  }

  private emit(state: AuthState): void {
    for (const cb of this.listeners) cb(state);
  }
}
