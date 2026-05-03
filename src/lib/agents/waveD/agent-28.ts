import { Agent28Schema, type Agent28Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent28Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Composite score from Wave E synthesis (drives bucket assignment). */
  compositeScore: number;
  /** Other context: tier, behavioral state, cascade flag from upstream. */
  upstreamContext: string;
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-28-prompt.md');
  return promptCache;
}

/**
 * Agent 28 — Position Sizing & Tier (Sonnet, no veto).
 *
 * V1 simplification: sizing is fixed at 3 contracts (TopStep XFA + $600 risk).
 * Agent collapses to GO/NO-GO + SMALL/NORMAL bucket + pattern shape detection.
 * LARGE bucket gated until replay-engine validation passes per Agent 35 §4.
 */
export async function runAgent28(input: RunAgent28Input): Promise<Agent28Output> {
  return invokeAgent({
    tier: 'sonnet',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent28Schema,
    maxTokens: 500,
    userInstruction:
      `Composite score: ${input.compositeScore}\n` +
      `Upstream context: ${input.upstreamContext}\n\n` +
      'Apply V1 sizing rubric per your instructions. JSON only.',
  });
}

export function _resetAgent28Cache(): void { promptCache = null; }
