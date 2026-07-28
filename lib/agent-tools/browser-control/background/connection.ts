import type { BrowserControlRouter } from './router';
import type { BrowserConnectionContext, BrowserControlCoordinator } from './coordinator';
import { BROWSER_CONTROL_APPROVAL_UI_PORT, BROWSER_CONTROL_RUNTIME_PORT } from '../client/runtime-client';
export { BROWSER_CONTROL_APPROVAL_UI_PORT } from '../client/runtime-client';

export interface IncomingRuntimePort {
  name: string;
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Binds the side-panel-only runtime Port to the transport-neutral coordinator router. */
export function bindRuntimePort(
  port: IncomingRuntimePort,
  router: Pick<BrowserControlRouter, 'handle'>,
  coordinator: Pick<BrowserControlCoordinator, 'disconnect'>,
  createConnectionId: () => string = () => crypto.randomUUID(),
): void {
  if (port.name !== BROWSER_CONTROL_RUNTIME_PORT) return;
  const connection: BrowserConnectionContext = {
    id: createConnectionId(),
    origin: 'embedded',
    advancedEnabled: false,
  };
  port.onMessage.addListener((message) => {
    void router.handle(connection, message).then((response) => port.postMessage(response));
  });
  port.onDisconnect.addListener(() => {
    void coordinator.disconnect(connection);
  });
}

/** A distinct privileged port is the only extension-side approval authority. */
export function bindApprovalUiPort(
  port: IncomingRuntimePort,
  router: Pick<BrowserControlRouter, 'handle'>,
  coordinator: Pick<BrowserControlCoordinator, 'disconnect' | 'pendingApprovalNotifications'>,
  createConnectionId: () => string = () => crypto.randomUUID(),
): void {
  if (port.name !== BROWSER_CONTROL_APPROVAL_UI_PORT) return;
  const connection: BrowserConnectionContext = { id: createConnectionId(), origin: 'extension-ui', advancedEnabled: false };
  port.onMessage.addListener((message) => {
    if (isApprovalSubscription(message)) {
      port.postMessage({ type: 'browser-control.approvals', approvals: coordinator.pendingApprovalNotifications() });
      return;
    }
    void router.handle(connection, message).then((response) => port.postMessage(response));
  });
  port.onDisconnect.addListener(() => { void coordinator.disconnect(connection); });
}

function isApprovalSubscription(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'browser-control.approvals.subscribe';
}

export function registerRuntimePortServer(
  router: Pick<BrowserControlRouter, 'handle'>,
  coordinator: Pick<BrowserControlCoordinator, 'disconnect' | 'pendingApprovalNotifications'>,
): void {
  chrome.runtime.onConnect.addListener((port) => {
    // Chrome Event objects are native receivers. Route each port exactly once;
    // invoking both binders during service-worker startup can trip an illegal
    // native invocation in Chromium when the approval UI connects.
    if (port.name === BROWSER_CONTROL_RUNTIME_PORT) {
      bindRuntimePort(port, router, coordinator);
    } else if (port.name === BROWSER_CONTROL_APPROVAL_UI_PORT) {
      bindApprovalUiPort(port, router, coordinator);
    }
  });
}
