import { Agent11Schema, type Agent11Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent11Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-11-prompt.md');
  return promptCache;
}

/**
 * Agent 11 — Momentum Decay Specialist (Sonnet).
 *
 * Pullback-fatigue scorer. Distinct from Agent 06 (trend-fatigue).
 * Wave E spec §5: Agent 06 × Agent 11 interact multiplicatively, not summed.
 */
export async function runAgent11(input: RunAgent11Input): Promise<Agent11Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent11Schema,
    maxTokens: 500,
  });
}

export function _resetAgent11Cache(): void { promptCache = null; }
