import { Agent21Schema, type Agent21Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent21Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-21-prompt.md');
  return promptCache;
}

/**
 * Agent 21 — Market Internals / Correlated Asset Specialist (Sonnet).
 * Hard abstain when no multi-symbol context provided.
 */
export async function runAgent21(input: RunAgent21Input): Promise<Agent21Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent21Schema,
    maxTokens: 500,
  });
}

export function _resetAgent21Cache(): void { promptCache = null; }
