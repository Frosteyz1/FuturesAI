/**
 * Anthropic SDK client.
 *
 * Server-only. The orchestrator and every agent invocation goes through
 * this client. Prompt caching is enabled by default (per Agent 30's
 * recommendation) — system prompts are stable across calls.
 */

import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic client requires ANTHROPIC_API_KEY env var');
  }

  cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Model IDs locked per Auth Doc tiering (Wave E spec §13).
 * Source of truth for which agent runs on which model.
 */
export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;

export type ModelTier = keyof typeof MODELS;
