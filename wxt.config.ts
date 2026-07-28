import { defineConfig } from 'wxt';

const devServerPort = Number(process.env.AI_PAGE_CHAT_DEV_PORT ?? 3197);

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Pin the dev server to a dedicated port. WXT otherwise picks the first open
  // port in 3000–3010, which can collide with other local dev servers (e.g. a
  // sibling CRA app) that also default to 3000 — when that app wins the race,
  // the side panel loads its code from the wrong server and renders blank.
  // 3197 sits outside the 3000–3010 scan range so the two never fight. The
  // hidden login autostart task (scripts/start-dev-server-hidden.vbs) inherits
  // this. An isolated worktree can set AI_PAGE_CHAT_DEV_PORT to avoid the
  // user's regular watcher without changing its normal port.
  dev: {
    server: {
      port: devServerPort,
      strictPort: true,
    },
  },
  manifest: {
    name: 'AI Page Chat',
    description:
      'AI chat side panel that can read and discuss the current page',
    // Pins a stable extension ID (nipfdolfnlajephejcgeiibaonaicmjl) so
    // chrome.storage (Copilot auth, sessions) survives reloads, version
    // bumps, and switching between dev and production builds.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjs4UZC96hHYV41UghwOQYZfBtRvfViTywd8zCf2WUZNjJ2YYEAikKPZQ9wd4nsA6PNp/kWTAVM/cCMfbO/QF78KEuMtxIyxF+ClGnkSnD7bUVnzgOavzirlctGSfwX1+UJuaFL4KQkqLz7gKE39dWfjJUMyv+yJIOAAktBO8yDQjTlvbcBj+YO14tatmWiyM0Oc8RdA5OIpC1qVQkU/6R1z47uetvl+CrmCMyScpJeUKXvqpMFygfJtKNYmT/1ZQqDhk5UsF1dXDMKqCaeQfiFHV6MzEorjUbzWmAH0ceB8/AqXcYGSBI99LGrDxTiGm6Uy5V0loi0gTTFIy5xo3BQIDAQAB',
    // Browser control (lib/agent-tools/browser-control) reuses these: `tabs`
    // (query/update/goBack/goForward), `scripting` (executeScript for snapshot/
    // actions), and `activeTab` + optional `<all_urls>` access (host access +
    // captureVisibleTab). The cursor overlay is injected only into controlled
    // tabs, so it does not silently promote optional access to required.
    permissions: [
      'sidePanel',
      'storage',
      'scripting',
      'activeTab',
      'tabs',
      // Chrome only grants deterministic CDP access through this permission.
      'debugger',
      // The external MCP bridge connects only after the user enables it in Settings.
      'nativeMessaging',
    ],
    // Keyboard shortcut to open the panel. Users rebind it at
    // chrome://extensions/shortcuts (Chrome owns that UI); the extension can only
    // suggest a default and read the current binding via chrome.commands.
    commands: {
      'open-panel': {
        suggested_key: { default: 'Ctrl+J', mac: 'Command+J' },
        description: 'Open AI Page Chat',
      },
    },
    host_permissions: [
      'https://github.com/*',
      'https://api.github.com/*',
      'https://*.githubcopilot.com/*',
    ],
    optional_host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Open AI Page Chat',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
    // Flattened DebuggerSession routing for OOPIF targets is available in 125+.
    minimum_chrome_version: '125',
  },
});
