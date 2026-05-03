import { Agent18Schema, type Agent18Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent18Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-18-prompt.md');
  return promptCache;
}

/**
 * Agent 18 — Time-of-Day / Session Specialist (Haiku, 350 tokens).
 *
 * Deterministic lookup-table agent. Modulator multiplier into Wave E
 * context multipliers (per spec section 3).
 */
export async function runAgent18(input: RunAgent18Input): Promise<Agent18Output> {
  return invokeAgent({
    tier: 'haiku',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent18Schema,
    maxTokens: 350,
  });
}

export function _resetAgent18Cache(): void { promptCache = null; }
