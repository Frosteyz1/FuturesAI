/**
 * Per-agent output schemas. One discriminated union per agent.
 *
 * Source of truth: research/agent-NN-*.md deliverables.
 * Each agent's deliverable specifies its JSON output schema in §6;
 * this file mirrors those schemas as TypeScript types.
 *
 * Agent prompts are written separately (Step 4+); this file only
 * defines the contract every agent's response must satisfy.
 */

import type {
  ChartState,
  CloudLayer,
  ConvictionTier,
  Direction,
  PatternVariant,
} from './taxonomy';

/**
 * Common shape every agent emits. Allows abstain.
 */
export interface AgentOutputBase {
  agent_id: string;
  score: number | null;
  confidence: number;
  abstain: boolean;
  abstain_reason?: string;
  evidence: string[];
  concerns?: string[];
}

/* ── Wave 0 ────────────────────────────────────────────────────── */

export interface Agent00aOutput extends AgentOutputBase {
  agent_id: '00a';
  timeframe:
    | '20s'
    | '1m'
    | '3m'
    | '5m'
    | '15m'
    | '1h'
    | '4h'
    | '1d'
    | 'NON_TIME_BARS'
    | 'OTHER'
    | 'UNKNOWN';
  source: 'label_detected' | 'inferred_from_bar_density' | 'abstain';
}

export interface Agent00bOutput extends AgentOutputBase {
  agent_id: '00b';
  state: ChartState;
  state_at_right_edge: ChartState;
  recommended_verdict_modes: Array<
    'TAKE_NOW' | 'WAIT_FOR_LEVEL' | 'SETUP_FORMING' | 'SKIP'
  >;
}

export interface Agent00cOutput extends AgentOutputBase {
  agent_id: '00c';
  variant: PatternVariant;
  secondary_variants?: PatternVariant[];
  direction_bias?: Direction;
}

export interface Agent00dOutput extends AgentOutputBase {
  agent_id: '00d';
  direction_bias: Direction;
  watch_level?: number;
  watch_layer?: CloudLayer;
  trigger_to_wait_for?: string;
  expected_window?:
    | '5-15min'
    | '15-60min'
    | '1-3h'
    | 'EOS'
    | 'next-session';
  invalidation_price?: number;
}

/* ── Wave A — Structural ────────────────────────────────────── */

export interface Agent01Output extends AgentOutputBase {
  agent_id: '01';
  label:
    | 'strong_young'
    | 'strong_mature'
    | 'healthy_ongoing'
    | 'trend_forming'
    | 'weak_decaying'
    | 'chop_disguised'
    | 'no_trend'
    | 'parabolic_exhaustion';
}

export interface Agent02Output extends AgentOutputBase {
  agent_id: '02';
  regime_label: string;
  direction_bias: Direction;
  per_pair_slope: { blue: number; yellow: number; white: number };
  macro_visible: boolean;
}

export interface Agent03Output extends AgentOutputBase {
  agent_id: '03';
  shape_signature: string;
  depth_tier_multiplier: number;
}

export interface Agent04Output extends AgentOutputBase {
  agent_id: '04';
  tier: ConvictionTier | null;
  tier_provisional: boolean;
  cloud_touched: CloudLayer;
  penetration_class:
    | 'upper_edge_tag'
    | 'shallow_body_entry'
    | 'mid_cloud_penetration'
    | 'full_traverse_recovery'
    | 'decisive_close_through'
    | 'none';
  residence_bars: number;
  rejection_wick_to_body_ratio: number | null;
  multi_touch_count: number;
}

export interface Agent05Output extends AgentOutputBase {
  agent_id: '05';
  direction: Direction;
  intactness:
    | 'intact'
    | 'forming'
    | 'ambiguous'
    | 'broken_wick'
    | 'broken_close'
    | 'broken_acceptance';
  pivot_pairs_visible: number;
  most_recent_pivot_bars_ago: number | null;
}

export interface Agent06Output extends AgentOutputBase {
  agent_id: '06';
  state:
    | 'fresh'
    | 'developing'
    | 'established'
    | 'mature_but_ongoing'
    | 'stretched'
    | 'actively_exhausting'
    | 'blow_off';
  consider_reversal: boolean;
}

export interface Agent07Output extends AgentOutputBase {
  agent_id: '07';
  label:
    | 'STRONG_TREND'
    | 'WEAK_TREND'
    | 'TRANSITION'
    | 'COIL'
    | 'RANGE_DEFINED'
    | 'CHOP'
    | 'INSUFFICIENT_HISTORY';
  veto_overridable: boolean;
}

export interface Agent08Output extends AgentOutputBase {
  agent_id: '08';
  alignment_against:
    | 'none'
    | 'short_structural'
    | 'macro'
    | 'both_macro_and_short_structural'
    | 'all_tangled';
  direction_bias: Direction;
  tier_backdrop: 0 | 1 | 2 | 3;
}

/* ── Wave B — Price Action ─────────────────────────────────── */

export interface Agent09Output extends AgentOutputBase {
  agent_id: '09';
  pattern: string;
  quality: 'textbook' | 'good' | 'mediocre' | 'weak' | 'absent';
  bars_since_pattern: number | null;
}

export interface Agent10Output extends AgentOutputBase {
  agent_id: '10';
  also_canonical_pattern: boolean;
  wick_to_body_ratio: number | null;
  atr_relative_magnitude: number | null;
}

export interface Agent11Output extends AgentOutputBase {
  agent_id: '11';
}

