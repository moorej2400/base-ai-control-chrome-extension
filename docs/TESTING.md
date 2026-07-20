# Testing & validating the real flow

**Core rule: don't work in the dark.** When you change anything that touches the
Copilot API, models, the agent/tool loop, or chat behavior, validate it against
the **real** Copilot API and the **real** running extension before claiming it
works. Type-checking and reasoning are not enough — the API and the live
extension repeatedly behave differently than assumptions.

Two real, verified failures this project already hit (both invisible to
type-checking):

- The model "context size" design assumed Copilot returned `-1m` model variants.
  The probe against the live API showed it does **not** — and later that a
  `X-GitHub-Api-Version` header was required to unlock 1M-context metadata at all.
- A "rebuilt" change wasn't reaching the browser because the `pnpm dev` watcher
  had gone **stale** and stopped rebuilding. The code was fine; the build was old.

Both were caught only by exercising the real flow. Do the same.

## Tool 1 — Copilot API probe (offline, no browser)

`scripts/copilot-probe.mjs` authenticates via GitHub device flow (token cached in
`scripts/.copilot-token.json`, gitignored) and calls the **real** Copilot API from
Node. Use it to validate anything about models, capabilities, or completions.

```sh
node scripts/copilot-probe.mjs login                 # one-time device-flow auth
node scripts/copilot-probe.mjs models [--grep opus]  # dump /models (raw + grouped)
node scripts/copilot-probe.mjs chat "hello" [modelId]
```

- `models` writes the full raw JSON to `scripts/.copilot-models.json` and prints a
  table (id / family / ctx / picker / type) plus the grouped result the settings
  page would show. This is the ground truth for model/grouping work.
- Its parse/group logic mirrors `lib/providers/copilot/models.ts` +
  `lib/providers/model-groups.ts`. If you change those, update the probe's copy
  and re-run to confirm the real data still groups correctly.
- ⚠️ Models like Opus are **usage-based billed**. Keep `chat` probes small; never
  loop large prompts to "test" context size.

## Tool 2 — Live control in YOUR real Chrome (dev bridge relay) — primary

Drive and observe the side panel running in your **normal Chrome profile**, so
all your Copilot and website (e.g. Jira) auth is intact. No remote debugging, no
separate profile. The dev build connects **out** to a local relay; the CLI sends
commands through it.

Start two long-running processes (your own terminals), then open the panel:

```sh
node scripts/devbridge-server.mjs     # the relay (leave running)
pnpm dev                              # the dev build (leave running)
# open the side panel in your normal Chrome and sign in
```

Then drive it:

```sh
node scripts/live.mjs health                 # is the panel connected?
node scripts/live.mjs status                 # chat status + active model
node scripts/live.mjs send "summarize this page"   # drive the agent, print reply
node scripts/live.mjs read                   # transcript: text + every tool call
node scripts/live.mjs logs                   # recent side-panel console logs
node scripts/live.mjs stop                   # abort the current stream
node scripts/live.mjs reload                 # force a full panel reload (loads new dev-bridge/transport code that HMR otherwise can't swap in)
node scripts/live.mjs inspect "document.title"  # eval a JS expression in the active tab — inspect real third-party DOM when writing scrapers
```

This works via a `window.__chatDev` bridge + relay poll loop in
`entrypoints/sidepanel/dev-bridge.ts`, active **only in dev builds**
(`import.meta.env.DEV`) — stripped from `pnpm build`.

### The inner loop: change code → re-validate (without bugging the user)

The whole point of this bridge is that **you can validate your own changes
against the real, authed extension** without asking the user to do anything.
The reliable loop is:

1. Edit code.
2. `node scripts/live.mjs reload` — force the panel to load the new build.
3. Wait ~5s (the panel disconnects and reconnects), then `node scripts/live.mjs status`
   until it prints `ready`.
4. `node scripts/live.mjs send "…"` to exercise the change, then `read` to confirm
   tool calls fired and resolved.

For UI/DOM debugging, `node scripts/live.mjs inspect "<js>"` evaluates an
expression in the **active page tab** and returns the JSON result.

### Gotchas (learned the hard way — read before you debug)

These are real failure modes that wasted time in past sessions. Knowing them
up front avoids "my fix isn't working" rabbit holes:

- **HMR does NOT reload the bridge or the transport.** Vite HMR + React Fast
  Refresh hot-swap component code in place, and changes to non-component modules
  (`dev-bridge.ts`, `lib/chat/transport.ts`) get **absorbed into the nearest Fast
  Refresh boundary** (`screens/ChatScreen.tsx`) *without* re-running the `installDevBridge`
  effect or re-constructing the transport. So edits to those files silently never
  take effect in the running panel. **Always `live.mjs reload` after editing
  bridge/transport code.** Symptom: you "fixed" something but behaviour is
  unchanged, and `logs` shows `[vite] hot updated …` but no fresh
  `[dev-bridge] window.__chatDev ready`.
- **Chicken-and-egg with new bridge commands.** `reload` itself only works if the
  *currently running* bridge already has it. If you just added a new bridge
  command and the relay returns `unknown method: …`, the new code isn't loaded
  yet. Break the cycle by editing `entrypoints/sidepanel/main.tsx` (the React
  entry — it sits above every Fast Refresh boundary, so any change there forces a
  genuine full `location.reload()`). After that one full reload, `reload` works
  and you can self-bootstrap from then on.
