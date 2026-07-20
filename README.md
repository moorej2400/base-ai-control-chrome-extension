# base ai control extension

A Chrome extension that opens an **AI chat side panel** powered by your **GitHub Copilot subscription**. The AI can read the page you're viewing (via tools and an agent loop), stream answers in markdown, keep multiple persisted chat sessions, and drive the browser itself (navigate, click, type, screenshot) as an agent tool.

Built as a general-purpose "AI harness for the browser" with a pluggable skill system — Jira-specific tools (e.g. ticket-quality review) are an example add-on module.

## Stack

- [WXT](https://wxt.dev) + React + TypeScript (Manifest V3)
- [Vercel AI SDK](https://ai-sdk.dev) running **fully client-side** in the side panel — `streamText` + tools is the agent loop; a custom `ChatTransport` feeds `useChat` without any server
- GitHub Copilot via the community-standard direct API (device-flow OAuth → `copilot_internal/v2/token` exchange → OpenAI-compatible `api.githubcopilot.com`)
- `@mozilla/readability` for page extraction, `chrome.storage.local` + IndexedDB for persistence

> ⚠️ The Copilot chat API is not officially public. This uses the same endpoints VS Code/Neovim plugins use with your own subscription — fine for personal use, but it may break if GitHub changes things, and all Copilot HTTP is isolated in `lib/providers/copilot/` for that reason.

### Copilot model metadata

Copilot's `/models` response is versioned. The extension sends
`X-GitHub-Api-Version: 2026-06-01` on Copilot API calls so eligible accounts see
current model limits, including 1M-context metadata for models such as
`claude-opus-4.8` and `claude-opus-4.6`. Without that header, the same account
can receive older capped metadata such as 264K context for Opus, even though the
Copilot CLI shows the larger context option.

## TODO

- [Build and Enhance Context & Memory System](docs/CONTEXT_AND_MEMORY_PLAN.md)
- When the metrics system is built, promote the current context/cache console
  diagnostics into real metrics: prompt-cache hit/miss, cache read/write tokens,
  context-pack reuse/refresh, folded/recent message counts, input/output tokens,
  and latency.

## Develop

```sh
pnpm install
pnpm dev        # watches files + auto-reloads the loaded extension (HMR)
pnpm build      # production build to .output/chrome-mv3
pnpm zip        # installable zip
pnpm compile    # type-check
```

### Load it into Chrome (one time)

1. Run `pnpm dev` and leave it running.
2. Go to `chrome://extensions` and turn **Developer mode** ON (top-right toggle — the **Load unpacked** button only appears once it's on).
3. Click **Load unpacked** and select this folder:
   `.output\chrome-mv3-dev`

That's it. While `pnpm dev` is running, every code edit auto-reloads in Chrome — no need to reload the extension or re-add it. The install persists across Chrome restarts; just have `pnpm dev` running again before editing.

> Load the **`chrome-mv3-dev`** folder (not `chrome-mv3`). The dev build is what HMR pushes updates to; `chrome-mv3` is the production build from `pnpm build`.

## Debugging tools (dev only)

> **When working on Copilot/model/tool/agent features, validate against the real
> API and the live extension — see [docs/TESTING.md](docs/TESTING.md).** Don't
> ship changes in these areas on type-checking alone; the API and running
> extension repeatedly behave differently than assumptions.

Two offline/live harnesses for working on the extension without manual clicking.

**`scripts/copilot-probe.mjs`** — hits the real Copilot API from Node (auth via
device flow, token cached + gitignored):

```sh
node scripts/copilot-probe.mjs models [--grep opus]   # dump /models + grouping
node scripts/copilot-probe.mjs chat "hello" [modelId] # test a completion
```

**Live control in your real Chrome (primary)** — drive/observe the side panel in
your normal profile (full Copilot + site auth), via a local relay the dev build
connects out to. No remote debugging, no separate profile.

```sh
node scripts/devbridge-server.mjs     # relay (leave running, with pnpm dev)
# open the side panel in your normal Chrome, then:
node scripts/live.mjs send "summarize this page"   # drive the agent, print reply
node scripts/live.mjs read | status | logs | health | stop
```

**CDP control (deep inspection)** — adds network capture + screenshots, but runs
in a **separate** debug profile (no auth), so use it only when you need those:

```powershell
./scripts/launch-debug-chrome.ps1
```
```sh
node scripts/devtools.mjs network 30 | screenshot | send | read | logs | eval | storage
```

Both rely on a `window.__chatDev` bridge that is **only present in dev builds**
(gated by `import.meta.env.DEV`) — stripped from `pnpm build`. See
[docs/TESTING.md](docs/TESTING.md).

## Use

1. Click the toolbar icon → side panel opens.
2. ⚙ Settings → **Connect GitHub Copilot** → enter the code at github.com/login/device.
3. Pick a model (from Copilot's `/models`, filtered to tool-capable ones) and chat. Ask "summarize this page" to see the page tools in action.
4. By default the AI can only read the tab you clicked the icon on; enable **Allow reading any site** in Settings for seamless tab switching.

## Architecture

For the parent agent, tool modules, sub-agents, and context compaction flow, see
[docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md).
For the planned context, retrieval, memory, and ownership roadmap, see
[docs/CONTEXT_AND_MEMORY_PLAN.md](docs/CONTEXT_AND_MEMORY_PLAN.md).

```
entrypoints/
  background.ts        # opens panel on icon click, nothing else
  extract-page.ts      # Readability, injected via chrome.scripting.executeScript
  sidepanel/           # React app: chat, sessions, settings
lib/
  providers/           # ChatProvider interface + dynamic registry
    copilot/           # device flow, token exchange/refresh, models, fetch wrapper
    custom/            # generic OpenAI-compatible provider (Ollama, OpenAI, OpenRouter, …)
  agent-tools/          # browser-control tools (navigate/click/type/screenshot)
  tools/               # ToolModule registry — add new "skills" here
  chat/                # LocalChatTransport (client-side agent loop), system prompt
  sessions/            # session meta store, auto-titling
  storage/             # chrome.storage helpers, IndexedDB message store
```

**Adding a provider:** implement `ChatProvider` (`lib/providers/types.ts`) and register it in `lib/providers/registry.ts`. For OpenAI-compatible HTTP endpoints there is nothing to code — users add them in Settings → Add provider (base URL + optional API key); they persist and register at runtime via `syncCustomProviders`. See [docs/FEATURES.md](docs/FEATURES.md) for the full feature/TODO status list.

**Adding a skill (e.g. Jira):** implement `ToolModule` (`lib/tools/types.ts`) with AI SDK `tool()` definitions and register it in `lib/tools/registry.ts` — optionally gated by URL via `isAvailable`.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it.
