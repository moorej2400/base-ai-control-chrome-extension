# Browser Control Plan

Give the in-panel agent tools to **control the browser** — navigate, click,
fill forms, read state, manage tabs — implemented purely through Chrome
extension APIs (`chrome.scripting`, `chrome.tabs`, `chrome.windows`, …), NOT
through chrome-devtools-mcp or an external CDP process. The tool *surface* is
modeled on [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
(a proven agent-facing API shape); the *implementation* underneath is ours and
must be swappable.

## Non-negotiable design rules

1. **Total isolation.** All browser-control code lives in a new top-level
   folder `lib/agent-tools/browser-control/`. Nothing outside that folder may
   contain browser-control logic. The rest of the codebase touches it at
   exactly four points:
   - `lib/tools/registry.ts` — one `registerToolModule(browserControlModule)`
     line plus (optionally) adding it to `DEFAULT_TOOL_MODULES`.
   - `wxt.config.ts` — manifest permission additions.
   - `lib/chat/system-prompt.ts` — one short guidance line about the browser
     tools (mirrors how page tools are described today).
   - UI (settings toggle / mode gate) — consumes the module id only; UI work
     is tracked separately and is not part of the extension-side deliverable.
2. **Swappable driver.** Tools never call `chrome.*` directly. They call a
   `BrowserDriver` interface. The only implementation for now is
   `ExtensionDriver` (chrome extension APIs). If we later swap to
   `chrome.debugger`/CDP or anything else, we write a new driver and change one
   factory call — zero tool changes.
3. **Tools never throw.** Like `page-tools.ts`, every tool returns a
   structured result or `{ error: string }` with actionable guidance, so the
   agent loop keeps running and the model can self-correct.
4. **No caching of action tools.** `tool-cache.ts` is for expensive nullary
   reads only. Snapshots/screenshots/actions are always fresh.
5. **Validate live.** Every phase ends with real validation through the dev
   bridge (`scripts/live.mjs`) per [TESTING.md](TESTING.md) — not just
   `pnpm compile`.

## Folder layout

```
lib/agent-tools/
  browser-control/
    index.ts                 # public surface: browserControlModule (ToolModule) — the ONLY import point
    module.ts                # ToolModule adapter: id 'browser-control', isAvailable gate, getTools()
    tools/                   # AI SDK tool definitions (schemas + descriptions), 1 file per group
      navigation.ts          # navigate_page, navigate_history, wait_for
      tabs.ts                # list_tabs, select_tab, new_tab, close_tab
      snapshot.ts            # take_snapshot
      input.ts               # click, fill, fill_form, hover, press_key, scroll_to
      capture.ts             # take_screenshot, evaluate_script
    driver/
      types.ts               # BrowserDriver interface + shared result types (the swap seam)
      errors.ts              # error mapping → agent-actionable messages (restricted URL, stale uid, no permission…)
      extension/             # the chrome.* implementation
        extension-driver.ts  # implements BrowserDriver; owns target-tab session state
        injected/            # functions serialized into pages via chrome.scripting
          snapshot.ts        # DOM walk → uid-annotated text tree; uid→element registry
          actions.ts         # click/fill/hover/key dispatch against registered uids
          wait.ts            # poll for text/selector presence
        restricted-urls.ts   # chrome://, edge://, chrome-extension://, Web Store, our own panel
    README.md                # folder contract: what lives here, driver-swap rules, uid lifecycle
```

`lib/tools/` (the existing registry/module machinery) stays where it is — it
is generic plumbing, not browser-control logic. `browser-control` plugs into
it exactly like `page` and `jira` do. (Optionally, as a follow-up chore, the
existing modules can migrate under `lib/agent-tools/` too — **not** part of
this feature.)

## The driver seam (`driver/types.ts`)

```ts
export interface BrowserDriver {
  // --- targeting ---
  /** The tab tools act on. Defaults to the active tab; select_tab changes it. */
  getTargetTab(): Promise<TabInfo>;
  setTargetTab(tabId: number): Promise<TabInfo>;
  listTabs(): Promise<TabInfo[]>;

  // --- navigation ---
  navigate(url: string): Promise<NavResult>;          // waits for 'complete' w/ timeout
  navigateHistory(dir: 'back' | 'forward'): Promise<NavResult>;
  newTab(url?: string): Promise<TabInfo>;
  closeTab(tabId: number): Promise<void>;
  waitFor(cond: { text?: string; selector?: string; timeoutMs?: number }): Promise<WaitResult>;

  // --- reading ---
  snapshot(opts?: { mode?: 'interactive' | 'full' }): Promise<SnapshotResult>; // uid-annotated tree
  screenshot(): Promise<{ dataUrl: string; width: number; height: number }>;
  evaluate(expression: string): Promise<{ value: unknown }>;                   // MAIN world

  // --- acting (uids come from the last snapshot) ---
  click(uid: string, opts?: { dblClick?: boolean }): Promise<ActionResult>;
  hover(uid: string): Promise<ActionResult>;
  fill(uid: string, value: string): Promise<ActionResult>;
  fillForm(fields: Array<{ uid: string; value: string }>): Promise<ActionResult>;
  pressKey(key: string): Promise<ActionResult>;       // 'Enter', 'Escape', 'Tab', 'a', …
  scrollTo(uid: string): Promise<ActionResult>;
}
```

Every `ActionResult`/`NavResult` includes a **post-action page summary**
(url, title, and whether the DOM changed / navigation happened) so the model
knows the world moved without having to re-snapshot after every single step.

## How the ExtensionDriver works (key mechanisms)

### Snapshot + uid registry (the heart of the design)

chrome-devtools-mcp's core interaction pattern: the agent calls
`take_snapshot`, gets a compact text tree where each element carries a `uid`,
then addresses actions by uid (never by CSS selector — models are bad at
guessing selectors, good at picking from a labeled list).

Implementation with extension APIs:

- `chrome.scripting.executeScript` runs `injected/snapshot.ts` in the
  **ISOLATED world** of the target tab. It walks the DOM collecting visible /
  interactive elements (links, buttons, inputs, selects, textareas,
  `[role=...]`, contenteditable, headings, labels + significant text), and
  builds an indented text tree: `uid=e12 button "Submit order" (disabled)`.
- The script stores `Map<uid, WeakRef<Element>>` on a module global in the
  isolated world (e.g. `globalThis.__agentBrowserRegistry`). The isolated
  world **persists per document across `executeScript` calls**, so a later
  `click(uid)` call resolves the same element without re-walking.
- Each snapshot bumps an **epoch** (`e{epoch}_{n}` uids). Actions carrying a
  uid from an older epoch or after a navigation fail with
  `{ error: "Snapshot is stale — call take_snapshot again." }`.
- Truncation: cap the serialized tree (~4–6k tokens<!-- must stay well under the context pack's oversized-tool-payload reducer threshold -->) with a
  `…N more nodes; snapshot with mode:'full' or scroll first` marker. Default
  `interactive` mode emits only actionable elements + structural headings.

### Input dispatch (synthetic events — the known tradeoff)

Extension APIs cannot produce **trusted** input events. `injected/actions.ts`
dispatches synthetic ones, which works on the overwhelming majority of sites:

- **click:** `scrollIntoView({block:'center'})` → `pointerdown/mousedown/pointerup/mouseup/click`
  sequence on the element (plus `element.click()` fallback), `focus()` first.
- **fill:** focus → set value via the **native setter**
  (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`)
  so React/Vue controlled inputs see the change → dispatch `input` + `change`.
  For `contenteditable`, use `document.execCommand('insertText')`.
- **select:** set `selectedIndex`/option, dispatch `change`.
- **press_key:** dispatch `keydown/keypress/keyup` on `document.activeElement`.

Sites that verify `isTrusted` (rare: some payment/anti-bot flows) will ignore
these. That is an accepted Phase-1 limitation, documented in the tool
descriptions so the model reports it instead of retry-looping. A future
`DebuggerDriver` (chrome.debugger → `Input.dispatch*`, trusted events) is the
designed escape hatch and the proof the driver seam works — see Phase 4.

### Navigation & waiting

- `navigate`: `chrome.tabs.update(tabId, { url })`, then await
  `chrome.tabs.onUpdated` → `status === 'complete'` (timeout ~15s, return
  partial state on timeout rather than erroring).
- `wait_for`: poll (300ms) via `executeScript` for text/selector presence up
  to `timeoutMs` (default 5s, max 30s). No persistent observers needed.
- History: `chrome.tabs.goBack` / `goForward`.

### Screenshot

`chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 })` —
only works on the **visible** tab, so the driver focuses the target tab first
(and says so in the result). Returned to the model as an **image part** via
the AI SDK tool `toModelOutput` so vision-capable Copilot models can see it;
for non-vision models return `{ error: 'model cannot view images…' }`.
**Must be validated against the real Copilot API** (image tool-results are
exactly the kind of thing Copilot may reject — probe first, small).

### evaluate_script

`chrome.scripting.executeScript` with `world: 'MAIN'` and a wrapper that
JSON-serializes the result (truncated). Power tool + footgun: description
tells the model to prefer snapshot/click/fill and use this only when needed.

### Restricted targets

`restricted-urls.ts` rejects `chrome://`, `chrome-extension://`,
`devtools://`, `edge://`, `about:`, the Chrome Web Store, and file:// (unless
granted). Clear error text tells the model why and what to ask the user.

