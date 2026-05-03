/**
 * Agent 03 — Pullback Geometry Specialist.
 *
 * Production tier: Opus 4.7
 * Veto authority: NO
 *
 * Variant A only. For B/C/D/OTHER, abstains.
 */

import { Agent03Schema, type Agent03Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent03Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-03-prompt.md');
  return promptCache;
}

export async function runAgent03(input: RunAgent03Input): Promise<Agent03Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent03Schema,
    maxTokens: 600,
  });
}

export function _resetAgent03Cache(): void { promptCache = null; }
