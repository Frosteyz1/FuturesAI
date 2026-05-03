/**
 * Agent 07 — Choppiness / Regime Detector.
 *
 * Production tier: Opus 4.7
 * Veto authority: YES — confident CHOP kills the trade regardless of
 * structural score. Per Wave E spec §7, fires when:
 *   label = CHOP AND confidence >= 75 AND not abstain
 * Threshold escalates to >= 85 on sub-30s timeframes.
 */

import { Agent07Schema, type Agent07Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent07Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-07-prompt.md');
  return promptCache;
}

export async function runAgent07(input: RunAgent07Input): Promise<Agent07Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent07Schema,
    maxTokens: 700,
  });
}

export function _resetAgent07Cache(): void { promptCache = null; }