## Tool surface (what the model sees)

Modeled on chrome-devtools-mcp, trimmed to what extension APIs can honestly
deliver. Names stay close to the reference so future swaps are low-friction.

| Tool | Group | Notes |
| --- | --- | --- |
| `list_tabs` | tabs | id, index, title, url, active, isTarget |
| `select_tab` | tabs | sets driver target tab |
| `new_tab` | tabs | optional url; becomes target |
| `close_tab` | tabs | refuses to close the last tab |
| `navigate_page` | nav | url; waits for load |
| `navigate_history` | nav | back / forward |
| `wait_for` | nav | text and/or selector + timeout |
| `take_snapshot` | read | uid tree; `interactive` (default) or `full` |
| `take_screenshot` | read | visible viewport, jpeg, image part |
| `evaluate_script` | read | MAIN-world JS, serialized result |
| `click` | act | uid (+ dblClick) |
| `hover` | act | uid |
| `fill` | act | uid + value (input/textarea/select/contenteditable) |
| `fill_form` | act | array of {uid, value} |
| `press_key` | act | key name on focused element |
| `scroll_to` | act | uid into view (also unlocks lazy content) |

Deliberately **excluded** (extension APIs can't do them well, or scope):
performance traces, heap snapshots, emulation, Lighthouse, extension
management, `handle_dialog` (needs chrome.debugger — Phase 4 candidate),
`upload_file` (file inputs can't be set synthetically — Phase 4 with
debugger), drag (flaky synthetic; revisit on demand), network/console
listing (needs `webRequest`/debugger or an always-on content script — Phase 4
decision).

Every action tool description ends with the same contract sentence: *"uids
come from the most recent take_snapshot; if this fails as stale, snapshot
again."* Every action result embeds `{ url, title, navigated, domChanged }`.

## Wiring (the four external touchpoints)

1. **Registry** — `lib/tools/registry.ts`:
   `registerToolModule(browserControlModule)`. **Not** in
   `DEFAULT_TOOL_MODULES` — browser control is opt-in per user (settings
   toggle), because an agent that clicks things is a different trust level
   than one that reads pages.
2. **Manifest** — `wxt.config.ts`: no new required permissions for Phase 1–2
   (`tabs`, `scripting`, `activeTab` + optional `<all_urls>` already cover
   it). Acting on arbitrary sites effectively requires the existing
   "read any site" optional grant; the module's `isAvailable` (or per-call
   errors) must explain that. Phase 4 adds **optional** `debugger` and/or
   `webRequest` if we go there.
