/** Native-host stdout is protocol-only; diagnostics always use stderr. */
export function logBridge(message: string): void {
  process.stderr.write(`[ai-page-chat-browser] ${message}\n`);
}