export interface Agent12Output extends AgentOutputBase {
  agent_id: '12';
  label:
    | 'CONFIRMING'
    | 'SUPPORTING'
    | 'NEUTRAL'
    | 'DISCONFIRMING'
    | 'CLIMAX_FADE'
    | 'FALSE_BREAK_RISK';
  pattern: string;
  session_context: 'RTH' | 'ETH' | 'unknown';
}

export interface Agent13Output extends AgentOutputBase {
  agent_id: '13';
}

export interface Agent14Output extends AgentOutputBase {
  agent_id: '14';
  /** [0, 1] — multiplier on Agent 09's score per Wave E §1.4 */
  downgrade_factor: number;
  variant_d_promotable: boolean;
}

export interface Agent15Output extends AgentOutputBase {
  agent_id: '15';
  trigger_label: 'NO_TRIGGER' | string;
  trigger_price: number | null;
  is_cascade_add: boolean;
  add_context?: { add_at_higher_price_in_trend_direction: boolean };
}

export interface Agent16Output extends AgentOutputBase {
  agent_id: '16';
  stop_price: number | null;
  target_price: number | null;
  achievable_r: number | null;
  forces_downgrade: boolean;
}

/* ── Wave C — Context ───────────────────────────────────────── */

export interface Agent17Output extends AgentOutputBase {
  agent_id: '17';
}

export interface Agent18Output extends AgentOutputBase {
  agent_id: '18';
  /** [0.7, 1.1] modifier for Wave E §3 */
  multiplier: number;
  session_bucket: string;
  event_window_proximity: boolean;
}

export interface Agent19Output extends AgentOutputBase {
  agent_id: '19';
  top_matches: Array<{
    corpus_id: string;
    cosine_similarity: number;
    outcome: 'W' | 'L' | 'BE' | 'no_trade' | null;
    instrument_caveat: boolean;
    seed_only: boolean;
    resemblance_diff: { shared: string[]; different: string[] };
  }>;
  outcome_distribution: { wins: number; losses: number; be: number; no_trade: number };
}

export interface Agent20Output extends AgentOutputBase {
  agent_id: '20';
  touches_relevant_cloud: number;
  bars_since_last_touch: number | null;
  recent_failed_same_direction: number;
  recent_won_same_direction: number;
  cloud_broken_through_in_window: boolean;
}

export interface Agent21Output extends AgentOutputBase {
  agent_id: '21';
}

export interface Agent22Output extends AgentOutputBase {
  agent_id: '22';
  event_tier: 1 | 2 | 3 | null;
  pre_window_min: number | null;
  post_window_min: number | null;
  veto_fires: boolean;
}

export interface Agent23Output extends AgentOutputBase {
  agent_id: '23';
  state:
    | 'fresh'
    | 'disciplined'
    | 'fatigued'
    | 'over_traded'
    | 'probable_tilt'
    | 'confirmed_tilt';
  flags_firing: string[];
  veto_recommendation: 'none' | 'soft' | 'hard';
}

export interface Agent24Output extends AgentOutputBase {
  agent_id: '24';
  regime: 'DEAD' | 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
  /** Pattern-conditional multiplier from Agent 24's matrix */
  multiplier: number;
}

/* ── Wave D — Risk / Meta ───────────────────────────────────── */

export interface Agent25Output extends AgentOutputBase {
  agent_id: '25';
  veto_label: 'none' | string;  // V1, V5, V7, V8, V9, V11, etc.
  veto_severity: 'hard' | 'soft' | 'none';
}

export interface Agent26Output extends AgentOutputBase {
  agent_id: '26';
  skepticism_score: number;
  strongest_counter_argument: string | null;
  chart_evidence: string | null;
}

export interface Agent27Output extends AgentOutputBase {
  agent_id: '27';
  // Agent 27 runs as a batch process, not per-upload; this output is read at scoring time
  calibration_state: 'none' | 'uncalibrated' | 'rough' | 'provisional' | 'calibrated';
  calibrated_p_win: number | null;
  calibrated_p_win_ci?: [number, number];
  ev_estimate: number | null;
  fit_id?: string;
}

export interface Agent28Output extends AgentOutputBase {
  agent_id: '28';
  // V1: sizing is fixed at 3 contracts. This agent collapses to GO/NO-GO + risk-bucket flag.
  bucket: 'SKIP' | 'SMALL' | 'NORMAL';
  contract_count: number;
  pattern_shape: 'pyramid_concentrated' | 'staggered_reentry' | 'cross_tier_cascade' | 'single';
  applied_modifiers: string[];
}

export interface Agent38Output extends AgentOutputBase {
  agent_id: '38';
  // Validation gate — runs in Wave 0 before scoring begins
  passed: boolean;
  degradation_flags: string[];
  context_bundle: {
    platform: string;
    theme: 'dark' | 'light' | 'unknown';
    instrument: string;
    timeframe_seconds: number | null;
    indicator_stack_visible: boolean;
    staleness_hours: number | null;
    candle_count: number | null;
    score_cap_suggestion: number | null;
  };
}

/* ── Catch-all union ───────────────────────────────────────────── */

export type AnyAgentOutput =
  | Agent00aOutput | Agent00bOutput | Agent00cOutput | Agent00dOutput
  | Agent01Output | Agent02Output | Agent03Output | Agent04Output
  | Agent05Output | Agent06Output | Agent07Output | Agent08Output
  | Agent09Output | Agent10Output | Agent11Output | Agent12Output
  | Agent13Output | Agent14Output | Agent15Output | Agent16Output
  | Agent17Output | Agent18Output | Agent19Output | Agent20Output
  | Agent21Output | Agent22Output | Agent23Output | Agent24Output
  | Agent25Output | Agent26Output | Agent27Output | Agent28Output
  | Agent38Output;
