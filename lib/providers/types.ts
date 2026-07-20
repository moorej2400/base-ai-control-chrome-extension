import type { LanguageModel } from 'ai';

export interface ModelInfo {
  id: string;
  /** Stable UI/storage key when one Copilot model id exposes multiple context tiers. */
  variantId?: string;
  label: string;
  /** Model family — shared across context-size variants (e.g. claude-opus-4.7). */
  family: string;
  contextTier?: 'default' | 'long_context';
  contextWindow?: number;
  maxOutputTokens?: number;
  supportedEndpoints?: string[];
  price?: ModelPriceInfo;
  supportsToolCalls: boolean;
  supportsVision?: boolean;
}

export interface ModelPriceInfo {
  batchSize?: number;
  inputPrice?: number;
  outputPrice?: number;
  cacheReadPrice?: number;
  cacheWritePrice?: number;
}

export type AuthState =
  | { status: 'signed-out' }
  | {
      status: 'pending-device';
      userCode: string;
      verificationUri: string;
      expiresAt: number;
    }
  | { status: 'signed-in'; user?: { login: string } }
  | { status: 'error'; message: string };

export interface ChatProvider {
  readonly id: string;
  readonly label: string;

  getAuthState(): Promise<AuthState>;
  /**
   * Starts the sign-in flow. For device flow, emits a `pending-device` state
   * via onAuthStateChange and resolves once the user completes authorization.
   */
  signIn(signal?: AbortSignal): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(cb: (state: AuthState) => void): () => void;

  listModels(): Promise<ModelInfo[]>;
  /** Returns an AI SDK LanguageModel ready for streamText. Auth/token refresh is handled internally. */
  getModel(modelId: string): Promise<LanguageModel>;
}
