/**
 * Agent 00b — Chart State Classifier.
 *
 * Production tier: Opus 4.7 (high-stakes routing — every downstream agent
 * branches on this output)
 * Veto authority: ROUTING (state determines verdict mode)
 */

import { Agent00bSchema, type Agent00bOutput } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent00bInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;

function getPrompt(): string {
  if (promptCache === null) {
    promptCache = loadPrompt(import.meta.url, 'agent-00b-prompt.md');
  }
  return promptCache;
}

export async function runAgent00b(input: RunAgent00bInput): Promise<Agent00bOutput> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent00bSchema,
    maxTokens: 600, // Opus on Wave 0 — needs space for evidence + concerns
  });
}

export function _resetAgent00bCache(): void {
  promptCache = null;
}
