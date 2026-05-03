import { Agent12Schema, type Agent12Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent12Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-12-prompt.md');
  return promptCache;
}

/**
 * Agent 12 — Volume Pattern Specialist (Sonnet).
 *
 * Hard abstain when volume pane is illegible (don't fabricate volume reads).
 */
export async function runAgent12(input: RunAgent12Input): Promise<Agent12Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent12Schema,
    maxTokens: 500,
  });
}

export function _resetAgent12Cache(): void { promptCache = null; }
