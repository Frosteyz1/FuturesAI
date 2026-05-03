import { Agent17Schema, type Agent17Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent17Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-17-prompt.md');
  return promptCache;
}

/**
 * Agent 17 — Higher-Timeframe Alignment Specialist (Sonnet).
 * Hard abstain when no HTF screenshot provided.
 */
export async function runAgent17(input: RunAgent17Input): Promise<Agent17Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent17Schema,
    maxTokens: 500,
  });
}

export function _resetAgent17Cache(): void { promptCache = null; }
