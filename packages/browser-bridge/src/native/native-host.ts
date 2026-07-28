import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { EXTENSION_MESSAGE_LIMIT, NativeFrameDecoder, encodeNativeFrame } from './frame-codec.js';
import { logBridge } from '../logging.js';
import { IpcServer } from '../ipc/server.js';
import { bridgePaths, type BridgePaths } from '../ipc/paths.js';
import { BridgeRegistry } from '../ipc/registry.js';
import { NativeHostRelay } from './native-relay.js';

export interface NativeHostRouter { handle(message: unknown): Promise<unknown | undefined> }

export interface BridgeNativeHostInput {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface BridgeNativeHostOptions {
  input?: BridgeNativeHostInput;
  output?: { write(chunk: Buffer): unknown };
  paths?: BridgePaths;
  createInstanceId?: () => string;
  createToken?: () => string;
  pid?: number;
  platform?: NodeJS.Platform;
}

/** Runs Chrome native messaging with stdout reserved exclusively for frames. */
export function runNativeHost(router: NativeHostRouter): void {
  const decoder = new NativeFrameDecoder();
  stdin.on('data', (chunk: Buffer) => {
    try {
      for (const message of decoder.push(chunk)) {
        void router.handle(message).then((response) => {
          if (response !== undefined) stdout.write(encodeNativeFrame(response, EXTENSION_MESSAGE_LIMIT));
        }).catch((error) => logBridge(error instanceof Error ? error.message : String(error)));
      }
    } catch (error) {
      logBridge(error instanceof Error ? error.message : String(error));
    }
  });
}

/**
 * Production native-host mode. Chrome speaks only its framed stdio protocol;
 * MCP processes discover this per-user bridge through a private socket registry.
 */
export async function runBridgeNativeHost(options: BridgeNativeHostOptions = {}): Promise<void> {
  const input: BridgeNativeHostInput = options.input ?? stdin;
  const output = options.output ?? stdout;
  const decoder = new NativeFrameDecoder();
  const paths = options.paths ?? bridgePaths();
  const registry = new BridgeRegistry(paths);
  const relay = new NativeHostRelay((message) => output.write(encodeNativeFrame(message, EXTENSION_MESSAGE_LIMIT)));
  let server: IpcServer | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let instanceId: string | undefined;
  let cleaningUp: Promise<void> | undefined;

  const start = async () => {
    instanceId = options.createInstanceId?.() ?? randomUUID();
    const token = options.createToken?.() ?? randomBytes(32).toString('hex');
    const socketPath = (options.platform ?? process.platform) === 'win32'
      ? `\\\\.\\pipe\\ai-page-chat-browser-${instanceId}`
      : join(paths.socketDirectory, `${instanceId}.sock`);
    // AF_UNIX bind fails with ENOENT/EACCES when the private socket directory
    // has not been created; Chrome discards native-host stderr by default.
    await registry.prepare();
    server = new IpcServer({ socketPath, token, protocolVersion: 1, handle: (message) => relay.forward(message) });
    await server.listen();
    const instance = { id: instanceId, pid: options.pid ?? process.pid, socketPath, token, heartbeatAt: Date.now() };
    await registry.register(instance);
    heartbeat = setInterval(() => {
      void registry.register({ ...instance, heartbeatAt: Date.now() }).catch((error) => logBridge(error instanceof Error ? error.message : String(error)));
    }, 10_000);
    heartbeat.unref();
    // A Chrome Port object only proves that the executable launched. Confirm
    // registry/socket readiness before the extension reports MCP as connected.
    output.write(encodeNativeFrame({ type: 'ready', protocolVersion: 1 }, EXTENSION_MESSAGE_LIMIT));
    logBridge(`native bridge ready (${instanceId})`);
  };

  const cleanup = () => {
    if (cleaningUp) return cleaningUp;
    cleaningUp = (async () => {
      if (heartbeat) clearInterval(heartbeat);
      relay.disconnect();
      await server?.close().catch(() => {});
      if (instanceId) await registry.unregister(instanceId).catch(() => {});
    })();
    return cleaningUp;
  };

  // Chrome launching this allowlisted executable is the native connection
  // handshake. Register immediately so MCP discovery cannot depend on a first
  // application message surviving MV3/native-port startup.
  await start();

  input.on('data', (chunk: Buffer) => {
    try {
      for (const message of decoder.push(chunk)) {
        if (!isHello(message)) relay.receive(message);
      }
    } catch (error) { logBridge(error instanceof Error ? error.message : String(error)); }
  });
  input.on('end', () => {
    void cleanup();
  });

  if (input === stdin) {
    const terminate = () => { void cleanup().finally(() => process.exit(0)); };
    process.once('SIGINT', terminate);
    process.once('SIGTERM', terminate);
  }
}

function isHello(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'hello';
}
