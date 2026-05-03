/**
 * Agent 02 — EMA Cloud Geometry Specialist.
 *
 * Production tier: Opus 4.7
 * Veto authority: NO
 *
 * Heaviest single contribution to Wave E base composite — owns 25%
 * (cloud compression) + 14% (EMA acceleration share via 70/30 split with
 * Agent 08) = 39% of base. If this agent is mis-calibrated, the whole
 * system drifts.
 */

import { Agent02Schema, type Agent02Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent02Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-02-prompt.md');
  return promptCache;
}

export async function runAgent02(input: RunAgent02Input): Promise<Agent02Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent02Schema,
    maxTokens: 700,
  });
}

export function _resetAgent02Cache(): void { promptCache = null; }
