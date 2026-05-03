/**
 * Generic agent invocation harness.
 *
 * Pattern for every Wave 0–D agent:
 *   1. Load system prompt from a .md file (cached)
 *   2. Build a DispatchRequest with image + minimal text
 *   3. Hand off to a dispatcher (SDK / FileQueue / Mock per env)
 *   4. Parse first JSON block from the response
 *   5. Validate via Zod schema
 *
 * The dispatcher abstraction lets the same orchestration code run in:
 *   - Production deploy (Vercel + ANTHROPIC_API_KEY) → SdkDispatcher
 *   - Stage 4 backtest (Claude Code Max plan, no API spend) → FileQueueDispatcher
 *   - Synthesis integration tests → MockDispatcher
 * Per-agent unit tests mock at the agent-function level (not here), so the
 * existing 350-test suite is unaffected by this refactor.
 */

import { randomUUID } from 'node:crypto';

import type { z } from 'zod';

import type { ModelTier } from '@/lib/anthropic/client';
import { getDefaultDispatcher } from './dispatchers';
import type { AgentDispatcher } from './dispatchers';

export interface InvokeAgentArgs<T> {
  /** Model tier from MODELS constant. */
  tier: ModelTier;

  /** System prompt text (preloaded by caller). */
  systemPrompt: string;

  /** Chart image as base64 (no data URL prefix). */
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';

  /** User instruction (kept minimal — system prompt does the heavy lifting). */
  userInstruction?: string;

  /** Zod schema for runtime validation. */
  schema: z.ZodType<T>;

  /** Per-call max tokens override (default 500 per Agent 30 budget). */
  maxTokens?: number;

  /**
   * Override the env-selected dispatcher. Useful in tests where you want
   * a specific MockDispatcher instance, or for the Stage 4 runner which
   * passes its own pre-configured FileQueueDispatcher.
   */
  dispatcher?: AgentDispatcher;

  /**
   * Agent identifier for routing/audit (used by FileQueueDispatcher to
   * tag request files, by MockDispatcher to look up fixtures).
   */
  agentId?: string;
}

export class AgentInvocationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly rawResponse?: string,
  ) {
    super(message);
    this.name = 'AgentInvocationError';
  }
}

/**
 * Extract the first balanced JSON object from a string. Tolerates surrounding
 * prose (some models wrap their output in `Here is your JSON:\n{...}`).
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  // Always walk the string — even when it starts with {, we need to verify
  // the braces balance and find the closing }. Early-return on "starts with {"
  // is a microopt that masks unbalanced-JSON bugs.
  const start = trimmed.indexOf('{');
  if (start === -1) {
    throw new AgentInvocationError('no JSON object found in response', undefined, text);
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }
  throw new AgentInvocationError('unbalanced JSON braces', undefined, text);
}

/**
 * Invoke an agent against a chart image and return validated output.
 */
export async function invokeAgent<T>(args: InvokeAgentArgs<T>): Promise<T> {
  const dispatcher = args.dispatcher ?? getDefaultDispatcher();

  const response = await dispatcher.dispatch({
    requestId: randomUUID(),
    agentId: args.agentId ?? 'unknown',
    tier: args.tier,
    systemPrompt: args.systemPrompt,
    image: {
      kind: 'base64',
      data: args.imageBase64,
      mimeType: args.imageMimeType,
    },
    userInstruction:
      args.userInstruction ?? 'Score this chart per your instructions. Output JSON only.',
    maxTokens: args.maxTokens ?? 500,
  });

  let parsed: unknown;
  try {
    const jsonStr = extractJson(response.rawText);
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    if (err instanceof AgentInvocationError) throw err;
    throw new AgentInvocationError(
      `JSON parse failed: ${(err as Error).message}`,
      err,
      response.rawText,
    );
  }

  const result = args.schema.safeParse(parsed);
  if (!result.success) {
    throw new AgentInvocationError(
      `schema validation failed: ${result.error.message}`,
      result.error,
      response.rawText,
    );
  }
  return result.data;
}
