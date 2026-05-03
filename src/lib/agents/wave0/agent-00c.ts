/**
 * Agent 00c — Setup Variant Classifier.
 *
 * Production tier: Opus 4.7 (routing decision; mis-classification is expensive)
 * Veto authority: ROUTING (variant determines downstream rubric set + V1
 * vs V2 in-scope routing per architecture/01-pattern-taxonomy.md)
 */

import { Agent00cSchema, type Agent00cOutput } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent00cInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;

function getPrompt(): string {
  if (promptCache === null) {
    promptCache = loadPrompt(import.meta.url, 'agent-00c-prompt.md');
  }
  return promptCache;
}

export async function runAgent00c(input: RunAgent00cInput): Promise<Agent00cOutput> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent00cSchema,
    maxTokens: 500,
  });
}

export function _resetAgent00cCache(): void {
  promptCache = null;
}
