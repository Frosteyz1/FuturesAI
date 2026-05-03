import { Agent26Schema, type Agent26Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent26Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Upstream agent outputs / current verdict context to red-team against. */
  upstreamSummary?: string;
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-26-prompt.md');
  return promptCache;
}

/**
 * Agent 26 — Confirmation Bias Detector (Opus 4.7, no veto).
 *
 * Red-teams every TAKE NOW candidate. Wave E §4 consumes skepticism_score
 * as a [0.7, 1.0] multiplier on the composite.
 */
export async function runAgent26(input: RunAgent26Input): Promise<Agent26Output> {
  const userInstruction = input.upstreamSummary
    ? `Upstream agent context to red-team against:\n${input.upstreamSummary}\n\nConstruct the strongest counter-argument. JSON only.`
    : 'Red-team this chart. Construct the strongest counter-argument with chart evidence. JSON only.';

  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent26Schema,
    maxTokens: 600,
    userInstruction,
  });
}

export function _resetAgent26Cache(): void { promptCache = null; }
