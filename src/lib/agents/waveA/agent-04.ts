/**
 * Agent 04 — Cloud Penetration Specialist.
 *
 * Production tier: Opus 4.7
 * Veto authority: NO
 *
 * Dual purpose: 6% of base composite (wick penetration share) AND emits
 * the `tier` routing label that drives tier-specific rubrics across the
 * fleet. Misclassification of tier corrupts downstream agent calibration.
 */

import { Agent04Schema, type Agent04Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent04Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-04-prompt.md');
  return promptCache;
}

export async function runAgent04(input: RunAgent04Input): Promise<Agent04Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent04Schema,
    maxTokens: 700,
  });
}

export function _resetAgent04Cache(): void { promptCache = null; }
