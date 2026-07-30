# Browser-control cursor harness review

Date: 2026-07-29

## Scope

Three independent read-only reviews compared:

- the latest AI Page Chat implementation in
  `/private/tmp/base-ai-control-dual-client`;
- the downloaded Codex extension in
  `/Users/jaredmoore/Downloads/hehggadaopoacecdllhhajmbjkdcmajg`;
- the installed Codex browser runtime only where the extension proved that
  cursor/action ordering lived outside the extension.

The downloaded artifact is Codex MV3 version 1.1.5. It is a minified installed
artifact without Git metadata or source maps. The generic `codex-cli` launcher
does not contain cursor orchestration. Relevant host-side ordering is in the
installed Chrome plugin's `scripts/browser-client.mjs`.

No implementation files were changed by the review agents.

## Executive conclusion

The custom SVG is not the primary cause of the lackluster cursor experience.
AI Page Chat already has a sound coordinate contract: the visible cursor and
trusted CDP input use the same mapped action point, including transformed iframe
coordinates.

The main discrepancy is orchestration:

- AI Page Chat moves the cursor only for click, hover, fill, each `fill_form`
  field, and referenced `scroll_to`.
- It does not provide cursor state for snapshots, waits, navigation, history,
  tab changes, key presses, page transitions, or action planning.
- The first move teleports. Later moves use two frames for short distances or a
  fixed 13-frame path.
- Full document navigation or reload removes the overlay, which returns only
  when a later pointer action triggers lazy reinjection.
- Turn end does not hide the cursor, cancel queued input, or detach the debugger.

Codex does not move its cursor for every tool either. It moves for
pointer-semantic operations. The difference is that Codex treats the cursor as
first-class per-session and per-tab state. Its browser runtime explicitly waits
for visible cursor motion before trusted pointer input, while the overlay adds
spring motion, short and long path modes, visibility state, idle thinking
motion, retained-state replay after reinjection, and turn-scoped cleanup.

## Architecture comparison

### AI Page Chat

```text
Embedded agent or MCP client
  -> shared router and coordinator
  -> tab lease and per-tab mutation queue
  -> CDP driver
  -> resolve opaque reference
  -> scroll target into view
  -> recompute and hit-test final coordinates
  -> publish cursor move
  -> await cursor arrival or timeout
  -> dispatch trusted CDP input
```

Both embedded and MCP clients converge on the same coordinator, lease policy,
queue, and driver. This is a strong design and should remain.

Primary evidence:

- `lib/chat/transport.ts:45-137`
- `packages/browser-bridge/src/mcp/server.ts:16-49`
- `packages/browser-bridge/src/mcp/session.ts:15-55`
- `lib/agent-tools/browser-control/background/coordinator.ts:37-50`
- `lib/agent-tools/browser-control/driver/cdp/cdp-driver.ts:312-363`
- `lib/agent-tools/browser-control/driver/cdp/coordinate-mapper.ts:23-39`
- `lib/agent-tools/browser-control/driver/cdp/input.ts:7-55`

### Codex

```text
Browser action handler
  -> resolve viewport target
  -> await moveMouse(session, turn, tab, x, y)
  -> native-host JSON-RPC
  -> extension publishes AGENT_CURSOR_STATE
  -> overlay animates with spring or Bezier motion
  -> overlay sends AGENT_CURSOR_ARRIVED
  -> moveMouse returns
  -> runtime dispatches trusted CDP pointer input
```

The extension exposes cursor transport and generic CDP transport as separate
channels. The installed browser runtime enforces their ordering with explicit
`await` chains. The extension alone does not define all high-level tool
choreography.

Primary evidence:

- `/Users/jaredmoore/.codex/plugins/cache/openai-bundled/chrome/26.721.41059/scripts/browser-client.mjs:3229`
  (`lp.clickPoint`)
