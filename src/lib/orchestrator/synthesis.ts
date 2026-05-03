/**
 * Wave E synthesis — implementation contract.
 *
 * Implements the 10-step pipeline from architecture/02-wave-e-synthesis-spec.md.
 * Step bodies are stubbed in this skeleton — they throw `NotImplemented` until
 * the corresponding agent prompts (Step 4+ of the build plan) exist.
 *
 * Do not invent synthesis logic here. The spec is authoritative.
 */

import type {
  AnyAgentOutput,
  Agent02Output,
  Agent04Output,
  Agent07Output,
  Agent08Output,
  Agent09Output,
  Agent10Output,
  Agent13Output,
  Agent14Output,
  Agent16Output,
  Agent17Output,
  Agent18Output,
  Agent19Output,
  Agent20Output,
  Agent21Output,
  Agent22Output,
  Agent23Output,
  Agent24Output,
  Agent25Output,
  Agent26Output,
} from '@/types/agents';
import type {
  BaseComposite,
  CappedScore,
  DevilsAdvocateResult,
  ModulatedScore,
  ScoringInput,
  SkepticismAdjusted,
  VerdictCard,
  VetoResult,
} from '@/types/synthesis';
import { NQ_CALIBRATION_CORPUS_THRESHOLD } from '@/types/taxonomy';

/* ── Constants from the spec ─────────────────────────────────────── */

export const FACTOR_WEIGHTS = {
  cloudCompression: 0.25,
  emaAcceleration: 0.20,
  setupFreshness: 0.15,
  triggerBodyRatio: 0.15,
  wickPenetration: 0.10,
  priorTriggerOutcome: 0.15,
} as const;

export const SUB_WEIGHTS = {
  emaAcceleration: { agent02: 0.70, agent08: 0.30 },
  triggerBodyRatio: { agent09: 0.65, agent13: 0.35 },
  wickPenetration: { agent04: 0.60, agent10: 0.40 },
} as const;

export const CONTEXT_MULTIPLIER_BOUNDS = {
  htf: [0.7, 1.1] as [number, number],
  timeOfDay: [0.7, 1.1] as [number, number],
  internals: [0.85, 1.1] as [number, number],
  volatility: [0.7, 1.25] as [number, number], // wider per Agent 24's regime matrix
  compoundClamp: [0.6, 1.25] as [number, number],
};

export const SKEPTICISM_RANGE = [0.7, 1.0] as [number, number];

export const ALIGNMENT_CAPS = {
  bothAgainst: 40,
  eitherAgainst: 55,
  allTangled: 50,
  none: null as number | null,
};

/* ── NotImplemented sentinel ─────────────────────────────────────── */

/* v8 ignore start - stub class, replaced when implementations land */
class NotImplemented extends Error {
  constructor(step: string) {
    super(`Wave E synthesis step not implemented: ${step}`);
  }
}
/* v8 ignore stop */

/* ── Step 1 — Pre-base modification (Agent 14 → 09) ──────────────── */

export function applyFailedBounceDowngrade(
  agent09: Agent09Output | null,
  agent14: Agent14Output | null,
): Agent09Output | null {
  if (!agent09 || agent09.score === null) return agent09;
  if (!agent14 || agent14.score === null) return agent09;

  // Hard veto: 14 score >= 85 AND confidence >= 75 → 09 score zeroed
  if (agent14.score >= 85 && agent14.confidence >= 75) {
    return { ...agent09, score: 0 };
  }

  // Soft downgrade: multiply 09's score by (1 - downgrade_factor * confidence/100)
  const factor = agent14.downgrade_factor * (agent14.confidence / 100);
  const adjusted = agent09.score * (1 - factor);

  return { ...agent09, score: Math.max(0, adjusted) };
}

/* ── Step 2 — Base composite ─────────────────────────────────────── */

