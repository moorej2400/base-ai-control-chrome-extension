import { useEffect, useRef, useState } from 'react';
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from 'ai';
import type { SubagentTrace } from '@/lib/agents/subagent-trace';
import ToolChipView, { toolLabel } from './ToolChipView';
import SubAgentPanel from './SubAgentPanel';

export default function ToolCallChip({
  part,
  subagent,
}: {
  part: ToolUIPart | DynamicToolUIPart;
  subagent?: SubagentTrace;
}) {
  const name = toolLabel(getToolName(part));
  const output = part.state === 'output-available' ? part.output : undefined;
  const errorText =
    part.state === 'output-error' ? part.errorText : undefined;

  // Plain tool call — no delegated sub-agent.
  if (!subagent) {
    return (
      <ToolChipView
        name={name}
        state={part.state}
        input={part.input}
        output={output}
        errorText={errorText}
      />
    );
  }

  return (
    <SubagentChip
      name={name}
      state={part.state}
      output={output}
      errorText={errorText}
      subagent={subagent}
    />
  );
}

/**
 * A delegating tool chip with a nested sub-agent trace. Auto-expands while the
 * child works, then collapses to a one-line summary once it finishes (mirrors
 * the thinking panel's tidy-up). Stays user-toggleable throughout.
 */
function SubagentChip({
  name,
  state,
  output,
  errorText,
  subagent,
}: {
  name: string;
  state: ToolUIPart['state'];
  output?: unknown;
  errorText?: string;
  subagent: SubagentTrace;
}) {
  const [open, setOpen] = useState(true);
  const prevStatus = useRef(subagent.status);
  useEffect(() => {
    if (prevStatus.current === 'running' && subagent.status !== 'running') {
      setOpen(false);
    }
    prevStatus.current = subagent.status;
  }, [subagent.status]);

  const toolSteps = subagent.steps.filter((s) => s.kind === 'tool').length;
  const meta = `${toolSteps} ${toolSteps === 1 ? 'step' : 'steps'}`;

  return (
    <ToolChipView
      name={name}
      state={state}
      output={output}
      errorText={errorText}
      meta={meta}
      accent
      open={open}
      onToggleOpen={setOpen}
    >
      <SubAgentPanel trace={subagent} />
    </ToolChipView>
  );
}
