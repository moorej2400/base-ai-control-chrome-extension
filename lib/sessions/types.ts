export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId: string;
  modelId: string;
  enabledToolModules: string[];
  /** Distinguishes a user's explicit browser-control choice from legacy sessions. */
  browserControlConfigured?: boolean;
}

export const NEW_CHAT_TITLE = 'New chat';