/**
 * Compute the base composite per Wave E spec §1.2.
 *
 *   base = 02 × 0.25                          (cloud_compression)
 *        + 02 × 0.20 × 0.70                   (ema_acceleration, 02 share)
 *        + 08 × 0.20 × 0.30                   (ema_acceleration, 08 share)
 *        + 20 × 0.15                          (setup_freshness)
 *        + 09 × 0.15 × 0.65                   (trigger_body_ratio, 09 share)
 *        + 13 × 0.15 × 0.35                   (trigger_body_ratio, 13 share)
 *        + 04 × 0.10 × 0.60                   (wick_penetration, 04 share)
 *        + 10 × 0.10 × 0.40                   (wick_penetration, 10 share)
 *        + 19 × 0.15                          (prior_trigger_outcome)
 *
 * Abstention handling (spec §1.3):
 *   - 1 abstain → redistribute that weight pro-rata, +5 abstain_penalty
 *   - 2 abstains → redistribute, +10 abstain_penalty
 *   - 3+ abstains → caller should hard-route to SKIP (we still return
 *                   a composite for observability but caller checks abstainCount)
 *   - Agent 19 abstains specifically → caller caps final at 60 (spec §1.3)
 */
export function computeBaseComposite(
  agent02: Agent02Output | null,
  agent04: Agent04Output | null,
  agent08: Agent08Output | null,
  agent09Adjusted: Agent09Output | null,
  agent10: Agent10Output | null,
  agent13: Agent13Output | null,
  agent19: Agent19Output | null,
  agent20: Agent20Output | null,
): BaseComposite {
  type Contribution = {
    agentId: string;
    factor: string;
    weight: number;
    rawScore: number | null;
  };

  // Effective weights for each base composite slot:
  const slots: Contribution[] = [
    { agentId: '02', factor: 'cloud_compression', weight: FACTOR_WEIGHTS.cloudCompression, rawScore: agent02?.score ?? null },
    { agentId: '02', factor: 'ema_acceleration_share', weight: FACTOR_WEIGHTS.emaAcceleration * SUB_WEIGHTS.emaAcceleration.agent02, rawScore: agent02?.score ?? null },
    { agentId: '08', factor: 'ema_acceleration_share', weight: FACTOR_WEIGHTS.emaAcceleration * SUB_WEIGHTS.emaAcceleration.agent08, rawScore: agent08?.score ?? null },
    { agentId: '20', factor: 'setup_freshness', weight: FACTOR_WEIGHTS.setupFreshness, rawScore: agent20?.score ?? null },
    { agentId: '09', factor: 'trigger_body_ratio_share', weight: FACTOR_WEIGHTS.triggerBodyRatio * SUB_WEIGHTS.triggerBodyRatio.agent09, rawScore: agent09Adjusted?.score ?? null },
    { agentId: '13', factor: 'trigger_body_ratio_share', weight: FACTOR_WEIGHTS.triggerBodyRatio * SUB_WEIGHTS.triggerBodyRatio.agent13, rawScore: agent13?.score ?? null },
    { agentId: '04', factor: 'wick_penetration_share', weight: FACTOR_WEIGHTS.wickPenetration * SUB_WEIGHTS.wickPenetration.agent04, rawScore: agent04?.score ?? null },
    { agentId: '10', factor: 'wick_penetration_share', weight: FACTOR_WEIGHTS.wickPenetration * SUB_WEIGHTS.wickPenetration.agent10, rawScore: agent10?.score ?? null },
    { agentId: '19', factor: 'prior_trigger_outcome', weight: FACTOR_WEIGHTS.priorTriggerOutcome, rawScore: agent19?.score ?? null },
  ];

  // Count distinct agent abstentions (an agent that fills two slots only
  // counts once for abstain purposes).
  const distinctAbstainAgents = new Set<string>();
  for (const slot of slots) {
    if (slot.rawScore === null) distinctAbstainAgents.add(slot.agentId);
  }
  const abstainCount = distinctAbstainAgents.size;

  // Sum of weights from non-abstaining slots
  const presentWeight = slots
    .filter((s) => s.rawScore !== null)
    .reduce((sum, s) => sum + s.weight, 0);

  if (presentWeight === 0) {
    // Everything abstained — return a 0 score, max abstain penalty
    return {
      score: 0,
      contributions: slots.map((s) => ({
        agentId: s.agentId, factor: s.factor, weight: s.weight,
        rawScore: 0, contribution: 0,
      })),
      abstainCount: distinctAbstainAgents.size,
      abstainPenalty: 50,
    };
  }

  // Pro-rata redistribute: scale up surviving slots so their weights sum to 1.0
  const scale = 1.0 / presentWeight;

  const contributions = slots.map((s) => {
    const effectiveScore = s.rawScore ?? 0;
    const effectiveWeight = s.rawScore === null ? 0 : s.weight * scale;
    return {
      agentId: s.agentId,
      factor: s.factor,
      weight: effectiveWeight,
      rawScore: effectiveScore,
      contribution: effectiveWeight * effectiveScore,
    };
  });

  const score = contributions.reduce((sum, c) => sum + c.contribution, 0);

  // Abstain penalty per spec §1.3
  let abstainPenalty = 0;
  if (abstainCount === 1) abstainPenalty = 5;
  else if (abstainCount === 2) abstainPenalty = 10;
  else if (abstainCount >= 3) abstainPenalty = 50; // caller should also force SKIP

  return {
    score: Math.max(0, Math.min(100, score)),
    contributions,
    abstainCount,
    abstainPenalty,
  };
}

