export const EXTENSION_MESSAGE_LIMIT = 256 * 1024;
export const PRIVATE_IPC_MESSAGE_LIMIT = 8 * 1024 * 1024;

export class FrameCodecError extends Error {}

export function encodeNativeFrame(value: unknown, limit = PRIVATE_IPC_MESSAGE_LIMIT): Buffer {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  if (json.byteLength === 0) throw new FrameCodecError('Native messages cannot be empty.');
  if (json.byteLength > limit) throw new FrameCodecError(`Native message is too large (${json.byteLength} bytes).`);
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.byteLength, 0);
  return Buffer.concat([header, json]);
}

/** Incremental unsigned-32-bit native messaging decoder. */
export class NativeFrameDecoder {
  private buffer = Buffer.alloc(0);
  constructor(private readonly limit = PRIVATE_IPC_MESSAGE_LIMIT) {}

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.byteLength >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0) throw new FrameCodecError('Native frame length cannot be zero.');
      if (length > this.limit) throw new FrameCodecError(`Native frame is too large (${length} bytes).`);
      if (this.buffer.byteLength < 4 + length) break;
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        messages.push(JSON.parse(body.toString('utf8')));
      } catch {
        throw new FrameCodecError('Malformed JSON in native frame.');
      }
    }
    return messages;
  }
}
