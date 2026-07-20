# browser-control

Tools that let the agent **control the browser** — tabs, navigation, reading
page structure, clicking, filling, screenshots — implemented purely through
Chrome extension APIs. Self-contained and isolated: the rest of the extension
only ever imports from [`index.ts`](index.ts).

See [`docs/BROWSER_CONTROL_PLAN.md`](../../../docs/BROWSER_CONTROL_PLAN.md) for
the full design and rationale, and
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
   interface. The chrome implementation is [`driver/extension/`](driver/extension/).
   To swap the control mechanism (e.g. `chrome.debugger`/CDP), add a new driver
   and change `getExtensionDriver()` — no tool changes.
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
  extension/    the chrome.* implementation
    extension-driver.ts   BrowserDriver impl; owns target-tab + epoch state
    restricted-urls.ts    chrome://, Web Store, etc. guard
    injected/             self-contained fns serialized into pages
      snapshot.ts   DOM walk → uid-tagged element tree + registry
      actions.ts    resolve uid → dispatch synthetic click/fill/key
      wait.ts       poll for text/selector
```

## uid lifecycle (how interaction works)

1. `take_snapshot` walks the DOM, tags each interactive element with a `uid`
   (`e{epoch}_{n}`), and stores a `uid → Element` registry on a world global
   that persists across `executeScript` calls for the same document.
2. `click`/`fill`/etc. resolve a uid against that registry.
3. Each snapshot bumps the **epoch**. A uid from an older epoch (page changed /
   navigated / re-snapshotted) is rejected as `stale`, forcing a re-snapshot.

## Known limitation

Synthetic events are `isTrusted: false`. This works on the vast majority of
sites but is ignored by the few that gate on trusted input (some anti-bot /
payment flows). The designed fix is a future `chrome.debugger`-backed driver
implementing the same `BrowserDriver` interface — which is exactly why the seam
exists.
