import { Agent23Schema, type Agent23Output } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent23Input {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /**
   * Behavioral context (categorical, NOT raw P&L). Pre-redacted by runtime
   * per Agent 37 privacy spec. Includes session_color, trade_counts,
   * cadence flags, R-bucket counts, time-since-last-trade, size_escalation.
   */
  behavioralContext?: string;
}

let promptCache: string | null = null;
function getPrompt(): string {
  if (promptCache === null) promptCache = loadPrompt(import.meta.url, 'agent-23-prompt.md');
  return promptCache;
}

/**
 * Agent 23 — Behavioral State Specialist (Opus, CONDITIONAL VETO).
 *
 * Privacy: NEVER receives raw P&L. Categorical input only. Hard veto when
 * confirmed_tilt + size_escalation OR <5min cadence after loss.
 */
export async function runAgent23(input: RunAgent23Input): Promise<Agent23Output> {
  const userInstruction = input.behavioralContext
    ? `Behavioral context (categorical, no dollar amounts):\n${input.behavioralContext}\n\nGrade behavioral state. JSON only.`
    : 'No behavioral context available. Note this in abstain or reduce confidence. JSON only.';

  return invokeAgent({
    tier: 'opus',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent23Schema,
    maxTokens: 600,
    userInstruction,
  });
}

export function _resetAgent23Cache(): void { promptCache = null; }
