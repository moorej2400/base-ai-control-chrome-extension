# Fresh Page Context Instruction

## Problem

The embedded agent can answer a page-dependent follow-up from earlier tool
results without inspecting the page again. For example, after the page changed,
the question `5% too low?` received an answer based on conversation history and
made no page-reading or snapshot tool call.

## Design

Strengthen the base system prompt so page observations are turn-scoped:

- Before answering any question whose answer could depend on the current page
  or visible UI state, inspect the page during that same turn.
- Never treat page observations from previous turns as current state.
- "Fresh inspection" means a new page-inspection tool invocation in the current
  turn; repeating or reasoning from a previous turn's tool output does not
  satisfy the instruction.
- Use `take_snapshot` for dynamic or interactive UI and `read_page_content` for
  document or article content.
- A fresh inspection is mandatory after navigation, browser-control actions,
  user interaction, or any other possible page update.
- If the available tools cannot inspect the current page, say so rather than
  guessing.

This change affects the embedded agent's base instruction only. It does not
change the browser-control protocol, tool execution, or the internal two-minute
page-content cache. Dynamic UI validation therefore uses `take_snapshot`, which
is uncached; revising page-content cache semantics is a separate change.

## Validation

- Add a prompt regression test covering an implicit page-dependent follow-up,
  not only explicit phrases such as "this page."
- Run the focused test, the unit suite, and TypeScript compilation.
- Reload the real extension, observe a page, change its visible state, then ask
  an implicit follow-up such as `5% too low?`. Verify that the assistant invokes
  a page-inspection tool in that same turn before answering and bases its answer
  on the updated state.
