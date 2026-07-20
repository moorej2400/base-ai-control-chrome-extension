import type { SubagentTrace } from '@/lib/agents/subagent-trace';
import ToolChipView, { toolLabel } from './ToolChipView';

/**
 * Renders a sub-agent's live trace nested under its delegating tool chip: the
 * child's streamed reasoning blocks interleaved with cards for each internal
 * tool call. The cards reuse ToolChipView so they look like top-level calls.
 */
export default function SubAgentPanel({ trace }: { trace: SubagentTrace }) {
  return (
    <div className="subagent-rail">
      {trace.steps.length === 0 && (
        <div className="subagent-empty">
          {trace.status === 'running' ? 'Starting…' : 'No activity'}
        </div>
      )}
      {trace.steps.map((step) =>
        step.kind === 'reasoning' ? (
          <div key={step.id} className="subagent-reason">
            {step.text || 'Thinking…'}
          </div>
        ) : (
          <ToolChipView
            key={step.toolCallId}
            name={toolLabel(step.toolName)}
            state={step.state}
            input={step.input}
            output={step.state === 'output-available' ? step.output : undefined}
            errorText={step.errorText}
          />
        ),
      )}
    </div>
  );
}
