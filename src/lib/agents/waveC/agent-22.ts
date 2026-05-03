import { Agent22Schema, type Agent22Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent22Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Optional pasted event-calendar context. */
  eventContext?: string;
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-22-prompt.md');
  return promptCache;
}

/**
 * Agent 22 — News & Event Risk Specialist (Opus 4.7, VETO YES).
 *
 * Veto fires at score <= 30. Event taxonomy with ±30/15/0 min hard
 * windows per spec section 7. Calendar context optional but improves
 * confidence; precautionary downgrade on known event-days.
 */
export async function runAgent22(input: RunAgent22Input): Promise<Agent22Output> {
  const userInstruction = input.eventContext
    ? `Event context:\n${input.eventContext}\n\nScore the event-proximity risk for this chart. JSON only.`
    : 'No event context provided. Apply precautionary heuristics from your instructions. JSON only.';

  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent22Schema,
    maxTokens: 600,
    userInstruction,
  });
}

export function _resetAgent22Cache(): void { promptCache = null; }
