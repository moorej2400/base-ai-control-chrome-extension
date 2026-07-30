# browser-control

Tools that let the agent **control the browser** — tabs, navigation, reading
page structure, clicking, filling, screenshots — through the extension's
session-aware CDP driver. The built-in side-panel loop and optional local MCP
bridge enter the same coordinator. Self-contained and isolated: the rest of
the extension only ever imports from [`index.ts`](index.ts).

See [`docs/DUAL_CLIENT_BROWSER_CONTROL.md`](../../../docs/DUAL_CLIENT_BROWSER_CONTROL.md)
for the current dual-client architecture, and
[`test/browser-control/`](../../../test/browser-control/) for the live e2e suite
that validates these tools against the real extension.

## The contract (do not break these)

1. **Everything browser-control lives here.** No control logic anywhere else.
   The rest of the app touches this feature at four points only:
   - `lib/tools/registry.ts` registers `browserControlModule`.
   - `wxt.config.ts` holds manifest permissions.
   - `lib/chat/system-prompt.ts` has one guidance line.
   - `lib/chat/transport.ts` raises the step budget when the module is enabled.
2. **Tools never call `chrome.*`.** They call the [`BrowserDriver`](driver/types.ts)
   interface. The coordinator supplies a per-session CDP view, so the transport
   can evolve without changing the agent loop.
3. **Tools never throw.** Every result is structured or `{ error }` with
   recovery guidance, so the agent loop keeps running.

## Layout

```
index.ts        public surface (browserControlModule + module id)
module.ts       ToolModule adapter; assembles the tool groups over a driver
tools/          AI SDK tool definitions (schemas + descriptions), by group
driver/
  types.ts      BrowserDriver interface + result types  ← the swap seam
  errors.ts     failure → agent-actionable message mapping
  cdp/           production Chrome Debugger Protocol implementation
    cdp-driver.ts          session-scoped BrowserDriver implementation
    debugger-transport.ts  narrow chrome.debugger boundary
    snapshot-*.ts          DOM/AX snapshot → opaque reference tree
    input.ts               trusted CDP input at cursor-matched coordinates
  extension/     compatibility fallback for isolated callers/tests
background/      coordinator, session/turn records, leases, queue, native port
client/          side-panel runtime-port client and BrowserDriver adapter
overlay/         lazily injected cursor animation and arrival acknowledgements
```

## uid lifecycle (how interaction works)

1. `take_snapshot` requests a DOMSnapshot plus accessibility tree through the
   debugger, then returns opaque references bound to the session, tab, and
   document revision.
2. `click`/`fill`/etc. resolve those references only inside that same
   coordinator-owned session.
3. Each navigation or later snapshot invalidates older references. A stale or
   cross-session reference is rejected, forcing a fresh snapshot.

## Runtime safety

References are opaque and bound to one browser session, tab, and document
revision. CDP input uses the same resolved coordinate as the visible cursor.
When browser control is enabled for a client, actions execute through the shared
coordinator without a second per-action approval prompt. Host permissions,
restricted URLs, sessions, turns, tab leases, and advanced-operation limits
still apply.
