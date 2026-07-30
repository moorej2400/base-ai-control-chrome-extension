import type { BrowserControlRouter } from './router';
import type { BrowserConnectionContext, BrowserControlCoordinator } from './coordinator';
import { BROWSER_CONTROL_RUNTIME_PORT } from '../client/runtime-client';

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

export function registerRuntimePortServer(
  router: Pick<BrowserControlRouter, 'handle'>,
  coordinator: Pick<BrowserControlCoordinator, 'disconnect'>,
): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === BROWSER_CONTROL_RUNTIME_PORT) bindRuntimePort(port, router, coordinator);
  });
}
