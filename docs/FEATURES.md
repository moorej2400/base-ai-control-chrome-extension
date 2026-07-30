# Feature status

Living inventory of J Chat features and the mock-to-real work behind them.
This is the source of truth for "what actually works" vs. "what is surfaced in
the UI but not yet wired". Update it whenever a TODO is genuinely finished
(a TODO is only removed from the code once the feature truly works).

Legend: ✅ real & working · 🟡 partial · ⛔ deferred (see _Deferred_ at the bottom).

## Providers

- ✅ **GitHub Copilot** — device-flow auth, live model catalog, chat streaming,
  tool loop. The primary provider. (`lib/providers/copilot/`)
- ✅ **Generic 3rd-party providers** — connect any OpenAI-compatible endpoint
  (Ollama, LM Studio, OpenAI, OpenRouter, vLLM, …) with a base URL and optional
  API key. Replaces the old hard-coded "Anthropic/OpenAI already connected"
  mocks. Models are fetched live from `/models`; chat runs through the same
  transport as Copilot. (`lib/providers/custom/`)
- ✅ **Provider registry is dynamic** — custom providers hydrate from storage at
  startup and stay in sync as they are added/edited/removed.
  (`lib/providers/registry.ts`, `sync.ts`)
- ✅ **Settings → AI providers** shows only real providers (Copilot + the custom
  ones you added), with live connection state.
- ✅ **Provider config screen** — name, base URL, API key (persisted), fetch &
  toggle models, test connection, host-permission grant, remove. Copilot keeps
  its dedicated device-auth screen.

## Chat composer (quick settings)

- ✅ **MODEL** picker — real catalog, grouped by vendor, across every connected
  provider; selecting an Ollama/OpenAI model switches the chat's provider too.
- ✅ **MODE** dropdown — pick a saved Mode; applies its system prompt +
  temperature to the request.
- ✅ **STYLE** dropdown — pick a saved Style; appends its guidance to the system
  prompt.
- ✅ **PRESET** dropdown — a saved Mode+Style pairing applied together.
- ✅ **SCOPE / page chip** — toggles whether the current page is offered to the
  model (gates the page-reading tools for the session).

## Skills

- ✅ Active skill (via `/` or the composer chip) injects its instructions into
  the request system prompt.

## Agent tools

- ✅ **Page tools** — `get_page_info`, `read_page_content`, `get_selected_text`
  on the active tab. (`lib/tools/page-tools.ts`)
- ✅ **Jira ticket review** — sub-agent delegating tool, gated to Jira issue
  pages. (`lib/tools/jira/`)
- ✅ **Dual-client browser control** — the side-panel agent and local MCP
  client share session/turn leases, a CDP-first resilient driver, visible
  cursor, and shared coordinator policy. Embedded sessions and the local MCP toggle
  default on; the companion native host is user-scoped and origin-restricted.
  The full embedded bench, normal MCP transport-close cleanup, exercised cursor
  alignment, and reload/error audit pass live. See
  [Browser-control architecture](BROWSER_CONTROL_ARCHITECTURE.md) and
  [Dual-client browser control](DUAL_CLIENT_BROWSER_CONTROL.md).

## Settings

- ✅ **Default model** picker (real catalog, persisted).
- ✅ **Modes** — create/edit/delete; temperature + system prompt + page-read tool
  gate applied to requests.
- ✅ **Skills** — create/edit/delete; applied to requests.
- ✅ **Styles** — create/edit/delete; applied to requests.
- ✅ **System prompt** — global custom system prompt, prepended to every request.
- ✅ **Context & retrieval** — "read any site" permission + chat-history retention
  (auto-delete + clear-now).
- ✅ **Data & privacy** — export all data (secrets redacted), delete all data.
  Everything is local; there is no telemetry, so there are no sharing toggles.
- ✅ **Keyboard shortcuts** — a real `open-panel` command (default Ctrl/Cmd+J)
  opens the side panel; the screen shows the live binding and opens Chrome's
  shortcuts page (Chrome owns key assignment).
- ✅ **Usage / cost** — the composer panel shows **measured** tokens & cost from
  the provider's reported usage (`onFinish`), falling back to a text-length
  estimate only before the first reply. Cost uses the model's advertised price;
  local providers (Ollama) report $0.

## TODO — not yet built

Each is a real subsystem; the UI is a labelled stub. Notes below capture the
intended design (from the product owner) for when we pick these up.

- ⛔ **RAG memory** — indexing / embeddings / vector store. Gated behind the
  `ragMemory` feature flag (off by default); the UI saves the preference only.
  There is an early-stage RAG foundation; **leave it as-is for now — do not build
  further on it yet.**
- ⛔ **Edit / apply tool** — the tracked-diff apply card, "insert at cursor", and
  Edit-behavior enforcement all depend on a page-writing edit tool. **On hold —
  save for later.**
- ⛔ **File / attachments** — **on hold — save for later.** When we build it:
  - Gate by the **selected model's capabilities** (known from the provider/model
    API): if the model has no image support, **disable image files** in the
    picker rather than failing at send time.
  - When the user hovers the attach control, **note that N files are disabled
    because the selected model doesn't support them** (e.g. images on a
    text-only model).
  - **Text-like files (.txt, .md, .csv, etc.) stay allowed** regardless of image
    support — the model can still read those.
