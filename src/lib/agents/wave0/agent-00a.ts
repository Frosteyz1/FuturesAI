/**
 * Agent 00a — Timeframe Detector.
 *
 * Production tier: Haiku 4.5
 * Veto authority: NO (but ABSTAINS when timeframe undetectable, which
 * functionally halts the pipeline — downstream agents need the routing label)
 */

import { Agent00aSchema, type Agent00aOutput } from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { loadPrompt } from '@/lib/agents/shared/prompt-loader';

export interface RunAgent00aInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

let promptCache: string | null = null;

function getPrompt(): string {
  if (promptCache === null) {
    promptCache = loadPrompt(import.meta.url, 'agent-00a-prompt.md');
  }
  return promptCache;
}

export async function runAgent00a(input: RunAgent00aInput): Promise<Agent00aOutput> {
  return invokeAgent({
    tier: 'haiku',
    systemPrompt: getPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    schema: Agent00aSchema,
    maxTokens: 350, // Agent 30 budget for Haiku
  });
}

/** Test-helper: clear the prompt cache so loadPrompt re-reads from disk. */
export function _resetAgent00aCache(): void {
  promptCache = null;
}
