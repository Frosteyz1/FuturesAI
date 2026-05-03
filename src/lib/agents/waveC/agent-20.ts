import { Agent20Schema, type Agent20Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent20Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-20-prompt.md');
  return promptCache;
}

/**
 * Agent 20 — Setup Freshness Specialist (Haiku, 350 tokens).
 *
 * Count-based, Haiku-tractable. Owns 15% of base composite (full
 * setup_freshness factor). Cascade discount: prior winners don't
 * count as staleness — protects multi-tap healthy trends.
 */
export async function runAgent20(input: RunAgent20Input): Promise<Agent20Output> {
  return invokeAgent({
    tier: 'haiku',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent20Schema,
    maxTokens: 350,
  });
}

export function _resetAgent20Cache(): void { promptCache = null; }
