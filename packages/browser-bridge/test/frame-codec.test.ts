import { describe, expect, it } from 'vitest';
import { EXTENSION_MESSAGE_LIMIT, FrameCodecError, NativeFrameDecoder, PRIVATE_IPC_MESSAGE_LIMIT, encodeNativeFrame } from '../src/native/frame-codec.js';

describe('native message frame codec', () => {
  it('handles fragmented reads, concatenated frames, and multibyte UTF-8 lengths', () => {
    const first = encodeNativeFrame({ message: 'é' });
    const second = encodeNativeFrame({ count: 2 });
    const decoder = new NativeFrameDecoder();
    expect(decoder.push(first.subarray(0, 3))).toEqual([]);
    expect(decoder.push(Buffer.concat([first.subarray(3), second]))).toEqual([{ message: 'é' }, { count: 2 }]);
  });

  it('rejects zero, oversized, and malformed frames', () => {
    expect(() => new NativeFrameDecoder().push(Buffer.from([0, 0, 0, 0]))).toThrow(FrameCodecError);
    const oversized = Buffer.alloc(4);
    oversized.writeUInt32LE(PRIVATE_IPC_MESSAGE_LIMIT + 1);
    expect(() => new NativeFrameDecoder().push(oversized)).toThrow(/too large/i);
    const malformed = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.from('{')]);
    expect(() => new NativeFrameDecoder().push(malformed)).toThrow(/Malformed JSON/);
  });

  it('keeps Chrome-bound writes at or below 256 KiB independently of IPC limits', () => {
    const atLimit = { text: 'a'.repeat(EXTENSION_MESSAGE_LIMIT - 20) };
    expect(() => encodeNativeFrame(atLimit, EXTENSION_MESSAGE_LIMIT)).not.toThrow();
    expect(() => encodeNativeFrame({ text: 'a'.repeat(EXTENSION_MESSAGE_LIMIT + 1) }, EXTENSION_MESSAGE_LIMIT)).toThrow(/too large/i);
  });
});
