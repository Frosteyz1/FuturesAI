import { Agent16Schema, type Agent16Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent16Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-16-prompt.md');
  return promptCache;
}

/**
 * Agent 16 — Stop & Target Geometry Specialist (Sonnet).
 *
 * R:R floor agent. Even structurally great setups with weak achievable
 * R:R get downgraded via forces_downgrade.
 */
export async function runAgent16(input: RunAgent16Input): Promise<Agent16Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent16Schema,
    maxTokens: 500,
  });
}

export function _resetAgent16Cache(): void { promptCache = null; }
