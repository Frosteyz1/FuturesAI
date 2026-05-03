import { Agent15Schema, type Agent15Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent15Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-15-prompt.md');
  return promptCache;
}

/**
 * Agent 15 — Trigger Bar Selection Specialist (Sonnet).
 *
 * Picks the trigger bar + price for TAKE NOW candidates. Default rule:
 * break of rejection bar high/low + 1 tick. Cascade-aware (Patterns A/B/C).
 */
export async function runAgent15(input: RunAgent15Input): Promise<Agent15Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent15Schema,
    maxTokens: 500,
  });
}

export function _resetAgent15Cache(): void { promptCache = null; }
