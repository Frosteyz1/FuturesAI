/**
 * Orchestrator entry point.
 *
 * Public API: scoreChart(input) → ScoringRun
 *
 * Pipeline contract per architecture/02-wave-e-synthesis-spec.md §0.
 * Implementation is stubbed in this skeleton; agents will be wired in Step 4+
 * of the build plan.
 */

import { randomUUID } from 'node:crypto';
import type { ScoringInput, ScoringRun } from '@/types/synthesis';

export class NotImplemented extends Error {
  constructor(step: string) {
    super(`Orchestrator step not implemented: ${step}`);
  }
}

/**
 * Score a single chart through the 44-agent + Wave E pipeline.
 *
 * Steps (per Wave E spec §0):
 *   1. Pre-processing (image norm, OCR, ATR extraction, indicator detection)
 *   2. Wave 0 input quality gate (Agent 38) → ABSTAIN_INPUT short-circuit
 *   3. Wave 0 routing (00a/b/c/d) → SKIP_OUT_OF_SCOPE short-circuit if non-A
 *   4. Wave A fan-out (8 structural agents) → Wave A meta < 40 short-circuit
 *   5. Wave B/C/D fan-out (modifiers, vetoes, context)
 *   6. Wave E synthesis (10 sub-steps in synthesis.ts)
 *   7. Persist scoring run + return card
 */
export async function scoreChart(input: ScoringInput): Promise<ScoringRun> {
  const scoringRunId = input.scoringRunId ?? randomUUID();
  const startedAt = new Date();

  void scoringRunId;
  void startedAt;
  void input;

  // Step bodies are stubbed; will be implemented as agents come online.
  // Each implementation step in src/lib/orchestrator/synthesis.ts has its
  // own NotImplemented sentinel that fires when invoked.
  throw new NotImplemented('scoreChart');
}
