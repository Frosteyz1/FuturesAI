import { Agent09Schema, type Agent09Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent09Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-09-prompt.md');
  return promptCache;
}

/**
 * Agent 09 — Rejection Candle Specialist (Sonnet, base composite contributor).
 */
export async function runAgent09(input: RunAgent09Input): Promise<Agent09Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent09Schema,
    maxTokens: 500,
  });
}

export function _resetAgent09Cache(): void { promptCache = null; }
