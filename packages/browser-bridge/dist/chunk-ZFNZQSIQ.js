// src/native/frame-codec.ts
var EXTENSION_MESSAGE_LIMIT = 256 * 1024;
var PRIVATE_IPC_MESSAGE_LIMIT = 8 * 1024 * 1024;
var FrameCodecError = class extends Error {
};
function encodeNativeFrame(value, limit = PRIVATE_IPC_MESSAGE_LIMIT) {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  if (json.byteLength === 0) throw new FrameCodecError("Native messages cannot be empty.");
  if (json.byteLength > limit) throw new FrameCodecError(`Native message is too large (${json.byteLength} bytes).`);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.byteLength, 0);
  return Buffer.concat([header, json]);
}
var NativeFrameDecoder = class {
  constructor(limit = PRIVATE_IPC_MESSAGE_LIMIT) {
    this.limit = limit;
  }
  limit;
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0) throw new FrameCodecError("Native frame length cannot be zero.");
      if (length > this.limit) throw new FrameCodecError(`Native frame is too large (${length} bytes).`);
      if (this.buffer.byteLength < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        messages.push(JSON.parse(body.toString("utf8")));
      } catch {
        throw new FrameCodecError("Malformed JSON in native frame.");
      }
    }
    return messages;
  }
};

// src/ipc/handshake.ts
function createHandshake(token, protocolVersion) {
  return { type: "hello", token, protocolVersion };
}
function verifyHandshake(value, token, protocolVersion) {
  if (!value || typeof value !== "object" || value.type !== "hello" || value.token !== token) return { ok: false, error: "UNAUTHORIZED" };
  return value.protocolVersion === protocolVersion ? { ok: true } : { ok: false, error: "PROTOCOL_MISMATCH" };
}

export {
  EXTENSION_MESSAGE_LIMIT,
  PRIVATE_IPC_MESSAGE_LIMIT,
  encodeNativeFrame,
  NativeFrameDecoder,
  createHandshake,
  verifyHandshake
};
