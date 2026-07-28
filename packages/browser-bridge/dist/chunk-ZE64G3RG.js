// src/ipc/paths.ts
import { homedir, tmpdir } from "os";
import { join } from "path";
function bridgePaths(rootOverride, platform = process.platform, userId = process.getuid?.()) {
  const root = rootOverride ?? (platform === "darwin" ? join(homedir(), "Library", "Application Support", "AI Page Chat", "browser-bridge") : platform === "win32" ? join(process.env.LOCALAPPDATA ?? homedir(), "AI Page Chat", "browser-bridge") : join(process.env.XDG_RUNTIME_DIR ?? process.env.XDG_CACHE_HOME ?? tmpdir(), "ai-page-chat-browser-bridge"));
  const socketDirectory = rootOverride === void 0 && platform === "darwin" ? join("/tmp", `ai-page-chat-browser-${userId ?? "user"}`) : join(root, "sockets");
  return { root, registry: join(root, "instances.json"), socketDirectory };
}

export {
  bridgePaths
};