/* ── Step 3 — Alignment-gate cap ─────────────────────────────────── */

export function applyAlignmentCap(
  base: BaseComposite,
  agent08: Agent08Output | null,
): CappedScore {
  if (!agent08) {
    return { score: base.score, alignmentCap: null, alignmentGateFired: false };
  }

  let cap: number | null = null;
  switch (agent08.alignment_against) {
    case 'both_macro_and_short_structural':
      cap = ALIGNMENT_CAPS.bothAgainst;
      break;
    case 'macro':
    case 'short_structural':
      cap = ALIGNMENT_CAPS.eitherAgainst;
      break;
    case 'all_tangled':
      cap = ALIGNMENT_CAPS.allTangled;
      break;
    case 'none':
      cap = null;
      break;
  }

  const cappedScore = cap === null ? base.score : Math.min(base.score, cap);
  return {
    score: cappedScore,
    alignmentCap: cap,
    alignmentGateFired: cap !== null && cappedScore < base.score,
  };
}

/* ── Step 4 — Context multipliers ────────────────────────────────── */

export function applyContextMultipliers(
  capped: CappedScore,
  agent17: Agent17Output | null,
  agent18: Agent18Output | null,
  agent21: Agent21Output | null,
  agent24: Agent24Output | null,
): ModulatedScore {
  const m17 = agent17?.score === null || !agent17 ? 1.0 : 0.7 + (agent17.score / 100) * 0.4;
  const m18 = agent18?.multiplier ?? 1.0;
  const m21 = agent21?.score === null || !agent21 ? 1.0 : 0.85 + (agent21.score / 100) * 0.25;
  const m24 = agent24?.multiplier ?? 1.0;

  const compound = Math.max(
    CONTEXT_MULTIPLIER_BOUNDS.compoundClamp[0],
    Math.min(CONTEXT_MULTIPLIER_BOUNDS.compoundClamp[1], m17 * m18 * m21 * m24),
  );

  return {
    score: capped.score * compound,
    contextMultipliers: { htf: m17, timeOfDay: m18, internals: m21, volatility: m24 },
    compoundMultiplier: compound,
  };
}

/* ── Step 5 — Skepticism multiplier ─────────────────────────────── */

export function applySkepticism(
  modulated: ModulatedScore,
  agent26: Agent26Output | null,
  abstainPenalty: number,
): SkepticismAdjusted {
  const skepticism = agent26?.skepticism_score ?? 0;
  let multiplier = 1.0 - (skepticism / 100) * 0.30;
  multiplier -= abstainPenalty / 100;
  multiplier = Math.max(0.65, Math.min(1.0, multiplier));

  return {
    score: modulated.score * multiplier,
    skepticismMultiplier: multiplier,
    strongestCounter: agent26?.strongest_counter_argument ?? null,
  };
}

/* ── Step 6 — /NQ disclaimer cap ─────────────────────────────────── */

export function applyNqDisclaimerCap(
  score: number,
  labeledNqCorpusCount: number,
): number {
  if (labeledNqCorpusCount < NQ_CALIBRATION_CORPUS_THRESHOLD) {
    return Math.min(score, 85);
  }
  return score;
}

/* ── Step 7 — Initial verdict-mode mapping ───────────────────────── */

/**
 * Map final composite score → verdict mode per spec §6.
 *
 * Note: `agent19Abstained` callers use this to enforce the §1.3 spine cap
 * separately (cap final score at 60 BEFORE calling mapToVerdict).
 */