- the same file at line 3239 (`gp.moveMouse`)
- the same file at line 3239 (`Ep.moveMouse`)
- `/Users/jaredmoore/Downloads/hehggadaopoacecdllhhajmbjkdcmajg/background.js:5`
  (`nn.moveMouse`, minified)
- `/Users/jaredmoore/Downloads/hehggadaopoacecdllhhajmbjkdcmajg/content-scripts/codex.js:1`
  (`Yn.setState`, `Xn`, `Kn`, `te`, `ne`, `me`, and `et`, minified)

## What AI Page Chat already does well

1. Embedded and MCP control share one authority and one browser driver.
2. Opaque references are bound to session, tab, and document revision.
3. Target resolution recomputes geometry and performs a hit test before input.
4. The cursor and CDP input receive the same final `ActionPoint`.
5. CDP input is trusted browser input, not synthetic DOM input.
6. Debugger attachment changes and tab mutations are serialized.
7. Tab leases fail closed when another session owns the tab.
8. The overlay is pointer-inert, accessibility-hidden, closed-shadow, lazy, and
   self-repairing.
9. Normal MCP shutdown releases turn and session state.

The coordinate mapping is structurally stronger than the Codex extension's two
independent `moveMouse` and generic CDP channels. Preserve it when adding a
choreography layer.

## Findings

### P1 — Cursor coverage is too narrow

Cursor publication exists only for click, hover, fill, repeated `fill_form`
fields, and referenced scroll operations:

- `lib/agent-tools/browser-control/driver/cdp/cdp-driver.ts:312-363`
- `lib/agent-tools/browser-control/driver/extension/extension-driver.ts:304-337`

It is absent from:

- snapshots and screenshots;
- waits;
- navigation and history;
- tab selection and tab creation;
- key presses;
- page-transition state;
- target-resolution or action-planning state.

The cursor therefore shows the final target of a small subset of mutations. It
cannot show token-level model attention, and it should not claim to. It can,
however, show honest semantic states such as observing, resolving a target,
moving, acting, waiting, navigating, and complete.

### P1 — Lifecycle cancellation does not fence input

`turn.cancel` behaves like `turn.end`: it removes the turn identifier but does
not cancel queued or in-flight tab work. `TabQueue.cancel` exists but has no
production caller. The UI Stop action aborts the model stream but does not
guarantee that already queued browser input stops.

Evidence:

- `lib/agent-tools/browser-control/background/coordinator.ts:94-99`
- `lib/agent-tools/browser-control/background/coordinator.ts:164-191`
- `lib/agent-tools/browser-control/background/coordinator.ts:275-285`
- `lib/agent-tools/browser-control/background/tab-queue.ts:24-49`
- `lib/chat/transport.ts:86-137`
- `entrypoints/sidepanel/screens/ChatScreen.tsx:164-173`

Impact: input can occur after Stop, a model error, turn cancellation, or session
replacement.

### P1 — Cursor arrival has a race

`CursorState.publish` sends the cursor move before it registers the pending
arrival waiter:

- `lib/agent-tools/browser-control/background/cursor-state.ts:19-33`

Cursor delivery and arrival are independent for every move because the content
listener starts `cursor.move()` without awaiting it. Reduced-motion handling
makes the race easiest to trigger because it can move and acknowledge
synchronously:

- `lib/agent-tools/browser-control/overlay/cursor-controller.ts:31-38`

The acknowledgement can arrive before the waiter exists. It is then discarded,
and the browser action waits for the 900 ms timeout. This can make a correct
cursor feel delayed or detached from the click.

### P1 — Scroll choreography is out of order

CDP target resolution calls `DOM.scrollIntoViewIfNeeded` before the cursor
moves:

- `lib/agent-tools/browser-control/driver/cdp/target-resolver.ts:20-55`
- `lib/agent-tools/browser-control/driver/cdp/cdp-driver.ts:359-363`

The page can move before the cursor explains why it moved. The fallback driver
has the opposite mismatch: it can measure and publish before a later injection
scrolls the target.

