/**
 * Zod runtime schemas for all 44 agent outputs.
 *
 * Mirrors the TypeScript interfaces in src/types/agents.ts but provides
 * runtime validation. Production agents return JSON; we parse + validate
 * before trusting the LLM output.
 *
 * Organized by wave: Wave 0 (00a-d) → Wave A (01-08, structural)
 * → Wave B (09-16, price action) → Wave C (17-24, context)
 * → Wave D (25-40, risk/meta).
 */

import { z } from 'zod';

import {
  CHART_STATES,
  CLOUD_LAYERS,
  CONVICTION_TIERS,
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

/* ═══ Wave 0 ════════════════════════════════════════════════════════════ */

export const Agent00aSchema = baseAgent.extend({
  agent_id: z.literal('00a'),
  timeframe: z.enum([
    '20s', '1m', '3m', '5m', '15m', '1h', '4h', '1d',
    'NON_TIME_BARS', 'OTHER', 'UNKNOWN',
  ]),
  source: z.enum(['label_detected', 'inferred_from_bar_density', 'abstain']),
});
export type Agent00aOutput = z.infer<typeof Agent00aSchema>;

export const Agent00bSchema = baseAgent.extend({
  agent_id: z.literal('00b'),
  state: z.enum(CHART_STATES),
  state_at_right_edge: z.enum(CHART_STATES),
  recommended_verdict_modes: z.array(
    z.enum(['TAKE_NOW', 'WAIT_FOR_LEVEL', 'SETUP_FORMING', 'SKIP']),
  ),
});
export type Agent00bOutput = z.infer<typeof Agent00bSchema>;

export const Agent00cSchema = baseAgent.extend({
  agent_id: z.literal('00c'),
  variant: z.enum(PATTERN_VARIANTS),
  secondary_variants: z.array(z.enum(PATTERN_VARIANTS)).optional(),
  direction_bias: z.enum(DIRECTIONS).optional(),
});
export type Agent00cOutput = z.infer<typeof Agent00cSchema>;

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

/* ═══ Wave A — Structural (8 agents, all Opus) ══════════════════════════ */

export const Agent01Schema = baseAgent.extend({
  agent_id: z.literal('01'),
  label: z.enum([
    'strong_young', 'strong_mature', 'healthy_ongoing', 'trend_forming',
    'weak_decaying', 'chop_disguised', 'no_trend', 'parabolic_exhaustion',
  ]),
});
export type Agent01Output = z.infer<typeof Agent01Schema>;

export const Agent02Schema = baseAgent.extend({
  agent_id: z.literal('02'),
  regime_label: z.string(),
  direction_bias: z.enum(DIRECTIONS),
  per_pair_slope: z.object({ blue: z.number(), yellow: z.number(), white: z.number() }),
  macro_visible: z.boolean(),
});
export type Agent02Output = z.infer<typeof Agent02Schema>;

export const Agent03Schema = baseAgent.extend({
  agent_id: z.literal('03'),
  shape_signature: z.string(),
  depth_tier_multiplier: z.number(),
});
export type Agent03Output = z.infer<typeof Agent03Schema>;

export const Agent04Schema = baseAgent.extend({
  agent_id: z.literal('04'),
  tier: z.union([z.enum(['1', '2', '3']).transform((v) => parseInt(v, 10) as 1 | 2 | 3), z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  tier_provisional: z.boolean(),
  cloud_touched: z.enum(CLOUD_LAYERS),
  penetration_class: z.enum([
    'upper_edge_tag', 'shallow_body_entry', 'mid_cloud_penetration',
    'full_traverse_recovery', 'decisive_close_through', 'none',
  ]),
  residence_bars: z.number().int().nonnegative(),
  rejection_wick_to_body_ratio: z.number().nullable(),
  multi_touch_count: z.number().int().nonnegative(),
});
export type Agent04Output = z.infer<typeof Agent04Schema>;

export const Agent05Schema = baseAgent.extend({
  agent_id: z.literal('05'),
  direction: z.enum(DIRECTIONS),
  intactness: z.enum([
    'intact', 'forming', 'ambiguous', 'broken_wick', 'broken_close', 'broken_acceptance',
  ]),
  pivot_pairs_visible: z.number().int().nonnegative(),
  most_recent_pivot_bars_ago: z.number().int().nullable(),
});
export type Agent05Output = z.infer<typeof Agent05Schema>;

export const Agent06Schema = baseAgent.extend({
  agent_id: z.literal('06'),
  state: z.enum([
    'fresh', 'developing', 'established', 'mature_but_ongoing',
    'stretched', 'actively_exhausting', 'blow_off',
  ]),
  consider_reversal: z.boolean(),
});
export type Agent06Output = z.infer<typeof Agent06Schema>;

export const Agent07Schema = baseAgent.extend({
  agent_id: z.literal('07'),
  label: z.enum([
    'STRONG_TREND', 'WEAK_TREND', 'TRANSITION', 'COIL',
    'RANGE_DEFINED', 'CHOP', 'INSUFFICIENT_HISTORY',
  ]),
  veto_overridable: z.boolean(),
});
export type Agent07Output = z.infer<typeof Agent07Schema>;

export const Agent08Schema = baseAgent.extend({
  agent_id: z.literal('08'),
  alignment_against: z.enum([
    'none', 'short_structural', 'macro', 'both_macro_and_short_structural', 'all_tangled',
  ]),
  direction_bias: z.enum(DIRECTIONS),
  tier_backdrop: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
export type Agent08Output = z.infer<typeof Agent08Schema>;

/* ═══ Wave B — Price Action (8 agents, mostly Sonnet, 14=Opus) ══════════ */

export const Agent09Schema = baseAgent.extend({
  agent_id: z.literal('09'),
  pattern: z.string(),
  quality: z.enum(['textbook', 'good', 'mediocre', 'weak', 'absent']),
  bars_since_pattern: z.number().int().nullable(),
});
export type Agent09Output = z.infer<typeof Agent09Schema>;

export const Agent10Schema = baseAgent.extend({
  agent_id: z.literal('10'),
  also_canonical_pattern: z.boolean(),
  wick_to_body_ratio: z.number().nullable(),
  atr_relative_magnitude: z.number().nullable(),
});
export type Agent10Output = z.infer<typeof Agent10Schema>;

export const Agent11Schema = baseAgent.extend({
  agent_id: z.literal('11'),
});
export type Agent11Output = z.infer<typeof Agent11Schema>;

export const Agent12Schema = baseAgent.extend({
  agent_id: z.literal('12'),
  label: z.enum([
    'CONFIRMING', 'SUPPORTING', 'NEUTRAL', 'DISCONFIRMING',
    'CLIMAX_FADE', 'FALSE_BREAK_RISK',
  ]),
  pattern: z.string(),
  session_context: z.enum(['RTH', 'ETH', 'unknown']),
});
export type Agent12Output = z.infer<typeof Agent12Schema>;

export const Agent13Schema = baseAgent.extend({
  agent_id: z.literal('13'),
});
export type Agent13Output = z.infer<typeof Agent13Schema>;

export const Agent14Schema = baseAgent.extend({
  agent_id: z.literal('14'),
  downgrade_factor: z.number().min(0).max(1),
  variant_d_promotable: z.boolean(),
});
export type Agent14Output = z.infer<typeof Agent14Schema>;

export const Agent15Schema = baseAgent.extend({
  agent_id: z.literal('15'),
  trigger_label: z.string(),
  trigger_price: z.number().nullable(),
  is_cascade_add: z.boolean(),
  add_context: z.object({
    add_at_higher_price_in_trend_direction: z.boolean(),
  }).optional(),
});
export type Agent15Output = z.infer<typeof Agent15Schema>;

export const Agent16Schema = baseAgent.extend({
  agent_id: z.literal('16'),
  stop_price: z.number().nullable(),
  target_price: z.number().nullable(),
  achievable_r: z.number().nullable(),
  forces_downgrade: z.boolean(),
});
export type Agent16Output = z.infer<typeof Agent16Schema>;

/* ═══ Wave C — Context (8 agents) ═══════════════════════════════════════ */

export const Agent17Schema = baseAgent.extend({
  agent_id: z.literal('17'),
});
export type Agent17Output = z.infer<typeof Agent17Schema>;

export const Agent18Schema = baseAgent.extend({
  agent_id: z.literal('18'),
  multiplier: z.number().min(0.7).max(1.25),
  session_bucket: z.string(),
  event_window_proximity: z.boolean(),
});
export type Agent18Output = z.infer<typeof Agent18Schema>;

export const Agent19Schema = baseAgent.extend({
  agent_id: z.literal('19'),
  top_matches: z.array(z.object({
    corpus_id: z.string(),
    cosine_similarity: z.number(),
    outcome: z.enum(['W', 'L', 'BE', 'no_trade']).nullable(),
    instrument_caveat: z.boolean(),
    seed_only: z.boolean(),
    resemblance_diff: z.object({
      shared: z.array(z.string()),
      different: z.array(z.string()),
    }),
  })),
  outcome_distribution: z.object({
    wins: z.number().int(),
    losses: z.number().int(),
    be: z.number().int(),
    no_trade: z.number().int(),
  }),
});
export type Agent19Output = z.infer<typeof Agent19Schema>;

export const Agent20Schema = baseAgent.extend({
  agent_id: z.literal('20'),
  touches_relevant_cloud: z.number().int().nonnegative(),
  bars_since_last_touch: z.number().int().nullable(),
  recent_failed_same_direction: z.number().int().nonnegative(),
  recent_won_same_direction: z.number().int().nonnegative(),
  cloud_broken_through_in_window: z.boolean(),
});
export type Agent20Output = z.infer<typeof Agent20Schema>;

export const Agent21Schema = baseAgent.extend({
  agent_id: z.literal('21'),
});
export type Agent21Output = z.infer<typeof Agent21Schema>;

export const Agent22Schema = baseAgent.extend({
  agent_id: z.literal('22'),
  event_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  pre_window_min: z.number().nullable(),
  post_window_min: z.number().nullable(),
  veto_fires: z.boolean(),
});
export type Agent22Output = z.infer<typeof Agent22Schema>;

export const Agent23Schema = baseAgent.extend({
  agent_id: z.literal('23'),
  state: z.enum([
    'fresh', 'disciplined', 'fatigued', 'over_traded',
    'probable_tilt', 'confirmed_tilt',
  ]),
  flags_firing: z.array(z.string()),
  veto_recommendation: z.enum(['none', 'soft', 'hard']),
});
export type Agent23Output = z.infer<typeof Agent23Schema>;

export const Agent24Schema = baseAgent.extend({
  agent_id: z.literal('24'),
  regime: z.enum(['DEAD', 'LOW', 'NORMAL', 'ELEVATED', 'EXTREME']),
  multiplier: z.number().min(0.3).max(1.5),
});
export type Agent24Output = z.infer<typeof Agent24Schema>;

/* ═══ Wave D — Risk / Meta (16 agents) ══════════════════════════════════ */

export const Agent25Schema = baseAgent.extend({
  agent_id: z.literal('25'),
  veto_label: z.string(),
  veto_severity: z.enum(['hard', 'soft', 'none']),
});
export type Agent25Output = z.infer<typeof Agent25Schema>;

export const Agent26Schema = baseAgent.extend({
  agent_id: z.literal('26'),
  skepticism_score: z.number().min(0).max(100),
  strongest_counter_argument: z.string().nullable(),
  chart_evidence: z.string().nullable(),
});
export type Agent26Output = z.infer<typeof Agent26Schema>;

export const Agent27Schema = baseAgent.extend({
  agent_id: z.literal('27'),
  calibration_state: z.enum([
    'none', 'uncalibrated', 'rough', 'provisional', 'calibrated',
  ]),
  calibrated_p_win: z.number().min(0).max(1).nullable(),
  calibrated_p_win_ci: z.tuple([z.number(), z.number()]).optional(),
  ev_estimate: z.number().nullable(),
  fit_id: z.string().optional(),
});
export type Agent27Output = z.infer<typeof Agent27Schema>;

export const Agent28Schema = baseAgent.extend({
  agent_id: z.literal('28'),
  bucket: z.enum(['SKIP', 'SMALL', 'NORMAL']),
  contract_count: z.number().int().min(0).max(10),
  pattern_shape: z.enum([
    'pyramid_concentrated', 'staggered_reentry', 'cross_tier_cascade', 'single',
  ]),
  applied_modifiers: z.array(z.string()),
});
export type Agent28Output = z.infer<typeof Agent28Schema>;

// Agents 29-37, 39, 40 are research-only / batch-only / N/A per their
// research deliverables — they don't run per-chart-upload. They still get
// minimal Zod schemas in case they're invoked from a tooling context.

export const Agent29Schema = baseAgent.extend({ agent_id: z.literal('29') });
export type Agent29Output = z.infer<typeof Agent29Schema>;
export const Agent30Schema = baseAgent.extend({ agent_id: z.literal('30') });
export type Agent30Output = z.infer<typeof Agent30Schema>;
export const Agent31Schema = baseAgent.extend({ agent_id: z.literal('31') });
export type Agent31Output = z.infer<typeof Agent31Schema>;
export const Agent32Schema = baseAgent.extend({ agent_id: z.literal('32') });
export type Agent32Output = z.infer<typeof Agent32Schema>;
export const Agent33Schema = baseAgent.extend({ agent_id: z.literal('33') });
export type Agent33Output = z.infer<typeof Agent33Schema>;
export const Agent34Schema = baseAgent.extend({ agent_id: z.literal('34') });
export type Agent34Output = z.infer<typeof Agent34Schema>;
export const Agent35Schema = baseAgent.extend({ agent_id: z.literal('35') });
export type Agent35Output = z.infer<typeof Agent35Schema>;
export const Agent36Schema = baseAgent.extend({ agent_id: z.literal('36') });
export type Agent36Output = z.infer<typeof Agent36Schema>;
export const Agent37Schema = baseAgent.extend({ agent_id: z.literal('37') });
export type Agent37Output = z.infer<typeof Agent37Schema>;
export const Agent39Schema = baseAgent.extend({ agent_id: z.literal('39') });
export type Agent39Output = z.infer<typeof Agent39Schema>;
export const Agent40Schema = baseAgent.extend({ agent_id: z.literal('40') });
export type Agent40Output = z.infer<typeof Agent40Schema>;

// Agent 38 (Robustness/Edge Cases / input quality) IS per-upload — runs
// in Wave 0 as the input-quality gate per Wave E spec §0.
export const Agent38Schema = baseAgent.extend({
  agent_id: z.literal('38'),
  passed: z.boolean(),
  degradation_flags: z.array(z.string()),
  context_bundle: z.object({
    platform: z.string(),
    theme: z.enum(['dark', 'light', 'unknown']),
    instrument: z.string(),
    timeframe_seconds: z.number().nullable(),
    indicator_stack_visible: z.boolean(),
    staleness_hours: z.number().nullable(),
    candle_count: z.number().int().nullable(),
    score_cap_suggestion: z.number().nullable(),
  }),
});
export type Agent38Output = z.infer<typeof Agent38Schema>;