export function mapToVerdict(
  finalScore: number,
  agent00bState: string | null,
  variantIsA: boolean,
  agent19Abstained: boolean,
): { verdict: string; capAppliedFromSpine: boolean } {
  // Non-Variant-A is routed to SKIP_OUT_OF_SCOPE upstream (Wave 0); this
  // function is only called on Variant A paths. Defensive check anyway:
  if (!variantIsA) {
    return { verdict: 'SKIP_OUT_OF_SCOPE', capAppliedFromSpine: false };
  }

  // Wave 0 state-based overrides take precedence
  if (agent00bState === 'RANGE_BOUND' || agent00bState === 'INSUFFICIENT_HISTORY') {
    return { verdict: 'SKIP', capAppliedFromSpine: agent19Abstained };
  }

  if (agent00bState === 'TREND_ESTABLISHED_RUNNING') {
    // Even high score routes to WAIT or SKIP per spec §6 mapping table
    return {
      verdict: finalScore >= 60 ? 'WAIT_FOR_LEVEL' : 'SKIP',
      capAppliedFromSpine: agent19Abstained,
    };
  }

  // Score-based mapping (spec §6 + §11)
  if (finalScore >= 80) {
    return { verdict: 'TAKE_NOW', capAppliedFromSpine: agent19Abstained };
  }
  if (finalScore >= 60) {
    return { verdict: 'WAIT_FOR_LEVEL', capAppliedFromSpine: agent19Abstained };
  }
  if (finalScore >= 40) {
    // 40-59 maps to WAIT or FORMING based on state
    if (agent00bState === 'TREND_FORMING' || agent00bState === 'REGIME_TRANSITION') {
      return { verdict: 'SETUP_FORMING', capAppliedFromSpine: agent19Abstained };
    }
    return { verdict: 'WAIT_FOR_LEVEL', capAppliedFromSpine: agent19Abstained };
  }
  return { verdict: 'SKIP', capAppliedFromSpine: agent19Abstained };
}

/* ── Step 8 — Veto cascade ───────────────────────────────────────── */

export interface VetoCascadeInput {
  agent38: { passed: boolean; degradation_flags?: string[] } | null;
  agent22: Agent22Output | null;
  agent23: Agent23Output | null;
  agent07: Agent07Output | null;
  agent14: Agent14Output | null;
  agent25: Agent25Output | null;
  agent16: Agent16Output | null;
  /** Wave 0 timeframe — Agent 07 chop threshold escalates on sub-30s charts */
  timeframe: string | null;
}

/**
 * Apply vetoes in priority order per spec §7. First veto fires; subsequent
 * vetoes are logged but do not change the verdict.
 *
 * Priority order: 38 → 22 → 23 → 07 → 14 → 25 → 16
 */
export function runVetoCascade(input: VetoCascadeInput): VetoResult {
  const logged: string[] = [];

  // 1. Input quality (Agent 38)
  if (input.agent38 && input.agent38.passed === false) {
    return {
      fired: true,
      vetoSource: 'input_quality',
      vetoSeverity: 'hard',
      vetoReason: `input quality gate failed: ${(input.agent38.degradation_flags ?? []).join(', ')}`,
      loggedButNotApplied: [],
    };
  }

  // 2. News/event (Agent 22) — veto fires when veto_fires=true (spec §7 row 2)
  if (input.agent22?.veto_fires) {
    return {
      fired: true,
      vetoSource: 'news_event',
      vetoSeverity: 'hard',
      vetoReason: input.agent22.evidence?.[0] ?? 'event proximity veto',
      loggedButNotApplied: [],
    };
  }

  // 3. Behavioral (Agent 23)
  if (input.agent23?.veto_recommendation === 'hard') {
    return {
      fired: true,
      vetoSource: 'behavioral',
      vetoSeverity: 'hard',
      vetoReason: input.agent23.evidence?.[0] ?? 'confirmed tilt',
      loggedButNotApplied: [],
    };
  }
  if (input.agent23?.veto_recommendation === 'soft') {
    logged.push('agent_23_soft');
  }

  // 4. Choppiness (Agent 07) — veto fires on label=CHOP + confidence threshold
  if (input.agent07 && input.agent07.label === 'CHOP' && !input.agent07.abstain) {
    const confidenceThreshold = input.timeframe === '20s' ? 85 : 75;
    if (input.agent07.confidence >= confidenceThreshold) {
      return {
        fired: true,
        vetoSource: 'choppiness',
        vetoSeverity: input.agent07.veto_overridable ? 'soft' : 'hard',
        vetoReason: 'chop regime',
        loggedButNotApplied: logged,
      };
    }
  }

  // 5. Failed-bounce (Agent 14)
  if (input.agent14 && input.agent14.score !== null
      && input.agent14.score >= 85 && input.agent14.confidence >= 75) {
    return {
      fired: true,
      vetoSource: 'failed_bounce',
      vetoSeverity: 'hard',
      vetoReason: 'failed-bounce signature confirmed',
      loggedButNotApplied: logged,
    };
  }

  // 6. Disqualifier catalog (Agent 25)
  if (input.agent25?.veto_severity === 'hard') {
    return {
      fired: true,
      vetoSource: 'disqualifier_catalog',
      vetoSeverity: 'hard',
      vetoReason: `disqualifier ${input.agent25.veto_label}`,
      loggedButNotApplied: logged,
    };
  }
  if (input.agent25?.veto_severity === 'soft') {
    logged.push('agent_25_soft');
  }

  // 7. R:R floor (Agent 16) — forces downgrade rather than hard SKIP
  if (input.agent16?.forces_downgrade) {
    return {
      fired: true,
      vetoSource: 'rr_floor',
      vetoSeverity: 'soft',
      vetoReason: `R:R below threshold (${input.agent16.achievable_r ?? 'unknown'})`,
      loggedButNotApplied: logged,
    };
  }

  return {
    fired: false,
    vetoSource: null,
    vetoSeverity: 'none',
    vetoReason: null,
    loggedButNotApplied: logged,
  };
}

