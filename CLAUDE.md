# CLAUDE.md

Project guidance lives in **[AGENTS.md](AGENTS.md)** (commands, conventions),
**[docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md)** (parent/sub-agent
and context architecture), and **[docs/TESTING.md](docs/TESTING.md)** (how to
validate). Read them before non-trivial work.

## Most important rule: validate the real flow

When changing anything that touches the **Copilot API, models, auth, the
agent/tool loop, or chat behavior**, validate against the **real Copilot API** and
the **real running extension** — not just type-checking. This project has been
burned repeatedly by assumptions the live flow disproved (Copilot not returning
`-1m` model variants; a 1M-context header requirement; a stale `pnpm dev` serving
old code).

- Real API: `node scripts/copilot-probe.mjs models|chat`
- Live extension (real profile, full auth): `node scripts/devbridge-server.mjs`
  then `node scripts/live.mjs send|read|status|logs`
- CDP (separate profile, no auth — network/screenshots only):
  `./scripts/launch-debug-chrome.ps1` + `node scripts/devtools.mjs`

Report **what you validated and how**, or say explicitly that you couldn't.
Copilot models are usage-based billed — keep `chat` probes small. Full details in
[docs/TESTING.md](docs/TESTING.md).

## Always validate your work

Validation is not optional and not a final-only step. After **every** change —
not just the API/auth/chat ones above — confirm it actually works before
claiming it does: type-check (`pnpm compile`), and exercise the real behavior
through the live bridge or a probe whenever the change can be observed at
runtime. "It compiles" and "it should work" are not validation. If a change
can't be validated live, say so explicitly and explain why. Never report
something as done that you haven't seen working.

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
