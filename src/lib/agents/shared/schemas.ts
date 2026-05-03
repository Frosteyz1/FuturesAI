/**
 * Zod runtime schemas for Wave 0 agent outputs.
 *
 * Mirrors the TypeScript interfaces in src/types/agents.ts but provides
 * runtime validation. Production agents return JSON; we parse + validate
 * before trusting the LLM output.
 */

import { z } from 'zod';

import {
  CHART_STATES,
  CLOUD_LAYERS,
  DIRECTIONS,
  PATTERN_VARIANTS,
} from '@/types/taxonomy';

const baseAgent = z.object({
  agent_id: z.string(),
  score: z.number().nullable(),
  confidence: z.number().min(0).max(100),
  abstain: z.boolean(),
  abstain_reason: z.string().optional(),
  evidence: z.array(z.string()),
  concerns: z.array(z.string()).optional(),
});

/* ── Agent 00a — Timeframe Detector ────────────────────────────────────── */

export const Agent00aSchema = baseAgent.extend({
  agent_id: z.literal('00a'),
  timeframe: z.enum([
    '20s', '1m', '3m', '5m', '15m', '1h', '4h', '1d',
    'NON_TIME_BARS', 'OTHER', 'UNKNOWN',
  ]),
  source: z.enum(['label_detected', 'inferred_from_bar_density', 'abstain']),
});
export type Agent00aOutput = z.infer<typeof Agent00aSchema>;

/* ── Agent 00b — Chart State Classifier ────────────────────────────────── */

export const Agent00bSchema = baseAgent.extend({
  agent_id: z.literal('00b'),
  state: z.enum(CHART_STATES),
  state_at_right_edge: z.enum(CHART_STATES),
  recommended_verdict_modes: z.array(
    z.enum(['TAKE_NOW', 'WAIT_FOR_LEVEL', 'SETUP_FORMING', 'SKIP']),
  ),
});
export type Agent00bOutput = z.infer<typeof Agent00bSchema>;

/* ── Agent 00c — Setup Variant Classifier ──────────────────────────────── */

export const Agent00cSchema = baseAgent.extend({
  agent_id: z.literal('00c'),
  variant: z.enum(PATTERN_VARIANTS),
  secondary_variants: z.array(z.enum(PATTERN_VARIANTS)).optional(),
  direction_bias: z.enum(DIRECTIONS).optional(),
});
export type Agent00cOutput = z.infer<typeof Agent00cSchema>;

/* ── Agent 00d — Anticipation / Wait-Level ─────────────────────────────── */

export const Agent00dSchema = baseAgent.extend({
  agent_id: z.literal('00d'),
  direction_bias: z.enum(DIRECTIONS),
  watch_level: z.number().optional(),
  watch_layer: z.enum(CLOUD_LAYERS).optional(),
  trigger_to_wait_for: z.string().optional(),
  expected_window: z.enum([
    '5-15min', '15-60min', '1-3h', 'EOS', 'next-session',
  ]).optional(),
  invalidation_price: z.number().optional(),
});
export type Agent00dOutput = z.infer<typeof Agent00dSchema>;
