# Agent guide — AI Page Chat

Chrome MV3 side-panel extension: an in-browser AI chat powered by the user's
GitHub Copilot subscription, that can read the current page and run an agent loop
with pluggable tools/skills. See [README.md](README.md) for the full overview and
[docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md) for the parent/sub-agent
and context architecture. See [docs/TESTING.md](docs/TESTING.md) for how to
validate changes.

## ⚠️ Validate the real flow — do not work in the dark

When you change anything touching the **Copilot API, models, auth, the agent/tool
loop, or chat behavior**, you must validate against the **real Copilot API** and
the **real running extension** before claiming it works. Type-checking and
reasoning are necessary but not sufficient — this project has repeatedly been
bitten by assumptions that only the live flow disproved (e.g. Copilot not
returning `-1m` model variants; a 1M-context header requirement; a stale dev
server silently serving old code).

Use the harnesses documented in **[docs/TESTING.md](docs/TESTING.md)**:

- `node scripts/copilot-probe.mjs models|chat` — exercise the real Copilot API offline.
- `node scripts/devbridge-server.mjs` + `node scripts/live.mjs send|read|status|logs`
  — drive/observe the side panel in the user's **real** profile (full auth). Primary.
- `./scripts/launch-debug-chrome.ps1` + `node scripts/devtools.mjs network|screenshot`
  — CDP in a separate profile; only for network capture/screenshots (no auth).

When you finish such a change, state **what you validated and how** (which
commands, what you observed) — not just "it compiles." If you couldn't validate
live, say so explicitly.

**Always validate your work — every change, not just the high-risk ones.** Run
`pnpm compile` and exercise the real behavior (live bridge / probe) whenever the
change is observable at runtime. "It compiles" and "it should work" are not
validation. Never report something done that you haven't seen working; if you
can't validate live, say so and why.

⚠️ Copilot models (esp. Opus) are usage-based billed — keep `chat` probes small.

## Commands

```sh
pnpm dev        # WXT watcher + HMR; must run in a real terminal (see TESTING.md)
pnpm build      # production build → .output/chrome-mv3
pnpm compile    # tsc --noEmit (type-check)
pnpm zip        # packaged build
```

After restarting `pnpm dev`, reload the extension at `chrome://extensions` so it
reconnects and drops the 5-minute model cache.

## Architecture (where things live)

```
entrypoints/sidepanel/   React UI: chat, sessions, settings; dev-bridge (dev only)
entrypoints/background.ts opens the panel on icon click
entrypoints/extract-page.ts  Readability, injected via chrome.scripting
lib/providers/           ChatProvider interface + dynamic registry
  copilot/               device flow, token exchange/refresh, /models, fetch wrapper
  custom/                generic OpenAI-compatible provider (Ollama/OpenAI/…) + config store
  model-groups.ts        groups context-size variants by family
lib/tools/               ToolModule registry — add skills here (page, jira, …)
lib/chat/                LocalChatTransport (client-side agent loop), system prompt
lib/sessions/, storage/  session metadata + IndexedDB message store
```

- **Add a provider:** implement `ChatProvider` (`lib/providers/types.ts`), register
  in `lib/providers/registry.ts`. OpenAI-compatible endpoints need no code — users
  add them in Settings → Add provider; they persist and register at runtime via
  `syncCustomProviders`. Feature/TODO status lives in `docs/FEATURES.md`.
- **Add a skill:** implement `ToolModule` (`lib/tools/types.ts`), register in
  `lib/tools/registry.ts`; gate with `isAvailable` (e.g. Jira tools only on
  `*.atlassian.net`).
- All Copilot HTTP stays isolated in `lib/providers/copilot/` (the API is
  unofficial and may drift).

## Conventions

- The agent loop runs **client-side in the side panel** (no server); the MV3
  service worker only opens the panel.
- Match surrounding code style; keep comments at the existing density.
- Commit only when asked. Validate before declaring done.

## Extension-Side vs UI

- **Extension-side** means local engine work: `lib/` agent/RAG/memory logic,
  providers, Copilot API handling, tools, sub-agents, storage schemas,
  migrations, WebGPU/embedding workers, eval harnesses, scripts, MV3
  permissions, and non-visual runtime behavior.
- **UI** means user-facing side-panel work: React components, CSS, layout,
  settings pages, display components, review/purge screens, status indicators,
  copy, and visual interaction logic under `entrypoints/sidepanel/`.
- For the Context and Memory Plan, Codex owns only extension-side work and
  Claude owns only UI work. If a task crosses the boundary, split it into
  extension-side contracts/APIs and UI consumption rather than letting one
  model drift into the other model's domain.
- UI may call extension-side APIs but must not redefine RAG, memory, storage,
  Copilot/provider, tool, sub-agent, WebGPU, or eval semantics. Extension-side
  may define APIs/events/settings contracts but must not build the visual UI
  for this plan.

## Documentation hygiene

- Always keep documentation up to date after making changes. When a change
  touches behavior that is already documented, validate the related docs are
  still correct so they do not drift.
- Keep documentation concise while preserving the necessary detail. Write docs
  so they are easy to read, understand, and scan later.
- If you or the user adds or updates guidance in `CLAUDE.md` or `AGENTS.md`,
  make the same guidance update in both files so every agent follows the same
  project rules.
