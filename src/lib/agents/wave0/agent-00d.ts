/**
 * Agent 00d — Anticipation / Wait-Level Specialist.
 *
 * Production tier: Sonnet 4.6 (creative pattern matching, but not as
 * load-bearing as the routing-tier classifiers)
 * Veto authority: NO
 *
 * Runs on non-actionable charts only — when 00b classifies as
 * TREND_ESTABLISHED_RUNNING, REGIME_TRANSITION, POST_REJECTION_CONTINUATION,
 * or other states where a future level is identifiable.
 */

import { Agent00dSchema, type Agent00dOutput } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent00dInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;

function getPrompt(): string {
  if (promptCache === null) {
    promptCache = loadPrompt(import.meta.url, 'agent-00d-prompt.md');
  }
  return promptCache;
}

export async function runAgent00d(input: RunAgent00dInput): Promise<Agent00dOutput> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent00dSchema,
    maxTokens: 500,
  });
}

export function _resetAgent00dCache(): void {
  promptCache = null;
}
