# Design Brief: Tool-Call Dropdown Revamp

Handoff document for the design agent producing mocks of the enhanced tool-call
card/dropdown in the AI Page Chat side panel. This brief describes **what data
exists, when it becomes available, and how it evolves over time**. It
deliberately does **not** prescribe layout, placement, or visual treatment —
that is the design agent's job. Everything marked **[needs code change]** is
not wired up yet but is confirmed feasible; design for it freely.

---

## 1. Product context — who is watching and why

- The app is a Chrome side-panel AI agent that operates on the user's browser:
  it reads pages, clicks, fills forms, navigates, manages tabs, takes
  screenshots, and delegates work to specialist sub-agents (Jira skills).
- The core scenario to design for is a **long-horizon task**: the user submits
  a prompt and the agent works for minutes, performing dozens of tool calls.
  The user sits and **monitors**. The worst possible experience is an opaque
  spinner; the goal is a live, legible activity feed where the user can verify
  the agent is on track at a glance, and drill into any step for detail.
- A **thinking/reasoning display already exists and stays** (a separate
  "thinking pill" showing the agent's chain of thought between tool calls). It
  will be enhanced in a later phase. This revamp is scoped to **the tool call
  card itself**. The two coexist in the same message flow: reasoning → tool
  call(s) → reasoning → … → final answer.
- One assistant turn renders as an ordered sequence of parts: reasoning, tool
  calls (each its own card, in execution order), then the markdown answer.
  Several tool calls in a row is the norm — browser tasks average ~4 calls per
  user-visible action (snapshot → act → wait → snapshot). Turns are capped at
  35 steps (60 when browser-control is enabled), so a feed of 20–60 cards is a
  realistic worst case the design must stay readable at.

## 2. Lifecycle of a single tool call — what data arrives when

Each tool call is a streamed object whose `state` advances **in place**:

| Phase | `state` | Data available at this moment |
|---|---|---|
| Model is writing the call | `input-streaming` | Tool name, call id, **partial** input args (grow token by token) |
| Tool is executing | `input-available` | Full input args. This is the "running" window — from &lt;100 ms (click) to 30 s (wait_for timeout) |
| Finished OK | `output-available` | Full result object (see catalog, §4) |
| Threw an exception | `output-error` | `errorText` string (rare — see §3) |

Also always present: `toolCallId` (unique id; links a delegating tool to its
nested sub-agent trace) and the tool name.

Surrounding signals the UI already has, per card:

- **Is this the current step?** A card is "live" if its state isn't terminal
  yet, or it's the last part of a still-streaming message. The moment a newer
  part appears after it (next tool call, or answer text), it's superseded.
- **Position in sequence** (1st, 2nd, … call of the turn) — derivable today.
- **Is the whole turn still active?** Yes/no flag exists.

**Not in the data today:** timestamps, durations, per-call token cost.
Duration/elapsed-time **[needs code change — easy]**: record time at the
`input-available → output-available` transition. Design may assume "elapsed
timer while running" and "took 1.2 s when done" are available. Per-call token
cost is **not** attainable (usage is only reported per turn) — do not design
for it.

## 3. Success vs failure — two channels, one concept

Tools in this project are written to **never throw**. On failure they return a
normal result containing `{ error: "…message…" }` (state still ends
`output-available`). The SDK's `output-error`/`errorText` channel exists but
almost never fires. So:

- A card is **failed** if `state === 'output-error'` **or** the output object
  has an `error` string. Both must get the same failed treatment.
- Error messages are written to be self-corrective and human-readable, e.g.
  `"Cannot access the current tab: … Tell the user to open the page they want
  analyzed, click the extension icon on that tab to grant access, then ask
  again."` — they're worth showing, not hiding behind a generic "failed".
- Failures are **normal and recoverable**: the agent usually retries with a
  fix (e.g. stale element uid → re-snapshot → retry). A failed card is a
  yellow-flag moment for the monitoring user, not a catastrophe. Consecutive
  fail→retry→success sequences of the same tool are common and could be
  acknowledged by the design.

## 4. Tool catalog — inputs, outputs, and the "one-liner" material

Almost every tool has a **primary argument** that makes a perfect collapsed
one-line summary, and most browser-control results end with the postcondition
`{ url, title, navigated }` ("where the browser is now"), which supports a
consistent "→ now at *Page Title*" affordance across tools.

### Page tools (passive reading, no side effects)

| Tool | Input | Output | One-liner material |
|---|---|---|---|
| `get_page_info` | — | `{ title, url }` | the page title/host |
| `read_page_content` | — | `{ excerpt/content… }` (article text; can be long) | title + content length |
| `get_selected_text` | — | `{ selectedText }` | first words of selection |

### Browser control — observation

| Tool | Input | Output | Notes |
|---|---|---|---|
| `take_snapshot` | `{ mode?: 'interactive'|'full' }` | `{ url, title, tree, headings, nodeCount, truncated }` | `tree` = uid-tagged element list (multi-line text, e.g. `[e3_12] <button> "Submit"`); `headings` = page h1–h3. `nodeCount` + `truncated` make a great summary ("42 elements") |
| `take_screenshot` | — | `{ image: base64, mediaType }` | The visual case — render as an image/thumbnail, never as text |
| `evaluate_script` | `{ expression }` | `{ value }` (JSON string) | code-in → value-out |
| `wait_for` | `{ text?, selector?, timeoutMs? }` | `{ found, waitedMs, url, title }` | The genuinely slow one (up to 30 s). `found: false` is a soft miss, not an error. `waitedMs` is real timing data that exists TODAY |

### Browser control — actions (each returns `{ navigated, url, title }`)

| Tool | Input | One-liner material |
|---|---|---|
| `navigate_page` | `{ url }` | the destination host/URL |
| `navigate_history` | `{ direction: 'back'|'forward' }` | back / forward |
| `click` | `{ uid, dblClick? }` | which element (uid; see §7 for readable labels) |
| `hover` | `{ uid }` | element |
| `fill` | `{ uid, value }` | `value` into element |
| `fill_form` | `{ fields: [{uid, value}…] }` | "5 fields" — a natural mini-list when expanded |
| `press_key` | `{ key }` | the key ("Enter") |
| `scroll_to` | `{ uid }` | element |

### Browser control — tabs

| Tool | Input | Output |
|---|---|---|
| `list_tabs` | — | `{ tabs: [{ id, index, title, url, active, isTarget }…] }` — renders naturally as a small list/table |
| `select_tab` | `{ tabId }` | the selected tab's info |
| `new_tab` | `{ url? }` | new tab info |
| `close_tab` | `{ tabId? }` | `{ ok: true }` |

### Delegating tools (sub-agents) — the rich nested case

Currently one: `jira_ticket_review` (more skills coming; design the pattern,
not the instance).

- **Input:** `{ task: "…" }` — a prose task description written by the parent
  agent. Very displayable.
- **Output:** the sub-agent's final answer as **markdown text** (not JSON).
- **While running**, a live trace streams alongside, matched to the card by
  `toolCallId`:
  ```
  { label: "Jira ticket review",
    status: "running" | "done" | "error",
    steps: [
      { kind: "reasoning", text: "…grows as it thinks…" },
      { kind: "tool", toolName, state, input, output, errorText }  // same lifecycle as §2
    ] }
  ```
  This is a **whole nested timeline** — the child's own thinking and tool
  calls, updating live inside the parent card. Step counts ("3 steps") are
  derivable. Sub-agents run up to 10–12 internal steps.
- The existing implementation auto-expands this card while the sub-agent works
  and collapses it when done — the proven precedent for §6.

## 5. Content types the expanded view must handle

1. **JSON objects** (most inputs/outputs) — small, 1–6 keys typically.
2. **Long text blocks** — snapshot `tree`/`headings`, `read_page_content`
   (currently truncated at ~2000 chars for display).
3. **Images** — screenshot base64 data-URL (already special-cased today as a
   click-to-open-full-size thumbnail).
4. **Tabular lists** — `list_tabs`, `fill_form` fields.
5. **Markdown** — sub-agent final answers.
6. **Error strings** — multi-sentence, instructional (§3).
7. **The postcondition** `{ url, title, navigated }` — worth treating as its
   own first-class element rather than raw JSON, since ~10 tools share it.

## 6. The evolving card — expand while live, collapse when superseded

Desired behavior (mechanism proven by the existing sub-agent card):

1. **On appearance** a card is live and should be open/prominent by default —
   the user sees args stream in and the running state.
2. **While running** it is the progress surface: full args, running indicator,
   elapsed time **[needs code change]**, live progress detail **[needs code
   change, §7]**, and for delegating tools the nested trace growing step by
   step.
3. **When superseded** (the next part starts — not merely when its own result
   lands, since most calls finish in well under a second and instant collapse
   would flash/jitter) it tidies back to its compact one-liner. Each step thus
   gets a stable, readable window while it is the newest thing.
4. **Manual toggles win**: once the user opens/closes a card themselves, stop
   auto-driving that card.
5. **History is calm**: completed cards in scrollback and everything after a
   reload render collapsed. Only live turns animate. A 60-card transcript must
   scan as a compact timeline.

## 7. Attainable enhancements — design for these, we'll build them

Confirmed feasible with small-to-medium code changes; none are speculative:

- **Duration + elapsed timer** — timestamp state transitions. *(easy)*
- **Live progress phases during one call** — the streaming channel used by
  sub-agent traces generalizes: any tool can emit progress events keyed to its
  `toolCallId` while executing. Realistic phase strings:
  - `navigate_page`: "navigating…" → "waiting for page load…"
  - `wait_for`: "waiting for 'Order confirmed'… (3.2 s)" with live elapsed
  - `fill_form`: "filling field 2 of 5…"
  - `read_page_content`: "extracting article…" / "served from cache"
  *(medium; per-tool wiring)*
- **Human-readable element labels instead of uids** — inputs reference
  elements as `e3_12`, meaningless to users. The snapshot that produced the
  uid knows the element's role and text (`<button> "Submit"`), so calls can be
  labeled "click **Submit** button" rather than "click e3_12". *(medium; high
  UX value — assume it exists)*
- **Derived one-liner summaries** (`navigate_page → example.com`,
  `fill → 'Ada' into Name`, `take_snapshot → 42 elements`) — pure
  presentation-layer helpers over §4. *(easy)*
- **Step counter within the turn** ("step 12", optionally against the 35/60
  budget) — derivable from data already present. *(easy)*
- **Cache indicator** — `read_page_content` results can be served from a 2-min
  cache; instant-return could be marked as such. *(easy)*
- **Grouping/phase awareness** — consecutive tool calls between two reasoning
  blocks form a natural "action burst"; sequence order is already known, so
  the design may treat runs of calls as a unit if useful.

**Not attainable / out of scope:** per-call token cost, network internals,
model-side timings. And per explicit product direction, avoid raw technical
noise: exact ISO timestamps, IPs, call ids as visible text. Human-relative,
compact detail only ("2.1 s", "step 4", "42 elements").

## 8. Existing visual context (for reference, not constraint)

- The current card: a small status square (running=spinner / ok=check /
  failed=x), a mono tool name, an expandable body with raw
  key-over-value blocks (`input` / `output` / `error`), screenshots as
  thumbnails, sub-agent cards with an accent border, a step-count meta label,
  and chevron affordance. It works but is minimal and developer-flavored.
- The panel is the "J Chat v2" design system: dark/light theming via CSS
  custom properties (`--accent-text`, `--ok`, `--err-text`, `--faint`, …), a
  narrow side-panel viewport (~360–480 px wide). Tool names are currently
  shown as raw snake_case; a friendly-name mapping layer already exists and
  can carry any naming the design wants.
- The design agent owns all layout/visual decisions, including whether the
  "dropdown" stays a dropdown at all — the data contract above is the only
  hard constraint.

## 9. Summary of design-relevant states per card

Every card design must have an answer for each of:

1. `input-streaming` — args still arriving (often <1 s, can be skipped
   visually if too flashy).
2. Running — full args, in progress (sub-second to 30 s; the elastic state).
3. Success — with a type-appropriate result (JSON / text / image / table /
   markdown / postcondition).
4. Soft failure — `output.error` present, instructional message, agent will
   likely retry.
5. Hard failure — `output-error` + `errorText` (rare).
6. Delegating tool — all of the above **plus** a live nested trace
   (reasoning + child tool calls) and a markdown final answer.
7. Collapsed/history form — the one-liner it tidies into.
8. Live vs superseded vs user-pinned expansion state (§6).
