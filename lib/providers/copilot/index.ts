import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { AuthState, ChatProvider, ModelInfo } from '../types';
import { copilotFetch } from './copilot-fetch';
import { pollForAccessToken, requestDeviceCode } from './device-flow';
import {
  clearGithubToken,
  clearSession,
  getGithubToken,
  getSession,
  setGithubToken,
} from './token-manager';
import { transformCopilotRequestBody } from './cache-transform';
import { listCopilotModels } from './models';
import { createCopilotResponsesModel } from './responses-model';

class CopilotProvider implements ChatProvider {
  readonly id = 'copilot';
  readonly label = 'GitHub Copilot';

  private listeners = new Set<(state: AuthState) => void>();
  private transientState: AuthState | null = null;
  private cachedUser: { login: string } | undefined;

  async getAuthState(): Promise<AuthState> {
    if (this.transientState) return this.transientState;
    const gho = await getGithubToken();
    if (!gho) return { status: 'signed-out' };
    if (!this.cachedUser) {
      this.cachedUser = await fetchGithubUser(gho).catch(() => undefined);
    }
    return { status: 'signed-in', user: this.cachedUser };
  }

  async signIn(signal?: AbortSignal): Promise<void> {
    try {
      const info = await requestDeviceCode();
      this.emit({
        status: 'pending-device',
        userCode: info.userCode,
        verificationUri: info.verificationUri,
        expiresAt: info.expiresAt,
      });

      const gho = await pollForAccessToken(info, signal);
      await setGithubToken(gho);
      // Validate the token and capture the per-account API endpoints now,
      // so problems surface during sign-in rather than on first message.
      await getSession();

      this.cachedUser = await fetchGithubUser(gho).catch(() => undefined);
      this.transientState = null;
      this.emit({ status: 'signed-in', user: this.cachedUser });
    } catch (err) {
      this.transientState = null;
      if (err instanceof DOMException && err.name === 'AbortError') {
        this.emit({ status: 'signed-out' });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ status: 'error', message });
      throw err;
    }
  }

  async signOut(): Promise<void> {
    await clearGithubToken();
    clearSession();
    this.cachedUser = undefined;
    this.transientState = null;
    this.emit({ status: 'signed-out' });
  }

  onAuthStateChange(cb: (state: AuthState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  listModels(): Promise<ModelInfo[]> {
    return listCopilotModels();
  }

  async getModel(modelId: string): Promise<LanguageModel> {
    const modelInfo = (await listCopilotModels()).find((m) => m.id === modelId);
    if (
      modelInfo?.supportedEndpoints?.includes('/responses') &&
      !modelInfo.supportedEndpoints.includes('/chat/completions')
    ) {
      return createCopilotResponsesModel(modelId);
    }

    const provider = createOpenAICompatible({
      name: 'copilot',
      // Placeholder origin — copilotFetch rewrites it to the API base from
      // the token exchange (e.g. api.individual.githubcopilot.com).
      baseURL: 'https://api.githubcopilot.com',
      fetch: copilotFetch,
      includeUsage: true,
      transformRequestBody: transformCopilotRequestBody,
    });
    return provider.chatModel(modelId);
  }

  private emit(state: AuthState) {
    this.transientState =
      state.status === 'pending-device' || state.status === 'error'
        ? state
        : null;
    for (const cb of this.listeners) cb(state);
  }
}

async function fetchGithubUser(
  ghoToken: string,
): Promise<{ login: string } | undefined> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${ghoToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.login ? { login: data.login } : undefined;
}

export const copilotProvider: ChatProvider = new CopilotProvider();
