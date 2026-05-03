import { Agent25Schema, type Agent25Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent25Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-25-prompt.md');
  return promptCache;
}

/**
 * Agent 25 — Disqualifier Catalog (Opus, VETO YES).
 *
 * Owns V1, V5, V7, V8, V9, V11. Defers V2/V3/V4/V6/V10 to owner agents
 * (22/07/23/14/06). Avoids double-veto.
 */
export async function runAgent25(input: RunAgent25Input): Promise<Agent25Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent25Schema,
    maxTokens: 600,
  });
}

export function _resetAgent25Cache(): void { promptCache = null; }