/* ── Step 9 — Devil's advocate pass ──────────────────────────────── */

/**
 * Apply devil's-advocate result to verdict per spec §8.
 *
 * Pure function — the actual second Opus call is wired in the orchestrator
 * (orchestrator/index.ts) using the existing invokeAgent harness. This
 * function only consumes the result.
 */
export function applyDevilsAdvocate(
  initialVerdict: string,
  da: DevilsAdvocateResult,
): { verdict: string; modeAdjustment: DevilsAdvocateResult['modeAdjustment'] } {
  const verdictDowngradeMap: Record<string, string> = {
    'TAKE_NOW': 'WAIT_FOR_LEVEL',
    'WAIT_FOR_LEVEL': 'SKIP',
    'SETUP_FORMING': 'SKIP',
    'SKIP': 'SKIP',
    'SKIP_OUT_OF_SCOPE': 'SKIP_OUT_OF_SCOPE',
    'ABSTAIN_INPUT': 'ABSTAIN_INPUT',
  };

  if (da.modeAdjustment === 'force_skip') {
    return { verdict: 'SKIP', modeAdjustment: 'force_skip' };
  }
  if (da.modeAdjustment === 'downgrade_one_tier') {
    return {
      verdict: verdictDowngradeMap[initialVerdict] ?? initialVerdict,
      modeAdjustment: 'downgrade_one_tier',
    };
  }
  return { verdict: initialVerdict, modeAdjustment: da.modeAdjustment };
}

/**
 * Map counter_evidence_strength → modeAdjustment per spec §8 thresholds.
 */
export function classifyDevilsAdvocate(counterStrength: number): DevilsAdvocateResult['modeAdjustment'] {
  if (counterStrength < 40) return 'none';
  if (counterStrength < 65) return 'add_concern';
  if (counterStrength < 85) return 'downgrade_one_tier';
  return 'force_skip';
}

/* ── Agreement-banner computation (UX layer) ─────────────────────── */

export function computeAgreementBanner(
  userPrior: ScoringInput['userPrior'],
  systemDirection: 'long' | 'short' | 'either' | 'none',
  systemVerdict: string,
): VerdictCard['agreementBanner'] | undefined {
  if (!userPrior) return undefined;

  const isTake = systemVerdict === 'TAKE_NOW';
  const isSkip = systemVerdict === 'SKIP' || systemVerdict === 'WAIT_FOR_LEVEL';

  if (userPrior.direction === 'skip' && isTake) return 'disagree_take_vs_skip';
  if (userPrior.direction !== 'skip' && isSkip) return 'disagree_skip_vs_take';
  if (
    isTake &&
    userPrior.direction !== 'skip' &&
    userPrior.direction !== systemDirection
  ) {
    return 'disagree_reverse';
  }
  if (isTake && userPrior.direction === systemDirection) return 'agree';

  return undefined;
}