3. **System prompt** — one added line: browser-control tools exist when
   enabled; snapshot → act by uid; ask before destructive/irreversible steps
   (submitting orders, sending messages, deleting things).
4. **UI contract (for the UI workstream, not this one):** a settings toggle
   ("Agent can control the browser", off by default) persisted alongside
   `enabledToolModules`; optionally a per-Mode `tools.act` gate mirroring the
   existing `tools.read`. Extension-side only defines the module id +
   storage key; UI builds the screens.

Also raise the parent loop's step budget for browser sessions:
`stopWhen: stepCountIs(35)` in `lib/chat/transport.ts` is tight for
multi-step web tasks (snapshot→click→wait→snapshot… burns ~4 steps per UI
action). Make the cap a per-request config value; keep 35 default, use a
higher cap (e.g. 60) when the browser-control module is enabled.
A **browser-task sub-agent** (via `defineSubagent`, keeping step-hungry
browsing out of the parent's context) is a natural follow-up but **out of
scope** — direct tools first, measure, then decide.

## Safety rails

- Off by default; explicit user opt-in (settings toggle).
- System-prompt instruction: confirm with the user before irreversible
  actions (purchases, sends, deletes, auth flows).
- Restricted-URL list enforced in the driver (defense in depth vs. the model).
- Never auto-dismiss dialogs or handle credentials; tools return an error
  telling the model to hand control back to the user.
- Every action is visible in the chat as a tool chip (already free via the
  existing tool-part rendering), so there is a human-auditable trail.

## Phases

### Phase 0 — Scaffold + driver seam (small)
Create the folder tree, `BrowserDriver` interface, `ExtensionDriver` with only
**tabs + navigation** (`list_tabs`, `select_tab`, `new_tab`, `close_tab`,
`navigate_page`, `navigate_history`), module registration, restricted-URL
guard, README with the folder contract.
**Validate:** `pnpm compile`; live bridge: enable module, send "open
example.com in a new tab and tell me its title" → observe real tab open via
`node scripts/live.mjs send/read`.

### Phase 1 — Snapshot + core actions (the heart)
`take_snapshot` (uid registry, epochs, truncation), `click`, `fill`,
`fill_form`, `press_key`, `scroll_to`, `hover`, `wait_for`.
**Validate live, scripted through the bridge:** on a real form page (e.g.
Wikipedia search, a demo form site): "search Wikipedia for X" → snapshot →
fill → press Enter → wait_for → snapshot shows results. Also verify: stale-uid
error after navigation; React controlled input on a real React site (Jira
search box is a perfect in-domain test); restricted URL error on chrome://.

> **Validated finding (screenshot vision):** `take_screenshot` captures the
> viewport and renders a thumbnail in the tool-call card, but with the **GitHub
> Copilot** provider the image does **not** reach the model — its Responses
> adapter (`lib/providers/copilot/responses-model.ts`) is text-only
> (`function_call_output` carries no image; user-message images are dropped).
> The adapter now strips image tool-results to a short "image not visible to
> this model" note (instead of dumping base64), so the agent stops looping and
> reports back. True screenshot-vision needs a provider that delivers images to
> the model (deliver the shot as a user `input_image` message) — tracked as a
> follow-up, not yet built. The e2e suite's screenshot vision-read check is
> therefore advisory.

### Phase 2 — Screenshot + evaluate
`take_screenshot` (image tool-result → **probe Copilot API first** with a tiny
image tool-result payload via `scripts/copilot-probe.mjs` before building the
full path; keep probes small, usage is billed), `evaluate_script`.
**Validate:** live bridge with a vision-capable model ("screenshot this page
and describe what you see"); non-vision model gets the graceful error.

### Phase 3 — Hardening + docs
Timeout/error-copy polish, snapshot token-budget tuning against the context
pack (oversized tool payloads get reduced — make sure snapshots survive
usefully or are re-fetchable), step-budget bump, `docs/` updates:
AGENT_ARCHITECTURE.md (new module + driver diagram), FEATURES.md entry,
TESTING.md (how to exercise browser control via live.mjs), AGENTS.md +
CLAUDE.md if guidance changes. A `scripts/` smoke flow (send a canned
multi-step browse task through the bridge and assert the transcript) if it
earns its keep.

### Phase 4 — Optional extensions (each its own decision)
- **DebuggerDriver**: `chrome.debugger`-backed driver for trusted input,
  `handle_dialog`, `upload_file`, real network/console capture. Proves the
  driver swap; costs the "is debugging this browser" infobar + optional
  `debugger` permission.
- **Console/network read tools** via `webRequest` or debugger.
- **Browser-task sub-agent** if parent-context bloat shows up in practice.

## Open questions (decide during implementation, defaults stated)

- **Snapshot flavor:** DOM-walk text tree (default, simplest) vs. trying to
  mirror a11y tree via `computedRole`/`computedName` — start DOM-walk, borrow
  a11y naming heuristics (label/aria-label/text) for element names.
- **Default-enabled?** Default **off**; revisit after real usage.
- **uid persistence via WeakRef vs. strong Map:** WeakRef default (no leak),
  fall back to re-query by recorded element path if the ref is gone.

## Definition of done (per project rules)

Feature is done only when: `pnpm compile` clean; each phase's live-bridge
scenario observed working in the real extension (state **what** was validated
and **how**); Copilot image-result behavior probed against the real API; docs
updated; no browser-control logic outside `lib/agent-tools/browser-control/`
beyond the four wiring touchpoints.
