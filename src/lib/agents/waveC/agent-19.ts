import { Agent19Schema, type Agent19Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent19Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Top-K corpus candidates pre-retrieved by SQL kNN, passed as text. */
  candidatesContext: string;
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-19-prompt.md');
  return promptCache;
}

/**
 * Agent 19 — Comparable Historical Setup Specialist (Opus 4.7).
 *
 * THE SPINE OF THE SYSTEM. Per scope reframe, similarity-match against
 * the growing labeled corpus is the primary edge engine. Per Wave E
 * spec section 1.3, this agent abstaining caps final composite at 60.
 *
 * Note the API differs from other Wave 0/A/B agents: candidatesContext
 * is the runtime-supplied top-K corpus retrieval result that feeds
 * into the user message alongside the chart image.
 */
export async function runAgent19(input: RunAgent19Input): Promise<Agent19Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent19Schema,
    maxTokens: 800,
    userInstruction: input.candidatesContext +
      '\n\nGiven these corpus candidates and the current chart image, ' +
      'select up to 3 top matches per the rules in your instructions and ' +
      'output JSON only.',
  });
}

export function _resetAgent19Cache(): void { promptCache = null; }
