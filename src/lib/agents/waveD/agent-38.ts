import { Agent38Schema, type Agent38Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent38Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-38-prompt.md');
  return promptCache;
}

/**
 * Agent 38 — Robustness / Input Quality Gate (Sonnet, runs in Wave 0).
 *
 * Pre-check for the orchestrator. If passed=false, pipeline returns
 * ABSTAIN_INPUT immediately. If degradation_flags populated, downstream
 * confidence is reduced.
 *
 * Note: lives in waveD/ folder for organizational consistency with the
 * agent-NN naming scheme, but functionally runs in Wave 0 per Wave E
 * spec §0 input-quality gate.
 */
export async function runAgent38(input: RunAgent38Input): Promise<Agent38Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent38Schema,
    maxTokens: 600,
  });
}

export function _resetAgent38Cache(): void { promptCache = null; }
