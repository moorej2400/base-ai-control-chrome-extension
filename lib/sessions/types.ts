export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId: string;
  modelId: string;
  enabledToolModules: string[];
}

export const NEW_CHAT_TITLE = 'New chat';