Scroll preparation, stable layout, final coordinate resolution, cursor motion,
and trusted input should be one ordered choreography.

### P1 — Cursor visibility and debugger cleanup are not turn-scoped

AI Page Chat attaches CDP when a tab is claimed and usually keeps it until tab,
session, or connection release. `turn.end` removes only the turn. It sends no
cursor hide state.

Evidence:

- `lib/agent-tools/browser-control/background/coordinator.ts:70-77`
- `lib/agent-tools/browser-control/background/coordinator.ts:164-191`
- `lib/agent-tools/browser-control/driver/cdp/attachment-manager.ts:53-68`
- `lib/agent-tools/browser-control/driver/cdp/attachment-manager.ts:120-140`

Codex ends the turn by detaching debuggers, stopping cursor publication,
releasing active-turn leases, and clearing the logical active tab. It also has
heartbeat cleanup for abandoned targets.

This finding supports detaching the debugger and hiding the cursor after the
assistant finishes its browser-control turn, then attaching again when a later
turn needs browser control.

### P1 — Background-tab control is cursor-silent

Selecting or claiming a tab changes the driver target but does not activate the
Chrome tab. Cursor publication reports hidden unless that tab is active.

Evidence:

- `lib/agent-tools/browser-control/driver/cdp/cdp-driver.ts:178-184`
- `entrypoints/background.ts:81-86`

An MCP or embedded agent can therefore control a leased background tab without
showing a cursor. The product needs an explicit contract: either activate the
target tab before visible pointer input or report that the action is running in
a background tab without a visible cursor.

### P2 — Motion is too short and too uniform

The first target appears immediately. Later moves use two frames below 24 px or
a fixed 13-frame Bezier:

- `lib/agent-tools/browser-control/overlay/cursor-controller.ts:31-37`
- `lib/agent-tools/browser-control/overlay/cursor-path.ts:6`

Codex uses:

- a default viewport starting position;
- spring-based short movement;
- bounds-aware long Bezier paths;
- distance-based response;
- rotation, stretch, blur, and drag deformation;
- visibility animation and short idle thinking motion;
- arrival thresholds based on position and velocity.

The CSS wobble improves the glyph but does not compensate for sparse motion.

### P2 — Navigation loses cursor continuity

A new document removes the overlay. AI Page Chat reinjects it only after the
next delivery attempt fails:

- `lib/agent-tools/browser-control/driver/cdp/navigation.ts:9`
- `lib/agent-tools/browser-control/background/cursor-sender.ts:18-29`

Codex stores per-session and per-tab cursor state. After a failed overlay ping,
the background lazily reinjects the content script; the script then requests
and replays retained state. The downloaded manifest does not prove automatic
document-start injection.

### P2 — MCP guidance is too weak

All MCP tools use the same permissive passthrough schema and short descriptions:

- `packages/browser-bridge/src/mcp/server.ts:8`
- `packages/browser-bridge/src/mcp/server.ts:39-46`
- `packages/browser-bridge/src/mcp/tools.ts:3-24`

The MCP model is not told which fields are required, how fresh references work,
which actions move the cursor, or how to recover from stale references. Both
client paths share the same execution harness, but the MCP path gives the model
less reliable tool guidance.

### P2 — Recovery and state cleanup are incomplete

- Abnormal MCP IPC loss is not associated with the sessions created through
  that socket.
- Orphan-expiry and recovery helpers exist but are not wired into the
  background entry point.
- Progress stages are defined but never emitted.
- Cursor and some CDP per-session state are not fully cleared at session end.
- Older references in the same document are not invalidated by a newer
  snapshot.

Evidence:

- `packages/browser-bridge/src/ipc/server.ts:36-59`
- `lib/agent-tools/browser-control/background/session-store.ts:170-179`
- `lib/agent-tools/browser-control/background/recovery.ts:10-18`
- `packages/browser-control-protocol/src/envelope.ts:85-94`
- `lib/agent-tools/browser-control/driver/cdp/node-references.ts:40-55`

