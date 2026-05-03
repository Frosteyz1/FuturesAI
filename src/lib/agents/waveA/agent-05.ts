/**
 * Agent 05 — Market Structure Specialist (HH/HL or LH/LL).
 *
 * Production tier: Opus 4.7
 * Veto authority: NO
 */

import { Agent05Schema, type Agent05Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent05Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-05-prompt.md');
  return promptCache;
}

export async function runAgent05(input: RunAgent05Input): Promise<Agent05Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent05Schema,
    maxTokens: 600,
  });
}

export function _resetAgent05Cache(): void { promptCache = null; }
