#!/usr/bin/env node
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logBridge } from './logging.js';
import { runBridgeNativeHost } from './native/native-host.js';
import { installNativeHost } from './native/installer.js';

const mode = process.argv[2];

switch (mode) {
  case 'native-host':
    void runBridgeNativeHost().catch((error) => {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
    break;
  case 'install': {
    const extensionId = option('--extension-id') ?? process.env.AI_PAGE_CHAT_EXTENSION_ID;
    if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
      logBridge('Install requires --extension-id <32-character Chrome extension id>.');
      process.exitCode = 1;
      break;
    }
    try {
      const result = await installNativeHost({
        fs: {
          mkdir: async (path) => { await mkdir(path, { recursive: true, mode: 0o700 }); },
          writeFile: (path, contents) => writeFile(path, contents, { mode: 0o600 }),
          readFile: async (path) => {
            try { return await readFile(path, 'utf8'); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
          },
          chmod: (path, fileMode) => chmod(path, fileMode),
        },
        root: applicationSupportRoot(),
        nodePath: process.execPath,
        cliPath: fileURLToPath(import.meta.url),
        runtimeFiles: await bridgeRuntimeFiles(),
        runtimeCliRelativePath: 'cli.js',
        extensionId,
        platform: process.platform,
      });
      process.stdout.write(`${JSON.stringify({ installed: true, manifestPath: result.manifestPath, mcpConfig: JSON.parse(result.mcpConfig) }, null, 2)}\n`);
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    break;
  }
  case 'uninstall':
    // We intentionally do not remove native-host files automatically. Keeping
    // uninstall manual prevents a CLI typo from deleting a user's MCP setup.
    logBridge('Uninstall is manual: remove only the manifest and launchers printed by install.');
    break;
  case 'mcp': {
    const [{ BridgeRegistry }, { bridgePaths }, { IpcClient }, { runBrowserMcp }] = await Promise.all([
      import('./ipc/registry.js'), import('./ipc/paths.js'), import('./ipc/client.js'), import('./mcp/server.js'),
    ]);
    try {
      const instance = await new BridgeRegistry(bridgePaths()).select(option('--instance') ?? process.env.AI_PAGE_CHAT_INSTANCE);
      const client = new IpcClient({ socketPath: instance.socketPath, token: instance.token, protocolVersion: 1 });
      try {
        await runBrowserMcp({ request: (envelope) => client.request(envelope) });
      } finally {
        await client.close();
      }
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
    break;
  }
  default:
    logBridge('Usage: ai-page-chat-browser <install|uninstall|native-host|mcp>');
    process.exitCode = 1;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function applicationSupportRoot(): string {
  if (process.platform === 'darwin') return `${homedir()}/Library/Application Support`;
  if (process.platform === 'win32') return process.env.LOCALAPPDATA ?? homedir();
  return process.env.XDG_CONFIG_HOME ?? `${homedir()}/.config`;
}

async function bridgeRuntimeFiles(): Promise<Array<{ relativePath: string; contents: string }>> {
  const directory = dirname(fileURLToPath(import.meta.url));
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.js'));
  if (!files.some((entry) => entry.name === 'cli.js')) throw new Error('Compiled bridge CLI bundle is incomplete. Run the bridge build first.');
  return Promise.all(files.map(async (entry) => ({
    relativePath: entry.name,
    contents: await readFile(join(directory, entry.name), 'utf8'),
  })));
}