## Recommended behavior contract

| Operation | Cursor behavior |
|---|---|
| Turn starts with browser control | Attach debugger, reveal cursor at its last valid point or a default viewport point, and enter a brief observing state. |
| Snapshot or page read | Keep the cursor visible with a bounded thinking/observing motion. Do not invent a target. |
| Target resolution | Publish a resolving stage tied to the reference. |
| Click, hover, fill, or select | Resolve final coordinates, move visibly, await arrival, then dispatch trusted input from the same action point. |
| Scroll to target | Prepare scroll, wait for layout stability, recompute the point, move the cursor, then dispatch the scroll or pointer action. |
| Key press or typing | Keep the cursor at the actual focused element and show a small focus/activity cue; do not move to an arbitrary point. |
| Navigation | Fade or hide during document replacement, reinject on the new document, then restore observing state. |
| Tab change | Hide on the old tab and reveal only on the active controlled tab. |
| Wait | Use a subtle bounded thinking state at the last valid point. |
| Turn completes, stops, or fails | Cancel queued input, hide the cursor, detach debugger attachments, release turn-scoped ownership, and clear arrival waiters. |

## Recommended implementation order

### Phase 1 — Correctness and lifecycle

1. Associate queued work with session and turn.
2. Cancel queues and propagate `AbortSignal` on Stop, error, turn end, session
   end, and disconnect.
3. Register the cursor arrival waiter before sending the move.
4. Detach the debugger and hide cursor state at turn completion.
5. Define active-tab behavior for visible pointer control.
6. Wire orphan expiry and abnormal MCP socket cleanup.

### Phase 2 — Action choreography

1. Add one `CursorActionPlan` or equivalent layer for pointer-bearing actions.
2. Split target scrolling from target resolution.
3. Use one atomic `moveCursorAndDispatchPointer` primitive with one
   `ActionPoint`.
4. Emit semantic progress stages: observing, resolving, cursor, input,
   settling, complete.
5. Restore cursor state after navigation and tab activation.

### Phase 3 — Motion quality

1. Give the first move a default or last-known starting point.
2. Add distance-based duration.
3. Use a spring scoot for short moves and bounds-aware Bezier paths for long
   moves.
4. Add visibility and bounded thinking motion.
5. Preserve reduced-motion behavior.

### Phase 4 — MCP contracts and verification

1. Replace the generic MCP schema with per-tool schemas and examples.
2. Document fresh-reference recovery and cursor semantics.
3. Add automated checks for cursor position, arrival ordering, and tool
   coverage on both embedded and MCP paths.

## Required tests

- Synchronous arrival before `send()` returns.
- No CDP input before cursor arrival or classified timeout.
- Stop or turn end during a queued action.
- Model abort or error after `startTurn`.
- Live assertion of cursor audit coordinates for embedded actions.
- Equivalent cursor assertions through MCP.
- Offscreen fallback target with post-scroll coordinate comparison.
- Explicit tool-by-tool cursor behavior contract.
- Navigation reinjection and cursor state replay.
- Background-tab visibility behavior.
- Stale and out-of-order cursor sequences.
- Concurrent cursor moves.
- Abnormal MCP process or IPC loss with lease release.
- Two snapshots in one document with first-snapshot reference rejection.
- Service-worker restart and recovery.

## Final assessment

AI Page Chat is using its cursor correctly where it is currently wired: the
cursor reaches the same final point that trusted CDP input uses. The problem is
that the wiring is too narrow and the cursor is not owned by the same
turn/session lifecycle as the browser action.

The highest-value work is not another cursor icon change. It is:

1. lifecycle fencing and debugger cleanup;
2. one shared action-choreography layer;
3. session/tab cursor state across navigation;
4. richer distance-based motion;
5. stronger MCP tool schemas and parity tests.
