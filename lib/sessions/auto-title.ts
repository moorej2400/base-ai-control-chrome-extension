import { generateText } from 'ai';
import { selectEconomicalModelId } from '../providers/model-selection';
import { getProvider } from '../providers/registry';

/**
 * Best-effort LLM-generated session title after the first exchange.
 * Returns null on any failure — callers keep the fallback title.
 */
export async function generateSessionTitle(
  providerId: string,
  modelId: string,
  userText: string,
  assistantText: string,
): Promise<string | null> {
  try {
    const provider = getProvider(providerId);
    const titleModelId = await selectEconomicalModelId(providerId, modelId);
    const model = await provider.getModel(titleModelId);
    const { text } = await generateText({
      model,
      system:
        'Generate a very short title (3-6 words) for this conversation. ' +
        'Reply with ONLY the title — no quotes, no trailing punctuation.',
      prompt: `User: ${userText.slice(0, 500)}\n\nAssistant: ${assistantText.slice(0, 500)}`,
    });
    const title = text.trim().replace(/^["']+|["']+$/g, '').slice(0, 60);
    return title || null;
  } catch {
    return null;
  }
}
