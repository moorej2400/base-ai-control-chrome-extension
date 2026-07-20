# browser-control e2e suite

Live, end-to-end validation of the [`browser-control`](../../lib/agent-tools/browser-control/)
agent tools: it drives the **real** extension (real Copilot auth, real Chrome)
to act on a **real** web page, and scores the result against **ground truth** —
the page's own DOM-change events, not the agent's self-report.

This suite is deliberately self-contained and isolated from app code. It touches
the extension only through the existing dev bridge (dev-only, stripped from
production builds).

## What it validates

| Scenario | Exercises |
|---|---|
| `fill-form` | `take_snapshot`, `fill_form`, `click` (checkbox/radio), `<select>` by label, range slider; and the guardrail (does NOT submit) |
| `navigation` | link `click` → page load, then `navigate_history` back |
| `tabs` | `new_tab` ×2, `list_tabs`, target-tab switching |
| `screenshot` | `take_screenshot` + **vision**: reads a 4-digit token rendered only into a server-side PNG (nowhere in the DOM/JS), so it can't be read from source |
| `dynamic-wait` | `click` → `wait_for` a delayed element → `fill` the new element |

Hard checks are asserted against the bench event log and gate the suite.
Advisory checks inspect tool usage and are reported but non-gating (a valid
end state reached via a different tool path is still a pass).

## Layout

```
bench-server.mjs   two-page instrumented test site; logs every DOM change to events.ndjson
scenarios.mjs      declarative scenarios: prompt + checks
run.mjs            automated driver: waits for panel, enables the module, runs + scores
report.json        last run's full transcripts + per-check results (gitignored)
report.txt         last run's console log (gitignored)
events.ndjson      ground-truth event log, rewritten per scenario (gitignored)
```

## Prerequisites

The same live-bridge setup as [docs/TESTING.md](../../docs/TESTING.md):

1. `node scripts/devbridge-server.mjs` — the relay (leave running)
2. `pnpm dev` — the dev build (leave running)
3. Open the extension **side panel** in your normal Chrome and sign in

Browser control acts on `localhost`, which needs host access: enable
**Settings → "read any site"** in the panel once (the `<all_urls>` grant), or
the actions will return a permission error.

## Run it

```sh
node test/browser-control/bench-server.mjs     # terminal A: the test site (leave running)
node test/browser-control/run.mjs              # terminal B: all scenarios
node test/browser-control/run.mjs fill-form    # or one scenario by name
```

`run.mjs` reloads the panel (to load the latest build), then for **each
scenario** starts a fresh chat session (`newChat`) and enables the opt-in
`browser-control` module **via the dev bridge** (`setToolModules` — no
persistence, no change to `DEFAULT_TOOL_MODULES`). The per-scenario fresh
session matters: without it, screenshot-heavy history from earlier scenarios
pollutes the model's behaviour and it starts screenshotting instead of acting.
Exit code is `0` when all hard checks pass.

## The AI reviewer (the second half of validation)

`run.mjs` proves the deterministic outcome. It cannot judge *how* the agent got
there or catch things assertions don't encode — that is the AI reviewer's job.
After a run, an AI (e.g. Claude Code) should read `report.json` and:

- **Read each transcript.** Did the agent use sensible tools, or brute-force
  with `evaluate_script`? Did it snapshot before acting and re-snapshot after
  the page changed? Did it respect the "do not submit" guardrail *reasoning*,
  not just the outcome?
- **Sanity-check advisory notes.** If `wait_for`/`navigate_history` weren't
  used, was the alternative path actually valid or just lucky?
- **Confirm the screenshot vision read.** The `screenshot` scenario is now
  auto-scored (it reads a pixel-only token), but still read its transcript: did
  the model read the badge from the *image*, or try to cheat via source/network?
  Note whether Copilot accepted the image tool-result at all.
- **Probe edge cases** the suite doesn't: a `chrome://` URL (should error
  cleanly), a stale uid after navigation (should say "snapshot again"), an
  ambiguous instruction.
- **Report** what passed, what looked off, and any new scenario worth adding.

## Adding a scenario

Append to `scenarios.mjs`. A scenario is `{ name, prompt, checks }`; each check
is `{ name, fn(ctx) }` (hard) or adds `advisory: true` (non-gating). `ctx` gives
`finalValues` (last value/checked per field id), `submitted`, `paths` (page
loads in order), `toolNames`, and `transcript`. Add matching instrumented
controls to `bench-server.mjs` if the scenario needs them.

## Notes

- Synthetic input is `isTrusted: false` — works on ordinary sites (proven here),
  ignored by the rare site that gates on trusted input. See the
  [browser-control README](../../lib/agent-tools/browser-control/README.md).
- The bench never persists anything and runs entirely on `localhost`.