- **The panel (extension page) CSP forbids `eval`/`new Function`.** MV3 pages run
  under `script-src 'self'`, so you **cannot** build a function from a string on
  the panel side — it throws and the command appears to silently fail. The
  `inspect` command works around this by injecting a *fixed, compile-time*
  function via `chrome.scripting.executeScript({ world: 'MAIN', args:[code] })`
  that evals the snippet in the **page's** world (the page's own CSP applies, not
  the extension's). Use this pattern for any "run code in the tab" need.
- **Reconnect timing after `reload`.** Right after a reload the panel is briefly
  disconnected; a command fired immediately can hang or return a transient error.
  This is expected — wait a few seconds and re-check `status`/`health` rather than
  assuming the bridge broke.
- **`executeScript` on a third-party tab needs host access.** Reading a non-Copilot
  page's DOM (e.g. Jira) requires the `activeTab` grant (user clicked the
  extension icon on that tab) or the all-sites permission. If `inspect`/a scraper
  returns a permission error, that's the cause — not a code bug.
- **Don't guess third-party selectors — `inspect` the real DOM.** Jira Cloud
  (`*.atlassian.net`, `data-testid` attributes) and self-hosted Jira Server/Data
  Center (`#summary-val`, `#descriptionmodule .user-content-block`,
  `.jira-issue-status-lozenge`) have completely different DOMs. Selectors written
  from memory for one will silently return empty on the other. Always confirm
  against the actual page with `inspect` before trusting a scraper.
- **Background-window timer throttling.** Chrome throttles/freezes `setTimeout` in
  unfocused windows. When the panel is driven headlessly it is always unfocused,
  so any cosmetic `setTimeout` pacing (e.g. `smoothStream` word chunking) stalls
  the stream indefinitely. Cosmetic timers must be focus-gated
  (`document.hasFocus()`); the bridge also runs a silent-audio keepalive to keep
  timers alive. If a headless `send` hangs with no progress, suspect throttling.

## Tool 3 — CDP control (separate debug profile) — deep inspection only

`scripts/devtools.mjs` attaches over the Chrome DevTools Protocol and adds things
the relay can't do: live **network** capture of Copilot requests and
**screenshots**. Chrome 136+ blocks remote debugging on the default profile, so
it launches a **separate** debug Chrome — which means it does **not** carry your
Copilot or Jira auth (you'd sign in again there). Prefer Tool 2 for anything
auth-dependent; reach for this only when you need the network tap or a screenshot.

```powershell
./scripts/launch-debug-chrome.ps1            # separate debug profile, CDP enabled
```
```sh
node scripts/devtools.mjs targets | status | send | read | logs | network | storage | eval | screenshot
```

## The dev-server gotcha (read this)

WXT **dev** builds load their code from the running dev server, so:

1. The extension only works while `pnpm dev` is actually running.
2. A stale `pnpm dev` can silently stop rebuilding. If a change "isn't showing
   up," confirm the watcher is alive and rebuilding **before** debugging the code:
   - Check a `wxt` node process is running.
   - Edit a file and confirm the dev server logs a rebuild.
   - After restarting `pnpm dev`, **reload the extension** at `chrome://extensions`
     (and reopen the side panel) so it reconnects and drops the 5-minute model cache.
3. `pnpm dev` must run in a real terminal you control; it won't survive as a
   detached/background process.

For a self-contained build that needs no dev server, use `pnpm build` and load
`.output/chrome-mv3` (no HMR, no dev bridge).

## Tool 4 — Browser-control e2e suite (automated + AI-reviewed)

`test/browser-control/` drives the real extension to act on a real page and
scores it against ground truth (the page's own DOM-change events). Start the
bench, then run the suite through the live bridge:

```sh
node test/browser-control/bench-server.mjs     # instrumented test site (leave running)
node test/browser-control/run.mjs              # all scenarios; writes report.json
```

`run.mjs` reloads the panel, enables the opt-in `browser-control` module for the
run via the dev bridge (`live.mjs tools browser-control`, i.e. the `setToolModules`
command — no persistence), and asserts real DOM/page-load events. It covers
form-fill, navigation + history, multi-tab, and dynamic wait-for. After a run,
an AI reviewer reads `report.json` for semantic validation (tool choice,
screenshot path, edge cases). See `test/browser-control/README.md`.

## Validation checklist by change type

| You changed… | Validate with |
|---|---|
| Models, capabilities, `/models` parsing, grouping | `copilot-probe.mjs models` — compare real data, not assumptions |
| Auth headers / token exchange / request shape | `copilot-probe.mjs` (chat/models); `devtools.mjs network` for the live request tap |
| Tools, the agent loop, a new skill (e.g. Jira) | `live.mjs send "…"` on a real matching page (real profile → real auth), then `read` to confirm tool calls fire and resolve |
| Chat UI / streaming / state | `live.mjs read` / `logs`; `devtools.mjs screenshot` for a visual |
| Anything model-behavior-dependent | Run it live; do not infer from code alone |

When you finish a feature in these areas, state plainly what you validated and
how (which probe/devtools commands, what you observed) — not just "it compiles."
