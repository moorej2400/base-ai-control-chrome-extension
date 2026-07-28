import { join, dirname } from 'node:path';

const HOST_NAME = 'ai_page_chat_browser';

export interface InstallerFs {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, contents: string): Promise<void>;
  readFile(path: string): Promise<string | undefined>;
  chmod?(path: string, mode: number): Promise<void>;
}

export interface InstallOptions {
  fs: InstallerFs;
  root: string;
  nodePath: string;
  cliPath: string;
  extensionId: string;
  platform: NodeJS.Platform;
  /** Compiled bridge files copied to the user-scoped install, never referenced in-place. */
  runtimeFiles?: Array<{ relativePath: string; contents: string }>;
  runtimeCliRelativePath?: string;
}

export function buildNativeHostManifest(launcherPath: string, extensionId: string) {
  return {
    name: HOST_NAME,
    description: 'AI Page Chat local browser-control bridge',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

export function buildLauncher(platform: NodeJS.Platform, nodePath: string, cliPath: string, mode: 'native-host' | 'mcp' = 'native-host'): string {
  return platform === 'win32'
    ? `@echo off\r\n"${nodePath}" "${cliPath}" ${mode}\r\n`
    : `#!/bin/sh\nexec "${nodePath}" "${cliPath}" ${mode}\n`;
}

/** The only installer mutation point; its adapter keeps real installs opt-in. */
export async function installNativeHost(options: InstallOptions): Promise<{ manifestPath: string; mcpConfig: string }> {
  const hostDirectory = options.platform === 'darwin'
    ? join(options.root, 'Google', 'Chrome', 'NativeMessagingHosts')
    : options.platform === 'win32'
      ? join(options.root, 'Google', 'Chrome', 'NativeMessagingHosts')
      : join(options.root, 'google-chrome', 'NativeMessagingHosts');
  const productDirectory = join(options.root, 'AI Page Chat', 'browser-bridge');
  const runtimeDirectory = join(productDirectory, 'runtime');
  const installedCliPath = options.runtimeFiles?.length
    ? join(runtimeDirectory, options.runtimeCliRelativePath ?? 'cli.js')
    : options.cliPath;
  const launcherPath = join(productDirectory, options.platform === 'win32' ? 'ai-page-chat-browser.cmd' : 'ai-page-chat-browser');
  const mcpLauncherPath = join(productDirectory, options.platform === 'win32' ? 'ai-page-chat-browser-mcp.cmd' : 'ai-page-chat-browser-mcp');
  const manifestPath = join(hostDirectory, `${HOST_NAME}.json`);
  await options.fs.mkdir(options.root);
  await options.fs.mkdir(productDirectory);
  if (options.runtimeFiles?.length) {
    for (const file of options.runtimeFiles) {
      if (file.relativePath.startsWith('/') || file.relativePath.split('/').includes('..')) {
        throw new Error('Bridge runtime contains an unsafe relative path.');
      }
      const destination = join(runtimeDirectory, file.relativePath);
      await options.fs.mkdir(dirname(destination));
      await options.fs.writeFile(destination, file.contents);
    }
  }
  await options.fs.mkdir(hostDirectory);
  await options.fs.writeFile(launcherPath, buildLauncher(options.platform, options.nodePath, installedCliPath));
  await options.fs.writeFile(mcpLauncherPath, buildLauncher(options.platform, options.nodePath, installedCliPath, 'mcp'));
  if (options.platform !== 'win32') {
    await options.fs.chmod?.(launcherPath, 0o700);
    await options.fs.chmod?.(mcpLauncherPath, 0o700);
  }
  await options.fs.writeFile(manifestPath, JSON.stringify(buildNativeHostManifest(launcherPath, options.extensionId), null, 2));
  return {
    manifestPath,
    mcpConfig: JSON.stringify({ mcp_servers: { 'ai-page-chat-browser': { command: mcpLauncherPath, args: [] } } }, null, 2),
  };
}
