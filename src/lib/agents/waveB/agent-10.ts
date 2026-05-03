import { Agent10Schema, type Agent10Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent10Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-10-prompt.md');
  return promptCache;
}

/**
 * Agent 10 — Wick Analysis Specialist (Sonnet, base composite contributor).
 *
 * Pairs with Agent 04 (cloud penetration) as the wick-penetration factor
 * in Wave E composite (60/40 split with Agent 04). Sets also_canonical_pattern
 * flag for Wave E dedupe with Agent 09.
 */
export async function runAgent10(input: RunAgent10Input): Promise<Agent10Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent10Schema,
    maxTokens: 500,
  });
}

export function _resetAgent10Cache(): void { promptCache = null; }
