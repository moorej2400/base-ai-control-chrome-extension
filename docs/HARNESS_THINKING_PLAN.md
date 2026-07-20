# Harness-Level Thinking Plan

A model-agnostic thinking system built into our agent harness: an optional
`think` tool (three prompted styles), a harness-owned `plan` scratchpad, and
deterministic harness-triggered reflection. Native model reasoning from the
Copilot API is **kept and always displayed** — the harness layer sits on top
of it, primarily for performance, secondarily for UX.

Status: planned. Step budget already raised (180 with browser-control, 35
ordinary) in `lib/chat/transport.ts`.

---

## Goals / non-goals

**Goals**

1. Every model in the harness produces legible, well-timed thinking —
   regardless of whether its API emits native reasoning.
2. Thinking is *conditional*: simple questions spend no thinking tokens;
   complex steps, complex requests, and failure streaks reliably trigger it.
3. Each "thinking session" carries its own one-line summary (headline) at zero
   extra model calls, so the UI can show a lasting compact form.
4. Long-horizon tasks expose a live plan the user can track ("step 3 of 7").
5. Thinking that matters most (after repeated failure) is **guaranteed by the
   harness**, not left to model discipline.

**Non-goals / invariants**

- **Never remove or suppress native model reasoning.** Reasoning parts
  emitted by the API (today: /responses-endpoint models) are always streamed
  to the UI, unchanged. If the copilot-cli investigation (§7) unlocks Claude
  reasoning over chat-completions, that is additive and always-on too.
- No branching/search strategies (ToT, MCTS, beam, self-consistency) in the
  action loop — browser actions are irreversible and Copilot is usage-billed.
- The think tool must not become mandatory narration on every step.

## Current state (baseline)

- Thinking UI = `ThinkingPill` rendering `reasoning` message parts.
  Native reasoning exists only for /responses models
  (`lib/providers/copilot/responses-model.ts`, flushed as one block, not
  token-streamed); chat-completions models (incl. Claude via Copilot) emit
  none today (§7 may change this).
- `MessageItem` consolidates all reasoning parts of a turn into ONE pill at
  the top — interleaving (think → act → think → act) is lost.
- System prompt has no thinking directives.
- Proven plumbing to reuse: `data-subagent` parts streamed via the
  `createUIMessageStream` writer and reconciled by `toolCallId`
  (`lib/chat/transport.ts`, `lib/agents/subagent.ts`).

---

## Phase 1 — the `think` tool

### Tool contract (extension-side)

New always-on core tool module (e.g. `lib/tools/think.ts`), registered for
every chat regardless of enabled modules (like the page module; not
user-toggleable initially).

```ts
think({
  headline: string,   // ≤ ~80 chars; the lasting one-line summary shown in UI
  thought: string,    // the full thinking session text
  kind?: 'decompose' | 'assess' | 'diagnose',  // optional; UI labeling only
})
```

- `execute` is a no-op returning a minimal ack (`{ noted: true }`) — the value
  of the tool is the *tokens the model wrote*, which land in context history
  and in the UI.
- `toModelOutput` returns a terse text ("Noted.") to keep result tokens ~zero.
- No driver, no side effects, no failure modes.

### Prompt directives (extension-side, `system-prompt.ts`)

Add a thinking section with **behavioral triggers**, not vibes:

1. **Complex request intake** → `kind: 'decompose'`, Step-Back style:
   restate the real goal, constraints, knowns/unknowns, sub-goals.
2. **Before a complex/risky step** → `kind: 'assess'`, grounded ReAct style:
   situation (facts from the last snapshot), goal for this step, candidate
   elements, decision, **expected outcome** (one sentence — enables
   predict-then-verify).
3. **After two failed attempts at the same goal** → `kind: 'diagnose'`,
   self-reflection style: expected vs actual, hypothesis for the cause, what
   changes. Hard rule: never repeat the same action a third time unchanged.

Plus the cost guard: do NOT call think for simple questions or routine steps;
never call it twice in a row without acting in between.

