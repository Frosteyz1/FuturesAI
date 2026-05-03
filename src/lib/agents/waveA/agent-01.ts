/**
 * Agent 01 — Prior Trend Strength Specialist.
 *
 * Production tier: Opus 4.7 (per Kevin's "lean Opus on Wave A structural")
 * Veto authority: NO
 */

import { Agent01Schema, type Agent01Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent01Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;

function getPrompt(): string {
  if (promptCache === null) {
    promptCache = loadPrompt(import.meta.url, 'agent-01-prompt.md');
  }
  return promptCache;
}

export async function runAgent01(input: RunAgent01Input): Promise<Agent01Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent01Schema,
    maxTokens: 600,
  });
}

export function _resetAgent01Cache(): void {
  promptCache = null;
}
