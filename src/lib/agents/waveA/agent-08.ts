/**
 * Agent 08 — Multi-EMA Confluence Specialist.
 *
 * Production tier: Opus 4.7
 * Veto authority: NO (but emits the alignment-gate cap that hard-caps Wave E)
 *
 * Promoted to lead alignment grader per planning prompt §1.0. Owns ~6%
 * of base composite (the EMA acceleration share via 30% split with Agent 02)
 * AND emits the binary alignment-against label that hard-caps the final score.
 */

import { Agent08Schema, type Agent08Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent08Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-08-prompt.md');
  return promptCache;
}

export async function runAgent08(input: RunAgent08Input): Promise<Agent08Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent08Schema,
    maxTokens: 600,
  });
}

export function _resetAgent08Cache(): void { promptCache = null; }
