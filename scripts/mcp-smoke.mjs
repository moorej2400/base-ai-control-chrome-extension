// Kept as a stable top-level entry point; package-local resolution loads the
// MCP SDK from browser-bridge's own dependency boundary.
await import('../packages/browser-bridge/scripts/mcp-smoke.mjs');
