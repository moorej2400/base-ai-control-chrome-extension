import { describe, expect, it } from 'vitest';
import { buildNativeHostManifest, buildLauncher, installNativeHost, type InstallerFs } from '../src/native/installer.js';

function memoryFs(): InstallerFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return { files, mkdir: async () => {}, writeFile: async (path, data) => { files.set(path, data); }, readFile: async (path) => files.get(path) };
}

describe('native host installer', () => {
  it('creates a user-scoped manifest restricted to the stable extension origin', () => {
    expect(buildNativeHostManifest('/user/bin/bridge', 'nipfdolfnlajephejcgeiibaonaicmjl')).toEqual({
      name: 'ai_page_chat_browser',
      description: 'AI Page Chat local browser-control bridge',
      path: '/user/bin/bridge',
      type: 'stdio',
      allowed_origins: ['chrome-extension://nipfdolfnlajephejcgeiibaonaicmjl/'],
    });
  });

  it('writes only through the injected adapter and prints a Codex MCP config', async () => {
    const fs = memoryFs();
    const result = await installNativeHost({ fs, root: '/user/support', nodePath: '/usr/local/bin/node', cliPath: '/pkg/dist/cli.js', extensionId: 'nipfdolfnlajephejcgeiibaonaicmjl', platform: 'darwin' });
    expect(fs.files.size).toBe(3);
    expect(result.mcpConfig).toContain('ai-page-chat-browser');
    expect(result.manifestPath).toContain('NativeMessagingHosts');
  });

  it('builds a platform-appropriate launcher without shell interpolation', () => {
    expect(buildLauncher('darwin', '/usr/local/bin/node', '/pkg/cli.js')).toContain('exec "/usr/local/bin/node" "/pkg/cli.js" native-host');
    expect(buildLauncher('win32', 'C:\\node.exe', 'C:\\cli.js')).toContain('"C:\\node.exe" "C:\\cli.js" native-host');
  });

  it('copies the compiled bridge into the user-scoped runtime before creating launchers', async () => {
    const fs = memoryFs();
    await installNativeHost({
      fs, root: '/user/support', nodePath: '/usr/local/bin/node', cliPath: '/tmp/build/cli.js',
      extensionId: 'nipfdolfnlajephejcgeiibaonaicmjl', platform: 'darwin',
      runtimeFiles: [{ relativePath: 'cli.js', contents: 'compiled cli' }, { relativePath: 'chunk.js', contents: 'compiled chunk' }],
    });

    expect([...fs.files.entries()]).toEqual(expect.arrayContaining([
      [expect.stringContaining('/runtime/cli.js'), 'compiled cli'],
      [expect.stringContaining('/runtime/chunk.js'), 'compiled chunk'],
    ]));
    expect([...fs.files.values()].find((value) => value.startsWith('#!/bin/sh'))).toContain('/runtime/cli.js');
  });
});
