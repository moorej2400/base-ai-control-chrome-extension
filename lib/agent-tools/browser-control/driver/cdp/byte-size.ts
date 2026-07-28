/**
 * Byte-size helpers that run in the MV3 service worker as well as Node tests.
 *
 * `Buffer` is available to the native host but is not injected into extension
 * workers, so the controller must use only Web Platform primitives here.
 */
const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function base64DecodedByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}