### Step budget

Think calls consume loop steps. Already covered: 180-step cap for
browser-control sessions. Revisit the ordinary 35-step cap only if intake
decomposition on plain chats proves worth it.

### UI (side-panel)

- Render `tool-think` parts as a **thinking session**, not a generic tool
  chip: while `input-streaming`, the `thought` text flows in live (tool inputs
  stream token by token — the "thoughts flow in and fade" concept from the
  design work); once superseded, collapse to the `headline`.
- Visually distinct from (and coexisting with) the native-reasoning pill.
  Native reasoning keeps its place unconditionally.
- Persisted automatically (it's a normal message part in IndexedDB).
- Ties into the tool-call dropdown revamp: a think session naturally *frames*
  the burst of tool calls that follows it (see
  `docs/TOOL_CALL_DROPDOWN_BRIEF.md` §7 "grouping").

### Validation (mandatory, live)

- Live bridge (`scripts/live.mjs`): drive real sessions with at least one
  /responses model (GPT-family) and one chat-completions model (Claude).
- Check adherence, not just plumbing:
  - simple question → **zero** think calls;
  - multi-step browser task → assess-thinks at sensible moments;
  - forced failure (e.g. stale uid / restricted page) twice → a diagnose-think
    appears before the third attempt.
- Confirm headlines are actually summary-quality; if models write filler
  headlines, iterate prompt wording before considering a summarizer model.

## Phase 2 — the plan scratchpad

Harness-owned plan state for long-horizon tasks; the model maintains it via
tools, the harness re-injects it and streams it to the UI.

### Tool contract (extension-side)

```ts
set_plan({ steps: string[] })                 // create/replace the plan
update_plan({
  index: number,
  status: 'in_progress' | 'done' | 'skipped' | 'failed',
  note?: string,                              // e.g. why skipped/failed
})
```

- Harness keeps the live plan in per-turn state inside the transport's
  `execute` scope.
- **Re-injection**: each step, the current plan (compact text form) is added
  to the model context (AI SDK `prepareStep` seam) so the plan survives long
  histories and keeps the model anchored.
- **UI streaming**: emit the evolving plan as a `data-plan` part via the
  stream writer (same pattern as `data-subagent`), so the panel renders a
  live checklist with statuses. Extend `AppUIMessage`'s data-part map.
- Prompt directive: for multi-step tasks (roughly ≥3 actions), set a plan
  after the intake think; update statuses as steps complete; revise the plan
  rather than silently deviating from it.

### Validation

Live bridge long task (e.g. multi-page browse-and-fill): plan appears, steps
tick through statuses, revisions render; plan text visible in context on
later steps (verify via debug logging that re-injection happens).

## Phase 3 — harness-triggered reflection (deterministic metacognition)

The piece that does not depend on model discipline: the **harness** decides
when reflection must happen.

- **Failure-streak detector** (transport, `onStepFinish`): track consecutive
  tool results whose output carries `{ error }` (our tools never throw — soft
  errors are the failure signal; see `docs/TOOL_CALL_DROPDOWN_BRIEF.md` §3).
  Threshold 2 within the same turn.
- **Long-run checkpoint**: every N steps (start: 25) in a browser-control
  turn without a plan update, treat as drift risk.
- **Action**: on trigger, inject a short system instruction for the next step
  (via `prepareStep`): "Stop. Call think(kind:'diagnose') before any further
  action: restate the goal, what you expected vs what happened, why it might
  be failing, and what you will change. Update the plan if it no longer
  matches." The model then thinks through the *existing* think tool — one
  mechanism, two initiators (model-chosen or harness-forced).
- Guard: at most one forced reflection per K steps to avoid loops.

### Validation

Live bridge with an intentionally failing scenario (restricted URL,
non-existent element): confirm the forced diagnose-think fires after the 2nd
failure and behavior changes on the 3rd attempt.

## Phase 4 — maximize native reasoning (kept 10000%)

### Claude native thinking — findings from the Copilot CLI investigation

A static analysis of the distributed Copilot CLI (npm `@github/copilot`
platform bundle + its Rust runtime + changelog) established how it gets rich
Claude thinking from the same API (high confidence on routing/fields; the
exact serialized request block needs a probe to confirm):

- **Copilot CLI never uses `/chat/completions` for Claude.** Claude models
  are routed to the **Anthropic Messages API proxied by Copilot:
  `POST /v1/messages`** on the same API host, with an `anthropic-version`
  header. GPT-5/o-series go to `/responses` (matches our adapter). That is
  why our chat-completions client sees no Claude reasoning — it isn't served
  there.
- **Thinking is enabled per-request** with an Anthropic-style thinking block
  (`thinking: { type: enabled|adaptive, budget_tokens: N }`); mode must match
  the model's capability flags (`adaptive_thinking` / `thinkingMode`) or the
  API returns HTTP 400. Effort levels: none/low/medium/high/xhigh.
- **Streaming shape**: display text arrives as `reasoning_text` deltas
  (summary-level, streamed incrementally); state arrives as
  `reasoning_opaque` + `encrypted_content`.
- **Critical for our tool loop**: `reasoning_opaque`/`encrypted_content`
  (or raw Anthropic `thinking`+`signature` blocks) **must be echoed back
  verbatim on every follow-up request** in a multi-step turn. Dropping them
  breaks Claude tool loops with 400 "thinking mismatch" errors.

### Implementation

- Build a **Copilot Anthropic-Messages adapter** alongside
  `responses-model.ts` (e.g. `anthropic-model.ts`): route Claude models to
  `/v1/messages` (gate on the model's `supportedEndpoints`/capabilities from
  the /models listing), send the thinking block, map `reasoning_text` deltas
  to AI SDK reasoning parts, and round-trip opaque state across steps.
- **Probe first, per project rule**: extend `scripts/copilot-probe.mjs` with
  a `/v1/messages` mode to confirm the exact request/response shapes (the
  one thing static analysis couldn't) before wiring the extension. Keep
  probes small — usage-billed.
- **Stream /responses summaries**: pass through summary deltas instead of
  one-block flushes in `responses-model.ts`, if the API provides them
  (validate with the probe).
- **UI interleaving fix**: render reasoning parts positionally (a pill per
  part, in sequence with tool calls) instead of consolidating all reasoning
  at the top of the turn — matches how think sessions render and restores
  the true think → act → think order.

## Sequencing & ownership

| Order | Work | Side |
|---|---|---|
| 1 | `think` tool + prompt triggers | extension-side |
| 2 | think-session rendering (stream-in, headline collapse) | UI |
| 3 | plan tools + re-injection + `data-plan` contract | extension-side |
| 4 | plan checklist rendering | UI |
| 5 | failure-streak + checkpoint reflection | extension-side |
| 6 | native-reasoning upgrades (Claude reasoning, streamed summaries) | extension-side |
| 7 | positional reasoning pills | UI |

Each extension-side stage defines the data contract (tool part shapes,
`data-plan`) before the UI stage consumes it, per the project's
extension-side/UI split.

## Risks & costs

- **Adherence variance**: models may under-call an optional think tool (worst
  exactly when failing) — mitigated by behavioral trigger wording + Phase 3
  forcing; must be validated per model family, live.
- **Over-thinking**: some models may narrate every step — mitigated by the
  cost guard directive; watch real usage via the existing usage store.
- **Token cost**: thoughts are billed output tokens; headlines avoid a second
  summarize call. Plan re-injection adds small input cost per step (compact
  text, bounded).
- **Context growth**: think thoughts accumulate in history; long tasks
  already flow through the context-pack summarization path — confirm thoughts
  summarize acceptably.
- **Step budget**: thinking + planning consume steps; 180 cap set for
  browser-control turns.

## Definition of done (per phase)

Type-check passes AND the phase's live-bridge scenario demonstrably works on
one /responses model and one chat-completions model, with results reported
per the project's validate-the-real-flow rule. "It compiles" is not done.
