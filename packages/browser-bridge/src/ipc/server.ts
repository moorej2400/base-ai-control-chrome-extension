import { createServer, type Server, type Socket } from 'node:net';
import { NativeFrameDecoder, encodeNativeFrame, PRIVATE_IPC_MESSAGE_LIMIT } from '../native/frame-codec.js';
import { verifyHandshake } from './handshake.js';

export interface IpcServerOptions {
  socketPath: string;
  token: string;
  protocolVersion: number;
  handle(payload: unknown): Promise<unknown>;
}

/** User-local AF_UNIX/named-pipe request broker; it never opens a TCP port. */
export class IpcServer {
  private server?: Server;
  constructor(private readonly options: IpcServerOptions) {}

  listen(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.server = createServer((socket) => this.handleSocket(socket));
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.socketPath, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    if (!this.server) return Promise.resolve();
    const server = this.server;
    this.server = undefined;
    return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  private handleSocket(socket: Socket): void {
    const decoder = new NativeFrameDecoder(PRIVATE_IPC_MESSAGE_LIMIT);
    let authorized = false;
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const message of decoder.push(chunk)) {
          if (!authorized) {
            const verified = verifyHandshake(message, this.options.token, this.options.protocolVersion);
            socket.write(encodeNativeFrame(verified, PRIVATE_IPC_MESSAGE_LIMIT));
            if (!verified.ok) { socket.end(); return; }
            authorized = true;
            continue;
          }
          const request = message as { type?: string; id?: string; payload?: unknown };
          if (request.type !== 'request' || typeof request.id !== 'string') { socket.end(); return; }
          void this.options.handle(request.payload).then((result) => {
            socket.write(encodeNativeFrame({ type: 'response', id: request.id, ok: true, result }, PRIVATE_IPC_MESSAGE_LIMIT));
          }).catch((error) => {
            socket.write(encodeNativeFrame({ type: 'response', id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }, PRIVATE_IPC_MESSAGE_LIMIT));
          });
        }
      } catch { socket.end(); }
    });
  }
}
