import {
  NativeFrameDecoder,
  PRIVATE_IPC_MESSAGE_LIMIT,
  createHandshake,
  encodeNativeFrame
} from "./chunk-ZFNZQSIQ.js";
import "./chunk-U67V476Y.js";

// src/ipc/client.ts
import { connect } from "net";
import { randomUUID } from "crypto";
var IpcClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  socket;
  decoder = new NativeFrameDecoder(PRIVATE_IPC_MESSAGE_LIMIT);
  pending = /* @__PURE__ */ new Map();
  hello;
  async request(payload) {
    await this.ensureConnected();
    const id = randomUUID();
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.write(encodeNativeFrame({ type: "request", id, payload }, PRIVATE_IPC_MESSAGE_LIMIT));
    return response;
  }
  async close() {
    const socket = this.socket;
    this.socket = void 0;
    this.hello = void 0;
    if (!socket) return;
    await new Promise((resolve) => {
      socket.once("close", () => resolve());
      socket.end();
    });
  }
  async ensureConnected() {
    if (this.hello) return this.hello;
    this.hello = new Promise((resolve, reject) => {
      const socket = connect(this.options.socketPath);
      this.socket = socket;
      socket.once("error", reject);
      socket.once("connect", () => socket.write(encodeNativeFrame(createHandshake(this.options.token, this.options.protocolVersion), PRIVATE_IPC_MESSAGE_LIMIT)));
      socket.on("data", (chunk) => {
        try {
          for (const message of this.decoder.push(chunk)) this.handleMessage(message, resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
      socket.on("close", () => {
        for (const pending of this.pending.values()) pending.reject(new Error("IPC connection closed."));
        this.pending.clear();
      });
    });
    return this.hello;
  }
  handleMessage(message, resolveHello, rejectHello) {
    const value = message;
    if (value.type !== "response") {
      if (value.ok) resolveHello();
      else rejectHello(new Error(value.error ?? "IPC handshake failed."));
      return;
    }
    const pending = value.id ? this.pending.get(value.id) : void 0;
    if (!pending) return;
    this.pending.delete(value.id);
    if (value.ok) pending.resolve(value.result);
    else pending.reject(new Error(value.error ?? "IPC request failed."));
  }
};
export {
  IpcClient
};
