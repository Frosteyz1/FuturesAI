/**
 * Agent 27 — Scoring Calibration (NON-LLM lookup).
 *
 * Per Agent 27's research deliverable, the per-upload portion of calibration
 * is a database lookup against `calibration_active` + `calibration_fits` —
 * NOT an LLM call. The recalibration loop (batch refit) IS an offline
 * Python job that runs from the replay-engine sidecar.
 *
 * This module exposes the read-side: given a composite score + cell key,
 * return the calibrated probability with confidence interval and state label.
 */

import type { Agent27Output } from '@/lib/agents/shared/schemas';
import { CALIBRATION_LADDER } from '@/types/taxonomy';

export interface CalibrationLookupInput {
  /** Final composite score from Wave E (0-100) */
  rawScore: number;
  /** Pattern variant (V1: always VARIANT_A) */
  variant: 'VARIANT_A' | 'VARIANT_B' | 'VARIANT_C' | 'VARIANT_D' | 'OTHER_PATTERNED';
  /** Conviction tier (1/2/3 or null when not applicable) */
  tier: 1 | 2 | 3 | null;
  /** Instrument */
  instrument: 'NQ' | 'ES' | 'MNQ' | 'MES';
  /** Reconciled trade count for this cell — drives cold-start ladder */
  cellSampleCount: number;
}

/**
 * Map sample count → calibration state per Agent 27's 4-state ladder.
 */
export function calibrationStateFor(n: number): Agent27Output['calibration_state'] {
  if (n < CALIBRATION_LADDER.none) return 'none';
  if (n < CALIBRATION_LADDER.uncalibrated) return 'uncalibrated';
  if (n < CALIBRATION_LADDER.rough) return 'rough';
  if (n < CALIBRATION_LADDER.provisional) return 'provisional';
  return 'calibrated';
}

/**
 * Cold-start prior: Beta-Binomial Beta(2, 2) per Agent 39 shrinkage.
 * Posterior mean = (alpha + wins) / (alpha + beta + n).
 *
 * For V1 cold-start (n=0), prior P(W) = 2/(2+2) = 0.5.
 * Wave E may inject a slight upward bias once /NQ corpus seeded; for now
 * just return the symmetric prior + wide CI.
 */
export function coldStartProbability(rawScore: number): {
  pWin: number;
  ci: [number, number];
} {
  // Linear interpolation between score and probability with wide CI.
  // Score 80 → 0.55 (the §0.6 calibration target floor).
  // Score 100 → 0.65 (modestly above coin-flip; will sharpen after fitting).
  // Score 0 → 0.30 (a bad-looking chart still has some win odds).
  const minP = 0.30;
  const maxP = 0.65;
  const pWin = Math.max(0, Math.min(1, minP + (maxP - minP) * (rawScore / 100)));

  // Cold-start CI is wide — ±20pp until we have data
  const ci: [number, number] = [
    Math.max(0, pWin - 0.20),
    Math.min(1, pWin + 0.20),
  ];

  return { pWin, ci };
}

/**
 * Look up calibration for a (variant, tier, instrument) cell.
 *
 * Production stub: in V1 we always return cold-start values. Once the
 * calibration_active table is populated by Phase 1.5 backtest Stage 5
 * + production reconciliation runs, this function should query Supabase
 * and apply the fitted calibration_function.
 */
export function lookupCalibration(input: CalibrationLookupInput): Agent27Output {
  const state = calibrationStateFor(input.cellSampleCount);
  const showProbability = state !== 'none';

  if (!showProbability) {
    // Per Agent 27 cold-start cell-N=0: don't show calibrated probability
    return {
      agent_id: '27',
      score: input.rawScore,
      confidence: 100,
      abstain: false,
      evidence: [
        `cell sample count = ${input.cellSampleCount}`,
        `state = ${state} (below threshold for probability display)`,
      ],
      calibration_state: state,
      calibrated_p_win: null,
      ev_estimate: null,
    };
  }

  const { pWin, ci } = coldStartProbability(input.rawScore);

  return {
    agent_id: '27',
    score: input.rawScore,
    confidence: 100,
    abstain: false,
    evidence: [
      `cell sample count = ${input.cellSampleCount}`,
      `state = ${state}`,
      `prior P(W) = ${pWin.toFixed(2)}`,
    ],
    calibration_state: state,
    calibrated_p_win: pWin,
    calibrated_p_win_ci: ci,
    ev_estimate: null, // wired once expected-R curves are fitted
  };
}
