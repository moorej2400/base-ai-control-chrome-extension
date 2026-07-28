import type { BrowserErrorCode } from '@ai-page-chat/browser-control-protocol';

export class CdpError extends Error {
  constructor(
    readonly code: Extract<BrowserErrorCode, 'DEBUGGER_ATTACH_FAILED' | 'DEBUGGER_DETACHED' | 'COMMAND_TIMEOUT' | 'DEBUGGER_PERMISSION_REQUIRED'>,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function normalizeDebuggerError(error: unknown, operation: 'attach' | 'detach' | 'command'): CdpError {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  if (operation === 'attach') {
    const suffix = lower.includes('another debugger')
      ? ' Another debugger is already attached; close it before retrying.'
      : ` Chrome reported: ${detail}`;
    return new CdpError('DEBUGGER_ATTACH_FAILED', `Could not attach the extension debugger.${suffix}`, false);
  }
  if (lower.includes('permission')) {
    return new CdpError('DEBUGGER_PERMISSION_REQUIRED', 'The extension debugger permission is unavailable.', false);
  }
  if (operation === 'command' && !lower.includes('debugger') && !lower.includes('target closed')) {
    // CDP reports ordinary protocol failures (for example a stale backend id)
    // through the same rejected promise as a detach. Keep that detail so the
    // resolver can invalidate or retry the reference instead of lying about a
    // lost Chrome connection.
    return new CdpError('DEBUGGER_DETACHED', `CDP command failed: ${detail}`, false);
  }
  return new CdpError('DEBUGGER_DETACHED', `The Chrome debugger connection was lost while running ${operation}.`, true);
}
