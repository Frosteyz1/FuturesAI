import { Agent14Schema, type Agent14Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent14Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-14-prompt.md');
  return promptCache;
}

/**
 * Agent 14 — Failed-Bounce Detector.
 *
 * Production tier: Opus 4.7 (CONDITIONAL veto, high-stakes signal)
 * Veto authority: CONDITIONAL — score >= 85 AND confidence >= 75 -> hard veto
 *                              score 75-84 -> soft downgrade via downgrade_factor
 *
 * Highest-leverage anti-pattern detector. False-bounce trades are among
 * the most expensive losses for the user.
 */
export async function runAgent14(input: RunAgent14Input): Promise<Agent14Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent14Schema,
    maxTokens: 700,
  });
}

export function _resetAgent14Cache(): void { promptCache = null; }
