/**
 * Pattern taxonomy — V1 lock.
 * Source of truth: architecture/01-pattern-taxonomy.md
 * Any change requires Phase 1.5 review.
 */

export const PATTERN_VARIANTS = [
  'VARIANT_A',         // pullback rejection in established trend (V1 in scope)
  'VARIANT_B',         // regime-establishment / open confluence (V2)
  'VARIANT_C',         // macro-cloud break + retest (V2)
  'VARIANT_D',         // failed-bounce reversal (V2)
  'OTHER_PATTERNED',   // recognizable-but-unnamed (V2)
  'ABSTAIN_INPUT',     // Wave 0 input quality fail
] as const;
export type PatternVariant = (typeof PATTERN_VARIANTS)[number];

export const VERDICT_MODES = [
  'TAKE_NOW',
  'WAIT_FOR_LEVEL',
  'SETUP_FORMING',
  'SKIP',
  'SKIP_OUT_OF_SCOPE',  // non-A variant detected
  'ABSTAIN_INPUT',      // Wave 0 input quality gate failed
] as const;
export type VerdictMode = (typeof VERDICT_MODES)[number];

export const CONVICTION_TIERS = [1, 2, 3] as const;
export type ConvictionTier = (typeof CONVICTION_TIERS)[number];

/**
 * Chart-state classifications (Agent 00b).
 * Open-ended: Agent 00b may extend with corpus-discovered states.
 * The taxonomy below is the V1 base set.
 */
export const CHART_STATES = [
  'TREND_ESTABLISHED_RUNNING',
  'TREND_FORMING',
  'PULLBACK_IN_PROGRESS',
  'REJECTION_FIRING',
  'POST_REJECTION_CONTINUATION',
  'RANGE_BOUND',
  'REGIME_TRANSITION',
  'MACRO_BREAK_RETEST',
  'INSUFFICIENT_HISTORY',
] as const;
export type ChartState = (typeof CHART_STATES)[number];

/**
 * Which cloud layer is being interacted with (Agent 04 output, drives tiering).
 */
export const CLOUD_LAYERS = ['blue', 'yellow', 'white', 'none'] as const;
export type CloudLayer = (typeof CLOUD_LAYERS)[number];

/**
 * Direction labels.
 */
export const DIRECTIONS = ['long', 'short', 'either', 'none'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * V1 expansion gate. Variant becomes scorable in V2 only when the corpus has
 * `MIN_LABELED_EXAMPLES_FOR_V2_VARIANT` reconciled examples for that variant.
 */
export const MIN_LABELED_EXAMPLES_FOR_V2_VARIANT = 20;

/**
 * /NQ corpus threshold for lifting the score-cap-at-85 disclaimer rule.
 */
export const NQ_CALIBRATION_CORPUS_THRESHOLD = 30;

/**
 * Minimum reconciled trades before Agent 27 calibration claims "calibrated"
 * (per the 4-state ladder in Agent 27's deliverable).
 */
export const CALIBRATION_LADDER = {
  none: 5,            // < 5 = no probability shown
  uncalibrated: 20,   // 5-19 = Beta-Binomial prior
  rough: 75,          // 20-74 = Platt with strong prior
  provisional: 150,   // 75-149 = isotonic with footer
  calibrated: 150,    // 150+ AND holdout Brier <= 0.20 = full
} as const;
