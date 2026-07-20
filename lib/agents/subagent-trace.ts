/**
 * Serializable record of a sub-agent's live activity (its reasoning + internal
 * tool calls), streamed to the UI as a `data-subagent` message part and
 * reconciled by the delegating tool's call id. Must stay plain JSON — it is
 * structured-cloned per stream tick and persisted to IndexedDB.
 */

export type SubagentToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export type SubagentStep =
  | { kind: 'reasoning'; id: string; text: string }
  | {
      kind: 'tool';
      toolCallId: string;
      toolName: string;
      state: SubagentToolState;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

export interface SubagentTrace {
  /** The PARENT tool call this trace belongs to (used to nest it in the UI). */
  toolCallId: string;
  /** Human label for the sub-agent, e.g. "Jira ticket review". */
  label: string;
  status: 'running' | 'done' | 'error';
  steps: SubagentStep[];
}
