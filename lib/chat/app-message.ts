import type { UIMessage } from 'ai';
import type { SubagentTrace } from '../agents/subagent-trace';

/**
 * The app's UIMessage type. Customizes only the data-parts generic so that
 * `data-subagent` parts (sub-agent live traces) are typed end-to-end through
 * the transport, `useChat`, and the rendering components.
 *
 * The TOOLS generic is intentionally left at its default: `streamText` emits
 * generic tool chunks, and narrowing TOOLS here would make the inferred chunk
 * type reject them.
 */
export type AppUIMessage = UIMessage<unknown, { subagent: SubagentTrace }>;
