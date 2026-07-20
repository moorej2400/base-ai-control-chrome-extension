/**
 * GitHub OAuth Device Flow using VS Code's client id — the same flow the
 * Copilot CLI/editor plugins use to authorize against a Copilot subscription.
 */

export const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Unix ms when the user code expires. */
  expiresAt: number;
  /** Minimum seconds between polls. */
  intervalSeconds: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeInfo> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'read:user' }),
  });
  if (!res.ok) {
    throw new Error(`GitHub device code request failed (${res.status})`);
  }
  const data = await res.json();
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri ?? 'https://github.com/login/device',
    expiresAt: Date.now() + (data.expires_in ?? 900) * 1000,
    intervalSeconds: data.interval ?? 5,
  };
}

/**
 * Polls GitHub until the user authorizes the device, then resolves with the
 * long-lived `gho_*` OAuth token.
 */
export async function pollForAccessToken(
  info: DeviceCodeInfo,
  signal?: AbortSignal,
): Promise<string> {
  let intervalMs = info.intervalSeconds * 1000;

  while (Date.now() < info.expiresAt) {
    await sleep(intervalMs, signal);

    const res = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: info.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`GitHub token poll failed (${res.status})`);
    }
    const data = await res.json();

    if (data.access_token) return data.access_token as string;

    switch (data.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        intervalMs += 5000;
        continue;
      case 'expired_token':
        throw new Error('The sign-in code expired. Please try again.');
      case 'access_denied':
        throw new Error('Sign-in was cancelled on GitHub.');
      default:
        throw new Error(
          `GitHub sign-in failed: ${data.error_description ?? data.error ?? 'unknown error'}`,
        );
    }
  }
  throw new Error('The sign-in code expired. Please try again.');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  return new DOMException('Sign-in aborted', 'AbortError');
}
