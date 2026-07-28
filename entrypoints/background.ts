import { defineBackground } from '#imports';
import { BrowserControlCoordinator } from '../lib/agent-tools/browser-control/background/coordinator';
import { registerRuntimePortServer } from '../lib/agent-tools/browser-control/background/connection';
import { BrowserControlRouter } from '../lib/agent-tools/browser-control/background/router';
import { ChromeSessionStorage, SessionStore } from '../lib/agent-tools/browser-control/background/session-store';
import { TabLeaseStore } from '../lib/agent-tools/browser-control/background/tab-leases';
import { TabQueue } from '../lib/agent-tools/browser-control/background/tab-queue';
import { CursorState } from '../lib/agent-tools/browser-control/background/cursor-state';
import { CursorSender } from '../lib/agent-tools/browser-control/background/cursor-sender';
import { ApprovalStore } from '../lib/agent-tools/browser-control/background/approval-store';
import { NativeConnectionManager } from '../lib/agent-tools/browser-control/background/native-connection';
import {
  BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY,
  BROWSER_CONTROL_EXTERNAL_ENABLED_KEY,
  getExternalBrowserControlEnabled,
} from '../lib/agent-tools/browser-control/settings';
import { CursorArrivalSchema } from '@ai-page-chat/browser-control-protocol';
import { CdpDriverFactory } from '../lib/agent-tools/browser-control/driver/cdp/cdp-driver';
import { createChromeDebuggerApi, DebuggerTransport } from '../lib/agent-tools/browser-control/driver/cdp/debugger-transport';
import { ResilientDriverFactory } from '../lib/agent-tools/browser-control/driver/resilient-driver';
import { createExtensionDriver } from '../lib/agent-tools/browser-control/driver/extension/extension-driver';

const DEBUGGER_DETACH_DIAGNOSTIC_KEY = 'dev.browserControl.lastDebuggerDetach';

function createCoordinator(
  cursor: CursorState,
  externalStatus: () => { enabled: boolean; state: string; error?: string },
): BrowserControlCoordinator {
  const transport = new DebuggerTransport(createChromeDebuggerApi());
  if (import.meta.env.DEV) {
    transport.onDetach(({ tabId, reason, sessionId, targetId }) => {
      void chrome.storage.session.set({
        [DEBUGGER_DETACH_DIAGNOSTIC_KEY]: {
          tabId,
          reason,
          sessionId,
          targetId,
          at: Date.now(),
        },
      });
    });
  }
  return new BrowserControlCoordinator({
    drivers: new ResilientDriverFactory(
      new CdpDriverFactory({
        transport,
        cursor,
      }),
      (browserSessionId, getTurnId) =>
        createExtensionDriver({
          browserSessionId,
          getTurnId,
          cursor,
        }),
    ),
    sessions: new SessionStore({ storage: new ChromeSessionStorage() }),
    leases: new TabLeaseStore(),
    queue: new TabQueue(),
    approvals: new ApprovalStore(),
    onApproval: (approval) => {
      void chrome.runtime.sendMessage({ type: 'browser-control.approval', approval }).catch(() => {});
    },
    externalControlStatus: externalStatus,
    async canAccessTab(tab) {
      try {
        const url = new URL(tab.url);
        return chrome.permissions.contains({ origins: [`${url.protocol}//${url.host}/*`] });
      } catch {
        return false;
      }
    },
    advancedSettingEnabled: () => false,
  });
}

function createCursorState(): CursorState {
  const sender = new CursorSender({
    sendMessage: (tabId, move) => chrome.tabs.sendMessage(tabId, move),
    executeScript: (injection) => chrome.scripting.executeScript(injection),
  });
  return new CursorState({
    send: (tabId, move) => sender.send(tabId, move),
    async isVisible(tabId) {
      return Boolean((await chrome.tabs.get(tabId)).active);
    },
  });
}

export default defineBackground(() => {
  const cursor = createCursorState();
  let externalEnabled = false;
  let native: NativeConnectionManager | undefined;
  const coordinator = createCoordinator(cursor, () => {
    const status = native?.status() ?? { state: 'disabled' as const };
    return { enabled: externalEnabled, ...status };
  });
  const router = new BrowserControlRouter(coordinator);
  native = new NativeConnectionManager({
    enabled: () => externalEnabled,
    connect: () => chrome.runtime.connectNative('ai_page_chat_browser'),
    router: {
      handle: (connection, message) => router.handle(connection, message),
      disconnect: (connection) => coordinator.disconnect(connection),
    },
  });
  registerRuntimePortServer(router, coordinator);
  void getExternalBrowserControlEnabled().then((enabled) => {
    externalEnabled = enabled;
    native?.refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes[BROWSER_CONTROL_EXTERNAL_ENABLED_KEY] && !changes[BROWSER_CONTROL_EXTERNAL_CONFIGURED_KEY])) return;
    void getExternalBrowserControlEnabled().then((enabled) => {
      externalEnabled = enabled;
      native?.refresh();
    });
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (
      message?.type === 'browser-control.external-control.changed'
      && typeof message.enabled === 'boolean'
    ) {
      // Settings sends this after persistence so a cold MV3 worker starts the
      // native bridge even when it did not observe the original storage event.
      externalEnabled = message.enabled;
      native?.refresh();
      return;
    }
    const arrival = CursorArrivalSchema.safeParse(message);
    if (arrival.success) cursor.arrived(arrival.data);
  });
  // Open the side panel when the toolbar icon is clicked.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set side panel behavior:', err));

  // Keyboard shortcut (default Ctrl/Cmd+J) opens the panel. onCommand is a user
  // gesture, so sidePanel.open is allowed here.
  chrome.commands?.onCommand.addListener((command, tab) => {
    if (command !== 'open-panel') return;
    const target =
      tab?.windowId != null ? { windowId: tab.windowId } : undefined;
    (target ? chrome.sidePanel.open(target) : Promise.resolve()).catch((err) =>
      console.error('Failed to open side panel from shortcut:', err),
    );
  });
});
