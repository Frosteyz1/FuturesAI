import { Agent13Schema, type Agent13Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent13Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-13-prompt.md');
  return promptCache;
}

/**
 * Agent 13 — Bar-Level Quality Specialist (Sonnet, base composite contributor).
 *
 * Pairs with Agent 09 as the trigger body ratio factor in Wave E (35/65 split).
 */
export async function runAgent13(input: RunAgent13Input): Promise<Agent13Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent13Schema,
    maxTokens: 500,
  });
}

export function _resetAgent13Cache(): void { promptCache = null; }
