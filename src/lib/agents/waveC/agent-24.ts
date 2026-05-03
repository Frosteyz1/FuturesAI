import { Agent24Schema, type Agent24Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent24Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-24-prompt.md');
  return promptCache;
}

/**
 * Agent 24 — Volatility Regime Specialist (Sonnet).
 *
 * Pattern × regime multiplier matrix. Cloud-band thickness as primary
 * vision-tractable signal (avoids needing exact ATR computation).
 */
export async function runAgent24(input: RunAgent24Input): Promise<Agent24Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent24Schema,
    maxTokens: 500,
  });
}

export function _resetAgent24Cache(): void { promptCache = null; }
