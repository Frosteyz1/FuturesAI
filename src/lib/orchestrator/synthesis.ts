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
  Agent08Output,
  Agent09Output,
  Agent10Output,
  Agent13Output,
  Agent14Output,
  Agent17Output,
  Agent18Output,
  Agent19Output,
  Agent20Output,
  Agent21Output,
  Agent24Output,
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

class NotImplemented extends Error {
  constructor(step: string) {
    super(`Wave E synthesis step not implemented: ${step}`);
  }
}

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
  // Stub: build contributions list, sum weighted scores, count abstains
  // Spec §1.2 base formula:
  //   base = 02*0.25 + 02*0.20*0.70 + 08*0.20*0.30
  //        + 20*0.15
  //        + 09*0.15*0.65 + 13*0.15*0.35
  //        + 04*0.10*0.60 + 10*0.10*0.40
  //        + 19*0.15
  void agent02;
  void agent04;
  void agent08;
  void agent09Adjusted;
  void agent10;
  void agent13;
  void agent19;
  void agent20;
  throw new NotImplemented('computeBaseComposite');
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

export function mapToVerdict(
  finalScore: number,
  agent00bState: string | null,
  variantIsA: boolean,
  agent19Abstained: boolean,
): { verdict: string; capAppliedFromSpine: boolean } {
  // Spec §6 mapping table.
  void finalScore;
  void agent00bState;
  void variantIsA;
  void agent19Abstained;
  throw new NotImplemented('mapToVerdict');
}

/* ── Step 8 — Veto cascade ───────────────────────────────────────── */

export function runVetoCascade(
  outputs: AnyAgentOutput[],
  initialVerdict: string,
): VetoResult {
  // Priority order per spec §7: 38, 22, 23, 07, 14, 25, 16
  void outputs;
  void initialVerdict;
  throw new NotImplemented('runVetoCascade');
}

/* ── Step 9 — Devil's advocate pass ──────────────────────────────── */

export async function devilsAdvocatePass(
  initialVerdict: string,
  finalScore: number,
  agentOutputs: AnyAgentOutput[],
  imageBase64: string,
): Promise<DevilsAdvocateResult> {
  // Second Opus 4.7 call. ~$0.20 with caching. Mandatory per spec.
  void initialVerdict;
  void finalScore;
  void agentOutputs;
  void imageBase64;
  throw new NotImplemented('devilsAdvocatePass');
}

/* ── Step 10 — Card content ──────────────────────────────────────── */

export async function renderVerdictCard(
  verdict: string,
  finalScore: number,
  outputs: AnyAgentOutput[],
  input: ScoringInput,
): Promise<VerdictCard> {
  void verdict;
  void finalScore;
  void outputs;
  void input;
  throw new NotImplemented('renderVerdictCard');
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
