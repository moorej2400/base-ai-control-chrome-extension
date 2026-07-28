#!/usr/bin/env node
import {
  bridgePaths
} from "./chunk-ZE64G3RG.js";
import {
  BridgeRegistry
} from "./chunk-6DZVDXUH.js";
import {
  EXTENSION_MESSAGE_LIMIT,
  NativeFrameDecoder,
  PRIVATE_IPC_MESSAGE_LIMIT,
  encodeNativeFrame,
  verifyHandshake
} from "./chunk-ZFNZQSIQ.js";
import "./chunk-U67V476Y.js";

// src/cli.ts
import { chmod, mkdir, readFile, readdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname as dirname2, join as join3 } from "path";
import { fileURLToPath } from "url";

// src/logging.ts
function logBridge(message) {
  process.stderr.write(`[ai-page-chat-browser] ${message}
`);
}

// src/native/native-host.ts
import { randomBytes, randomUUID } from "crypto";
import { join } from "path";
import { stdin, stdout } from "process";

// src/ipc/server.ts
import { createServer } from "net";
var IpcServer = class {
  constructor(options) {
    this.options = options;
  }
  options;
  server;
  listen() {
    if (this.server) return Promise.resolve();
    this.server = createServer((socket) => this.handleSocket(socket));
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.options.socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }
  close() {
    if (!this.server) return Promise.resolve();
    const server = this.server;
    this.server = void 0;
    return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  handleSocket(socket) {
    const decoder = new NativeFrameDecoder(PRIVATE_IPC_MESSAGE_LIMIT);
    let authorized = false;
    socket.on("data", (chunk) => {
      try {
        for (const message of decoder.push(chunk)) {
          if (!authorized) {
            const verified = verifyHandshake(message, this.options.token, this.options.protocolVersion);
            socket.write(encodeNativeFrame(verified, PRIVATE_IPC_MESSAGE_LIMIT));
            if (!verified.ok) {
              socket.end();
              return;
            }
            authorized = true;
            continue;
          }
          const request = message;
          if (request.type !== "request" || typeof request.id !== "string") {
            socket.end();
            return;
          }
          void this.options.handle(request.payload).then((result) => {
            socket.write(encodeNativeFrame({ type: "response", id: request.id, ok: true, result }, PRIVATE_IPC_MESSAGE_LIMIT));
          }).catch((error) => {
            socket.write(encodeNativeFrame({ type: "response", id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }, PRIVATE_IPC_MESSAGE_LIMIT));
          });
        }
      } catch {
        socket.end();
      }
    });
  }
};

// src/native/native-relay.ts
var NativeHostRelay = class {
  constructor(writeToChrome) {
    this.writeToChrome = writeToChrome;
  }
  writeToChrome;
  pending = /* @__PURE__ */ new Map();
  forward(envelope) {
    const requestId = requestIdOf(envelope);
    if (!requestId) return Promise.reject(new Error("IPC envelope is missing requestId."));
    const response = new Promise((resolve, reject) => this.pending.set(requestId, { resolve, reject }));
    try {
      this.writeToChrome(envelope);
    } catch (error) {
      this.pending.delete(requestId);
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return response;
  }
  receive(message) {
    const requestId = requestIdOf(message);
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve(message);
  }
  disconnect() {
    for (const pending of this.pending.values()) pending.reject(new Error("Chrome native connection disconnected."));
    this.pending.clear();
  }
};
function requestIdOf(value) {
  return typeof value === "object" && value !== null && typeof value.requestId === "string" ? value.requestId : void 0;
}

// src/native/native-host.ts
async function runBridgeNativeHost(options = {}) {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const decoder = new NativeFrameDecoder();
  const paths = options.paths ?? bridgePaths();
  const registry = new BridgeRegistry(paths);
  const relay = new NativeHostRelay((message) => output.write(encodeNativeFrame(message, EXTENSION_MESSAGE_LIMIT)));
  let server;
  let heartbeat;
  let instanceId;
  let cleaningUp;
  const start = async () => {
    instanceId = options.createInstanceId?.() ?? randomUUID();
    const token = options.createToken?.() ?? randomBytes(32).toString("hex");
    const socketPath = (options.platform ?? process.platform) === "win32" ? `\\\\.\\pipe\\ai-page-chat-browser-${instanceId}` : join(paths.socketDirectory, `${instanceId}.sock`);
    await registry.prepare();
    server = new IpcServer({ socketPath, token, protocolVersion: 1, handle: (message) => relay.forward(message) });
    await server.listen();
    const instance = { id: instanceId, pid: options.pid ?? process.pid, socketPath, token, heartbeatAt: Date.now() };
    await registry.register(instance);
    heartbeat = setInterval(() => {
      void registry.register({ ...instance, heartbeatAt: Date.now() }).catch((error) => logBridge(error instanceof Error ? error.message : String(error)));
    }, 1e4);
    heartbeat.unref();
    output.write(encodeNativeFrame({ type: "ready", protocolVersion: 1 }, EXTENSION_MESSAGE_LIMIT));
    logBridge(`native bridge ready (${instanceId})`);
  };
  const cleanup = () => {
    if (cleaningUp) return cleaningUp;
    cleaningUp = (async () => {
      if (heartbeat) clearInterval(heartbeat);
      relay.disconnect();
      await server?.close().catch(() => {
      });
      if (instanceId) await registry.unregister(instanceId).catch(() => {
      });
    })();
    return cleaningUp;
  };
  await start();
  input.on("data", (chunk) => {
    try {
      for (const message of decoder.push(chunk)) {
        if (!isHello(message)) relay.receive(message);
      }
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
    }
  });
  input.on("end", () => {
    void cleanup();
  });
  if (input === stdin) {
    const terminate = () => {
      void cleanup().finally(() => process.exit(0));
    };
    process.once("SIGINT", terminate);
    process.once("SIGTERM", terminate);
  }
}
function isHello(message) {
  return typeof message === "object" && message !== null && message.type === "hello";
}

// src/native/installer.ts
import { join as join2, dirname } from "path";
var HOST_NAME = "ai_page_chat_browser";
function buildNativeHostManifest(launcherPath, extensionId) {
  return {
    name: HOST_NAME,
    description: "AI Page Chat local browser-control bridge",
    path: launcherPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };
}
function buildLauncher(platform, nodePath, cliPath, mode2 = "native-host") {
  return platform === "win32" ? `@echo off\r
"${nodePath}" "${cliPath}" ${mode2}\r
` : `#!/bin/sh
exec "${nodePath}" "${cliPath}" ${mode2}
`;
}
async function installNativeHost(options) {
  const hostDirectory = options.platform === "darwin" ? join2(options.root, "Google", "Chrome", "NativeMessagingHosts") : options.platform === "win32" ? join2(options.root, "Google", "Chrome", "NativeMessagingHosts") : join2(options.root, "google-chrome", "NativeMessagingHosts");
  const productDirectory = join2(options.root, "AI Page Chat", "browser-bridge");
  const runtimeDirectory = join2(productDirectory, "runtime");
  const installedCliPath = options.runtimeFiles?.length ? join2(runtimeDirectory, options.runtimeCliRelativePath ?? "cli.js") : options.cliPath;
  const launcherPath = join2(productDirectory, options.platform === "win32" ? "ai-page-chat-browser.cmd" : "ai-page-chat-browser");
  const mcpLauncherPath = join2(productDirectory, options.platform === "win32" ? "ai-page-chat-browser-mcp.cmd" : "ai-page-chat-browser-mcp");
  const manifestPath = join2(hostDirectory, `${HOST_NAME}.json`);
  await options.fs.mkdir(options.root);
  await options.fs.mkdir(productDirectory);
  if (options.runtimeFiles?.length) {
    for (const file of options.runtimeFiles) {
      if (file.relativePath.startsWith("/") || file.relativePath.split("/").includes("..")) {
        throw new Error("Bridge runtime contains an unsafe relative path.");
      }
      const destination = join2(runtimeDirectory, file.relativePath);
      await options.fs.mkdir(dirname(destination));
      await options.fs.writeFile(destination, file.contents);
    }
  }
  await options.fs.mkdir(hostDirectory);
  await options.fs.writeFile(launcherPath, buildLauncher(options.platform, options.nodePath, installedCliPath));
  await options.fs.writeFile(mcpLauncherPath, buildLauncher(options.platform, options.nodePath, installedCliPath, "mcp"));
  if (options.platform !== "win32") {
    await options.fs.chmod?.(launcherPath, 448);
    await options.fs.chmod?.(mcpLauncherPath, 448);
  }
  await options.fs.writeFile(manifestPath, JSON.stringify(buildNativeHostManifest(launcherPath, options.extensionId), null, 2));
  return {
    manifestPath,
    mcpConfig: JSON.stringify({ mcp_servers: { "ai-page-chat-browser": { command: mcpLauncherPath, args: [] } } }, null, 2)
  };
}

// src/cli.ts
var mode = process.argv[2];
switch (mode) {
  case "native-host":
    void runBridgeNativeHost().catch((error) => {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
    break;
  case "install": {
    const extensionId = option("--extension-id") ?? process.env.AI_PAGE_CHAT_EXTENSION_ID;
    if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
      logBridge("Install requires --extension-id <32-character Chrome extension id>.");
      process.exitCode = 1;
      break;
    }
    try {
      const result = await installNativeHost({
        fs: {
          mkdir: async (path) => {
            await mkdir(path, { recursive: true, mode: 448 });
          },
          writeFile: (path, contents) => writeFile(path, contents, { mode: 384 }),
          readFile: async (path) => {
            try {
              return await readFile(path, "utf8");
            } catch (error) {
              if (error.code === "ENOENT") return void 0;
              throw error;
            }
          },
          chmod: (path, fileMode) => chmod(path, fileMode)
        },
        root: applicationSupportRoot(),
        nodePath: process.execPath,
        cliPath: fileURLToPath(import.meta.url),
        runtimeFiles: await bridgeRuntimeFiles(),
        runtimeCliRelativePath: "cli.js",
        extensionId,
        platform: process.platform
      });
      process.stdout.write(`${JSON.stringify({ installed: true, manifestPath: result.manifestPath, mcpConfig: JSON.parse(result.mcpConfig) }, null, 2)}
`);
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    break;
  }
  case "uninstall":
    logBridge("Uninstall is manual: remove only the manifest and launchers printed by install.");
    break;
  case "mcp": {
    const [{ BridgeRegistry: BridgeRegistry2 }, { bridgePaths: bridgePaths2 }, { IpcClient }, { runBrowserMcp }] = await Promise.all([
      import("./registry-ARDH6KPO.js"),
      import("./paths-YZRQ47EM.js"),
      import("./client-AKY3LSGH.js"),
      import("./server-IWHXR32F.js")
    ]);
    try {
      const instance = await new BridgeRegistry2(bridgePaths2()).select(option("--instance") ?? process.env.AI_PAGE_CHAT_INSTANCE);
      const client = new IpcClient({ socketPath: instance.socketPath, token: instance.token, protocolVersion: 1 });
      await runBrowserMcp({ request: (envelope) => client.request(envelope) });
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    break;
  }
  default:
    logBridge("Usage: ai-page-chat-browser <install|uninstall|native-host|mcp>");
    process.exitCode = 1;
}
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : void 0;
}
function applicationSupportRoot() {
  if (process.platform === "darwin") return `${homedir()}/Library/Application Support`;
  if (process.platform === "win32") return process.env.LOCALAPPDATA ?? homedir();
  return process.env.XDG_CONFIG_HOME ?? `${homedir()}/.config`;
}
async function bridgeRuntimeFiles() {
  const directory = dirname2(fileURLToPath(import.meta.url));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));
  if (!files.some((entry) => entry.name === "cli.js")) throw new Error("Compiled bridge CLI bundle is incomplete. Run the bridge build first.");
  return Promise.all(files.map(async (entry) => ({
    relativePath: entry.name,
    contents: await readFile(join3(directory, entry.name), "utf8")
  })));
}
