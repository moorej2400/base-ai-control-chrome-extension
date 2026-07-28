import { base64DecodedByteLength, utf8ByteLength } from './byte-size';

export const PAYLOAD_LIMITS = {
  snapshotBytes: 256 * 1024,
  rawScreenshotBytes: 5 * 1024 * 1024,
  base64ScreenshotBytes: 7 * 1024 * 1024,
  maxCssDimension: 4096,
  privateIpcBytes: 8 * 1024 * 1024,
} as const;

export class ScreenshotPayloadError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
}

export interface ScreenshotTransport { send(method: string, params?: object): Promise<{ data: string }> }

export class CdpScreenshots {
  constructor(private readonly transport: ScreenshotTransport) {}

  async capture(): Promise<string> {
    let result = await this.transport.send('Page.captureScreenshot', { format: 'jpeg', quality: 60, captureBeyondViewport: false });
    if (!this.withinLimits(result.data)) {
      result = await this.transport.send('Page.captureScreenshot', { format: 'jpeg', quality: 60, captureBeyondViewport: false, scale: 0.5 });
      if (!this.withinLimits(result.data)) throw new ScreenshotPayloadError('Screenshot exceeds the browser-control payload cap after downscaling.');
    }
    return `data:image/jpeg;base64,${result.data}`;
  }

  private withinLimits(data: string): boolean {
    return base64DecodedByteLength(data) <= PAYLOAD_LIMITS.rawScreenshotBytes && utf8ByteLength(data) <= PAYLOAD_LIMITS.base64ScreenshotBytes;
  }
}

export function enforceSnapshotLimit(snapshot: string): string | undefined {
  return utf8ByteLength(snapshot) <= PAYLOAD_LIMITS.snapshotBytes ? snapshot : undefined;
}
