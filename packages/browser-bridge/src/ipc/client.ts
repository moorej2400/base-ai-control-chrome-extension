import { connect, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { NativeFrameDecoder, encodeNativeFrame, PRIVATE_IPC_MESSAGE_LIMIT } from '../native/frame-codec.js';
import { createHandshake } from './handshake.js';

export interface IpcClientOptions { socketPath: string; token: string; protocolVersion: number }

export class IpcClient {
  private socket?: Socket;
  private readonly decoder = new NativeFrameDecoder(PRIVATE_IPC_MESSAGE_LIMIT);
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  private hello?: Promise<void>;

  constructor(private readonly options: IpcClientOptions) {}

  async request(payload: unknown): Promise<unknown> {
    await this.ensureConnected();
    const id = randomUUID();
    const response = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket!.write(encodeNativeFrame({ type: 'request', id, payload }, PRIVATE_IPC_MESSAGE_LIMIT));
    return response;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    this.hello = undefined;
    if (!socket) return;
    await new Promise<void>((resolve) => { socket.once('close', () => resolve()); socket.end(); });
  }

  private async ensureConnected(): Promise<void> {
    if (this.hello) return this.hello;
    this.hello = new Promise<void>((resolve, reject) => {
      const socket = connect(this.options.socketPath);
      this.socket = socket;
      socket.once('error', reject);
      socket.once('connect', () => socket.write(encodeNativeFrame(createHandshake(this.options.token, this.options.protocolVersion), PRIVATE_IPC_MESSAGE_LIMIT)));
      socket.on('data', (chunk: Buffer) => {
        try {
          for (const message of this.decoder.push(chunk)) this.handleMessage(message, resolve, reject);
        } catch (error) { reject(error); }
      });
      socket.on('close', () => {
        for (const pending of this.pending.values()) pending.reject(new Error('IPC connection closed.'));
        this.pending.clear();
      });
    });
    return this.hello;
  }

  private handleMessage(message: unknown, resolveHello: () => void, rejectHello: (error: Error) => void): void {
    const value = message as { ok?: boolean; error?: string; type?: string; id?: string; result?: unknown };
    if (value.type !== 'response') {
      if (value.ok) resolveHello();
      else rejectHello(new Error(value.error ?? 'IPC handshake failed.'));
      return;
    }
    const pending = value.id ? this.pending.get(value.id) : undefined;
    if (!pending) return;
    this.pending.delete(value.id!);
    if (value.ok) pending.resolve(value.result);
    else pending.reject(new Error(value.error ?? 'IPC request failed.'));
  }
}
