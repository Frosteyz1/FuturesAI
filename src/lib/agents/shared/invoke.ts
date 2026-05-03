/**
 * Generic agent invocation harness.
 *
 * Pattern for every Wave 0–D agent:
 *   1. Load system prompt from a .md file (cached)
 *   2. Build a multimodal user message: image + minimal text
 *   3. Call Anthropic API with prompt-cache enabled on the system prompt
 *   4. Parse first JSON block from the response
 *   5. Validate via Zod schema
 *
 * If the model returns invalid JSON or fails Zod validation, this function
 * throws. Caller decides whether to abstain, retry, or fail.
 *
 * Per Wave E spec §13 + Agent 30 prompt-engineering deliverable:
 *   - System prompt is cacheable (stable across uploads → 90% input cost cut)
 *   - max_tokens capped at 500 per agent (per Agent 30 budget)
 *   - JSON-only output via prompt instruction; we parse defensively
 */

import type { z } from 'zod';

import { getAnthropic, MODELS, type ModelTier } from '@/lib/anthropic/client';

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
  const client = getAnthropic();
  const model = MODELS[args.tier];

  const response = await client.messages.create({
    model,
    max_tokens: args.maxTokens ?? 500,
    system: [
      {
        type: 'text',
        text: args.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: args.imageMimeType,
              data: args.imageBase64,
            },
          },
          {
            type: 'text',
            text: args.userInstruction ?? 'Score this chart per your instructions. Output JSON only.',
          },
        ],
      },
    ],
  });

  // Concatenate all text blocks (newer SDKs may return multiple)
  const textBlocks = response.content.filter(
    (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text',
  );
  const text = textBlocks.map((b) => b.text).join('\n');

  let parsed: unknown;
  try {
    const jsonStr = extractJson(text);
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    if (err instanceof AgentInvocationError) throw err;
    throw new AgentInvocationError(
      `JSON parse failed: ${(err as Error).message}`,
      err,
      text,
    );
  }

  const result = args.schema.safeParse(parsed);
  if (!result.success) {
    throw new AgentInvocationError(
      `schema validation failed: ${result.error.message}`,
      result.error,
      text,
    );
  }
  return result.data;
}
