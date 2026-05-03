/**
 * Agent 06 — Trend Maturity & Exhaustion Specialist.
 *
 * Production tier: Opus 4.7
 * Veto authority: NO (downgrades scores in late-cycle, doesn't kill trades)
 *
 * Note: per Wave E spec §5, Agent 06 (trend fatigue) interacts multiplicatively
 * with Agent 11 (pullback fatigue) — naive sum is wrong.
 */

import { Agent06Schema, type Agent06Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent06Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-06-prompt.md');
  return promptCache;
}

export async function runAgent06(input: RunAgent06Input): Promise<Agent06Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent06Schema,
    maxTokens: 600,
  });
}

export function _resetAgent06Cache(): void { promptCache = null; }
