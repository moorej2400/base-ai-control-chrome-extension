import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export interface BridgePaths {
  root: string;
  registry: string;
  socketDirectory: string;
}

/** Resolve user-only registry and socket paths; tests can inject platform data. */
export function bridgePaths(
  rootOverride?: string,
  platform: NodeJS.Platform = process.platform,
  userId: number | undefined = process.getuid?.(),
): BridgePaths {
  const root = rootOverride ?? (
    platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'AI Page Chat', 'browser-bridge')
      : platform === 'win32'
        ? join(process.env.LOCALAPPDATA ?? homedir(), 'AI Page Chat', 'browser-bridge')
        : join(process.env.XDG_RUNTIME_DIR ?? process.env.XDG_CACHE_HOME ?? tmpdir(), 'ai-page-chat-browser-bridge')
  );
  // Darwin caps AF_UNIX paths at roughly 104 bytes. Application Support plus a
  // UUID exceeds that limit, so keep only the private socket directory short.
  const socketDirectory = rootOverride === undefined && platform === 'darwin'
    ? join('/tmp', `ai-page-chat-browser-${userId ?? 'user'}`)
    : join(root, 'sockets');
  return { root, registry: join(root, 'instances.json'), socketDirectory };
}
