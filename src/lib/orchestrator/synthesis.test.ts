/**
 * Unit tests for Wave E synthesis pure functions.
 * Source contract: architecture/02-wave-e-synthesis-spec.md
 *
 * Note on test scope: only the pure functions in synthesis.ts are tested
 * here. The async functions that throw NotImplemented (computeBaseComposite,
 * mapToVerdict, runVetoCascade, devilsAdvocatePass, renderVerdictCard) are
 * stubs — they get tests once they're implemented in Step 4+ of the build.
 */

import { describe, expect, it } from 'vitest';

import {
  ALIGNMENT_CAPS,
  applyAlignmentCap,
  applyContextMultipliers,
  applyFailedBounceDowngrade,
  applyNqDisclaimerCap,
  applySkepticism,
  CONTEXT_MULTIPLIER_BOUNDS,
  computeAgreementBanner,
  FACTOR_WEIGHTS,
  SKEPTICISM_RANGE,
  SUB_WEIGHTS,
} from './synthesis';
import type {
  Agent08Output,
  Agent09Output,
  Agent14Output,
  Agent17Output,
  Agent18Output,
  Agent21Output,
  Agent24Output,
  Agent26Output,
} from '@/types/agents';
import type { BaseComposite, CappedScore, ModulatedScore, ScoringInput } from '@/types/synthesis';
import { NQ_CALIBRATION_CORPUS_THRESHOLD } from '@/types/taxonomy';

/* ── Test helpers ───────────────────────────────────────────────────────── */

function agent08(overrides: Partial<Agent08Output> = {}): Agent08Output {
  return {
    agent_id: '08',
    score: 75,
    confidence: 80,
    abstain: false,
    evidence: [],
    alignment_against: 'none',
    direction_bias: 'long',
    tier_backdrop: 1,
    ...overrides,
  };
}

function agent09(overrides: Partial<Agent09Output> = {}): Agent09Output {
  return {
    agent_id: '09',
    score: 70,
    confidence: 75,
    abstain: false,
    evidence: [],
    pattern: 'hammer',
    quality: 'good',
    bars_since_pattern: 1,
    ...overrides,
  };
}

function agent14(overrides: Partial<Agent14Output> = {}): Agent14Output {
  return {
    agent_id: '14',
    score: 30,
    confidence: 70,
    abstain: false,
    evidence: [],
    downgrade_factor: 0.0,
    variant_d_promotable: false,
    ...overrides,
  };
}

function agent17(overrides: Partial<Agent17Output> = {}): Agent17Output {
  return {
    agent_id: '17',
    score: 50,
    confidence: 70,
    abstain: false,
    evidence: [],
    ...overrides,
  };
}

function agent18(overrides: Partial<Agent18Output> = {}): Agent18Output {
  return {
    agent_id: '18',
    score: 50,
    confidence: 90,
    abstain: false,
    evidence: [],
    multiplier: 1.0,
    session_bucket: 'cash_open',
    event_window_proximity: false,
    ...overrides,
  };
}

function agent21(overrides: Partial<Agent21Output> = {}): Agent21Output {
  return {
    agent_id: '21',
    score: 50,
    confidence: 70,
    abstain: false,
    evidence: [],
    ...overrides,
  };
}

function agent24(overrides: Partial<Agent24Output> = {}): Agent24Output {
  return {
    agent_id: '24',
    score: 60,
    confidence: 80,
    abstain: false,
    evidence: [],
    regime: 'NORMAL',
    multiplier: 1.0,
    ...overrides,
  };
}

function agent26(overrides: Partial<Agent26Output> = {}): Agent26Output {
  return {
    agent_id: '26',
    score: null,
    confidence: 100,
    abstain: false,
    evidence: [],
    skepticism_score: 0,
    strongest_counter_argument: null,
    chart_evidence: null,
    ...overrides,
  };
}

function baseComposite(score: number): BaseComposite {
  return {
    score,
    contributions: [],
    abstainCount: 0,
    abstainPenalty: 0,
  };
}

function cappedScore(score: number): CappedScore {
  return { score, alignmentCap: null, alignmentGateFired: false };
}

function modulatedScore(score: number): ModulatedScore {
  return {
    score,
    contextMultipliers: { htf: 1, timeOfDay: 1, internals: 1, volatility: 1 },
    compoundMultiplier: 1,
  };
}

/* ── Spec invariants ────────────────────────────────────────────────────── */

describe('FACTOR_WEIGHTS', () => {
  it('matches §0.6 — sums to 1.0', () => {
    const total =
      FACTOR_WEIGHTS.cloudCompression +
      FACTOR_WEIGHTS.emaAcceleration +
      FACTOR_WEIGHTS.setupFreshness +
      FACTOR_WEIGHTS.triggerBodyRatio +
      FACTOR_WEIGHTS.wickPenetration +
      FACTOR_WEIGHTS.priorTriggerOutcome;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('preserves §0.6 weights exactly', () => {
    expect(FACTOR_WEIGHTS.cloudCompression).toBe(0.25);
    expect(FACTOR_WEIGHTS.emaAcceleration).toBe(0.20);
    expect(FACTOR_WEIGHTS.setupFreshness).toBe(0.15);
    expect(FACTOR_WEIGHTS.triggerBodyRatio).toBe(0.15);
    expect(FACTOR_WEIGHTS.wickPenetration).toBe(0.10);
    expect(FACTOR_WEIGHTS.priorTriggerOutcome).toBe(0.15);
  });
});

describe('SUB_WEIGHTS', () => {
  it('each split sums to 1.0', () => {
    expect(SUB_WEIGHTS.emaAcceleration.agent02 + SUB_WEIGHTS.emaAcceleration.agent08).toBeCloseTo(1, 10);
    expect(SUB_WEIGHTS.triggerBodyRatio.agent09 + SUB_WEIGHTS.triggerBodyRatio.agent13).toBeCloseTo(1, 10);
    expect(SUB_WEIGHTS.wickPenetration.agent04 + SUB_WEIGHTS.wickPenetration.agent10).toBeCloseTo(1, 10);
  });

  it('preserves the 70/30, 65/35, 60/40 splits documented in the spec', () => {
    expect(SUB_WEIGHTS.emaAcceleration).toEqual({ agent02: 0.7, agent08: 0.3 });
    expect(SUB_WEIGHTS.triggerBodyRatio).toEqual({ agent09: 0.65, agent13: 0.35 });
    expect(SUB_WEIGHTS.wickPenetration).toEqual({ agent04: 0.6, agent10: 0.4 });
  });
});

describe('ALIGNMENT_CAPS', () => {
  it('matches spec §2: both=40, either=55, all_tangled=50', () => {
    expect(ALIGNMENT_CAPS.bothAgainst).toBe(40);
    expect(ALIGNMENT_CAPS.eitherAgainst).toBe(55);
    expect(ALIGNMENT_CAPS.allTangled).toBe(50);
    expect(ALIGNMENT_CAPS.none).toBeNull();
  });
});

describe('SKEPTICISM_RANGE', () => {
  it('is [0.7, 1.0] per spec §4', () => {
    expect(SKEPTICISM_RANGE).toEqual([0.7, 1.0]);
  });
});

describe('CONTEXT_MULTIPLIER_BOUNDS', () => {
  it('compound clamp is [0.6, 1.25] per spec §3', () => {
    expect(CONTEXT_MULTIPLIER_BOUNDS.compoundClamp).toEqual([0.6, 1.25]);
  });
});

/* ── applyFailedBounceDowngrade ───────────────────────────────────────── */

describe('applyFailedBounceDowngrade', () => {
  it('returns 09 unchanged when 14 is null', () => {
    const original = agent09({ score: 80 });
    const result = applyFailedBounceDowngrade(original, null);
    expect(result?.score).toBe(80);
  });

  it('returns 09 unchanged when 09 score is null (abstain)', () => {
    const abstaining = agent09({ score: null, abstain: true });
    const result = applyFailedBounceDowngrade(abstaining, agent14({ score: 90, confidence: 90 }));
    expect(result?.score).toBeNull();
  });

  it('hard-vetos 09 to 0 when 14 score >= 85 AND confidence >= 75', () => {
    const a09 = agent09({ score: 95 });
    const a14 = agent14({ score: 85, confidence: 75 });
    const result = applyFailedBounceDowngrade(a09, a14);
    expect(result?.score).toBe(0);
  });

  it('does NOT hard-veto if 14 score is exactly 84 (below threshold)', () => {
    const a09 = agent09({ score: 80 });
    const a14 = agent14({ score: 84, confidence: 99, downgrade_factor: 0.1 });
    const result = applyFailedBounceDowngrade(a09, a14);
    // soft downgrade only: 80 * (1 - 0.1 * 0.99) = 80 * 0.901 = 72.08
    expect(result?.score).toBeCloseTo(72.08, 2);
  });

  it('does NOT hard-veto if 14 confidence is 74 (below threshold)', () => {
    const a09 = agent09({ score: 80 });
    const a14 = agent14({ score: 90, confidence: 74, downgrade_factor: 0.5 });
    const result = applyFailedBounceDowngrade(a09, a14);
    // soft: 80 * (1 - 0.5 * 0.74) = 80 * 0.63 = 50.4
    expect(result?.score).toBeCloseTo(50.4, 2);
  });

  it('soft-downgrades proportionally to factor × confidence/100', () => {
    const a09 = agent09({ score: 100 });
    const a14 = agent14({ score: 50, confidence: 60, downgrade_factor: 0.4 });
    const result = applyFailedBounceDowngrade(a09, a14);
    // 100 * (1 - 0.4 * 0.6) = 100 * 0.76 = 76
    expect(result?.score).toBeCloseTo(76, 5);
  });

  it('clamps to 0 minimum (never negative)', () => {
    const a09 = agent09({ score: 10 });
    const a14 = agent14({ score: 70, confidence: 100, downgrade_factor: 2.0 }); // factor > 1
    const result = applyFailedBounceDowngrade(a09, a14);
    expect(result?.score).toBe(0);
  });
});

/* ── applyAlignmentCap ──────────────────────────────────────────────────── */

describe('applyAlignmentCap', () => {
  it('returns base unchanged when agent08 is null', () => {
    const base = baseComposite(85);
    const result = applyAlignmentCap(base, null);
    expect(result.score).toBe(85);
    expect(result.alignmentCap).toBeNull();
    expect(result.alignmentGateFired).toBe(false);
  });

  it('caps at 40 when both macro AND short-structural against', () => {
    const base = baseComposite(85);
    const a08 = agent08({ alignment_against: 'both_macro_and_short_structural' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(40);
    expect(result.alignmentCap).toBe(40);
    expect(result.alignmentGateFired).toBe(true);
  });

  it('caps at 55 when only macro against', () => {
    const base = baseComposite(85);
    const a08 = agent08({ alignment_against: 'macro' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(55);
    expect(result.alignmentGateFired).toBe(true);
  });

  it('caps at 55 when only short-structural against', () => {
    const base = baseComposite(85);
    const a08 = agent08({ alignment_against: 'short_structural' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(55);
    expect(result.alignmentGateFired).toBe(true);
  });

  it('caps at 50 when all clouds tangled', () => {
    const base = baseComposite(85);
    const a08 = agent08({ alignment_against: 'all_tangled' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(50);
    expect(result.alignmentCap).toBe(50);
  });

  it('does not cap when alignment_against is none', () => {
    const base = baseComposite(85);
    const a08 = agent08({ alignment_against: 'none' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(85);
    expect(result.alignmentCap).toBeNull();
    expect(result.alignmentGateFired).toBe(false);
  });

  it('alignmentGateFired=false when base is below the cap', () => {
    const base = baseComposite(35);  // already below the 40 cap
    const a08 = agent08({ alignment_against: 'both_macro_and_short_structural' });
    const result = applyAlignmentCap(base, a08);
    expect(result.score).toBe(35);  // unchanged
    expect(result.alignmentCap).toBe(40);
    expect(result.alignmentGateFired).toBe(false);  // cap exists but didn't bind
  });
});

/* ── applyContextMultipliers ───────────────────────────────────────────── */

describe('applyContextMultipliers', () => {
  it('all-null (all abstain) → multipliers all 1.0, score unchanged', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, null, null, null, null);
    expect(result.score).toBe(80);
    expect(result.compoundMultiplier).toBe(1.0);
    expect(result.contextMultipliers).toEqual({ htf: 1, timeOfDay: 1, internals: 1, volatility: 1 });
  });

  it('agent17 score 50 → multiplier 0.9 (linear midpoint)', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, agent17({ score: 50 }), null, null, null);
    // 0.7 + (50/100) * 0.4 = 0.9
    expect(result.contextMultipliers.htf).toBeCloseTo(0.9, 5);
    expect(result.score).toBeCloseTo(72, 5);
  });

  it('agent17 score 100 → multiplier 1.1 (top of range)', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, agent17({ score: 100 }), null, null, null);
    expect(result.contextMultipliers.htf).toBeCloseTo(1.1, 5);
  });

  it('agent17 score 0 → multiplier 0.7 (bottom of range)', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, agent17({ score: 0 }), null, null, null);
    expect(result.contextMultipliers.htf).toBeCloseTo(0.7, 5);
  });

  it('agent17 abstain (score=null) → multiplier 1.0 (neutral)', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, agent17({ score: null, abstain: true }), null, null, null);
    expect(result.contextMultipliers.htf).toBe(1.0);
  });

  it('agent21 uses narrower [0.85, 1.1] range', () => {
    const capped = cappedScore(80);
    const r0 = applyContextMultipliers(capped, null, null, agent21({ score: 0 }), null);
    expect(r0.contextMultipliers.internals).toBeCloseTo(0.85, 5);

    const r100 = applyContextMultipliers(capped, null, null, agent21({ score: 100 }), null);
    expect(r100.contextMultipliers.internals).toBeCloseTo(1.1, 5);
  });

  it('agent18 multiplier passes through directly', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, null, agent18({ multiplier: 1.05 }), null, null);
    expect(result.contextMultipliers.timeOfDay).toBe(1.05);
  });

  it('agent24 multiplier passes through directly', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(capped, null, null, null, agent24({ multiplier: 0.85 }));
    expect(result.contextMultipliers.volatility).toBe(0.85);
  });

  it('compound clamps to [0.6, 1.25] floor — extreme negative case', () => {
    const capped = cappedScore(100);
    // Force aggressive negatives: 0.7 * 0.75 (manual) * 0.85 * 0.7 = 0.312 — would clamp to 0.6
    const result = applyContextMultipliers(
      capped,
      agent17({ score: 0 }),     // 0.7
      agent18({ multiplier: 0.75 }),
      agent21({ score: 0 }),     // 0.85
      agent24({ multiplier: 0.7 }),
    );
    expect(result.compoundMultiplier).toBeCloseTo(0.6, 5);
    expect(result.score).toBeCloseTo(60, 5);
  });

  it('compound clamps to [0.6, 1.25] ceiling — extreme positive case', () => {
    const capped = cappedScore(80);
    const result = applyContextMultipliers(
      capped,
      agent17({ score: 100 }),     // 1.1
      agent18({ multiplier: 1.25 }),
      agent21({ score: 100 }),     // 1.1
      agent24({ multiplier: 1.25 }),
    );
    // Raw: 1.1 * 1.25 * 1.1 * 1.25 = 1.890625 → clamp to 1.25
    expect(result.compoundMultiplier).toBeCloseTo(1.25, 5);
    expect(result.score).toBeCloseTo(100, 5);
  });
});

/* ── applySkepticism ───────────────────────────────────────────────────── */

describe('applySkepticism', () => {
  it('agent26 null + zero abstain → multiplier 1.0', () => {
    const m = modulatedScore(80);
    const result = applySkepticism(m, null, 0);
    expect(result.skepticismMultiplier).toBe(1.0);
    expect(result.score).toBe(80);
    expect(result.strongestCounter).toBeNull();
  });

  it('skepticism 0 → multiplier 1.0', () => {
    const m = modulatedScore(80);
    const result = applySkepticism(m, agent26({ skepticism_score: 0 }), 0);
    expect(result.skepticismMultiplier).toBe(1.0);
    expect(result.score).toBe(80);
  });

  it('skepticism 100 → multiplier 0.7 (bottom of range)', () => {
    const m = modulatedScore(80);
    const result = applySkepticism(m, agent26({ skepticism_score: 100 }), 0);
    expect(result.skepticismMultiplier).toBeCloseTo(0.7, 5);
    expect(result.score).toBeCloseTo(56, 5);
  });

  it('skepticism 50 → multiplier 0.85', () => {
    const m = modulatedScore(80);
    const result = applySkepticism(m, agent26({ skepticism_score: 50 }), 0);
    expect(result.skepticismMultiplier).toBeCloseTo(0.85, 5);
  });

  it('abstain penalty subtracts from multiplier (per §1.3)', () => {
    const m = modulatedScore(80);
    const result = applySkepticism(m, agent26({ skepticism_score: 0 }), 10);
    // 1.0 - 0.1 = 0.9
    expect(result.skepticismMultiplier).toBeCloseTo(0.9, 5);
  });

  it('clamps to floor 0.65 (skepticism + abstain combined)', () => {
    const m = modulatedScore(100);
    const result = applySkepticism(m, agent26({ skepticism_score: 100 }), 30);
    // 0.7 - 0.3 = 0.4 → clamp to 0.65
    expect(result.skepticismMultiplier).toBe(0.65);
    expect(result.score).toBe(65);
  });

  it('clamps to ceiling 1.0 (defensive)', () => {
    const m = modulatedScore(80);
    // Negative abstain penalty wouldn't happen in practice, but clamp protects
    const result = applySkepticism(m, agent26({ skepticism_score: -100 }), -50);
    // 1.0 - (-1) * 0.3 + 0.5 = 1.8 → clamp to 1.0
    expect(result.skepticismMultiplier).toBe(1.0);
  });

  it('passes through strongest_counter_argument', () => {
    const m = modulatedScore(80);
    const a26 = agent26({
      skepticism_score: 50,
      strongest_counter_argument: 'Macro is rolling over despite local rejection',
    });
    const result = applySkepticism(m, a26, 0);
    expect(result.strongestCounter).toBe('Macro is rolling over despite local rejection');
  });
});

/* ── applyNqDisclaimerCap ──────────────────────────────────────────────── */

describe('applyNqDisclaimerCap', () => {
  it('caps at 85 when corpus < threshold', () => {
    expect(applyNqDisclaimerCap(95, NQ_CALIBRATION_CORPUS_THRESHOLD - 1)).toBe(85);
  });

  it('caps at 85 when corpus is 0', () => {
    expect(applyNqDisclaimerCap(100, 0)).toBe(85);
  });

  it('does NOT cap at threshold exactly', () => {
    expect(applyNqDisclaimerCap(95, NQ_CALIBRATION_CORPUS_THRESHOLD)).toBe(95);
  });

  it('does NOT cap when corpus exceeds threshold', () => {
    expect(applyNqDisclaimerCap(95, NQ_CALIBRATION_CORPUS_THRESHOLD + 100)).toBe(95);
  });

  it('does NOT raise scores below 85 when corpus < threshold', () => {
    expect(applyNqDisclaimerCap(70, 0)).toBe(70);
  });
});

/* ── computeAgreementBanner ────────────────────────────────────────────── */

describe('computeAgreementBanner', () => {
  const userPriorLong: ScoringInput['userPrior'] = { direction: 'long' };
  const userPriorShort: ScoringInput['userPrior'] = { direction: 'short' };
  const userPriorSkip: ScoringInput['userPrior'] = { direction: 'skip' };

  it('returns undefined when no user prior given', () => {
    expect(computeAgreementBanner(undefined, 'long', 'TAKE_NOW')).toBeUndefined();
  });

  it('agree: user long + system TAKE_NOW long', () => {
    expect(computeAgreementBanner(userPriorLong, 'long', 'TAKE_NOW')).toBe('agree');
  });

  it('agree: user short + system TAKE_NOW short', () => {
    expect(computeAgreementBanner(userPriorShort, 'short', 'TAKE_NOW')).toBe('agree');
  });

  it('disagree_skip_vs_take: user long + system SKIP', () => {
    expect(computeAgreementBanner(userPriorLong, 'none', 'SKIP')).toBe('disagree_skip_vs_take');
  });

  it('disagree_skip_vs_take: user long + system WAIT_FOR_LEVEL', () => {
    expect(computeAgreementBanner(userPriorLong, 'long', 'WAIT_FOR_LEVEL')).toBe('disagree_skip_vs_take');
  });

  it('disagree_reverse: user long + system TAKE_NOW short', () => {
    expect(computeAgreementBanner(userPriorLong, 'short', 'TAKE_NOW')).toBe('disagree_reverse');
  });

  it('disagree_reverse: user short + system TAKE_NOW long', () => {
    expect(computeAgreementBanner(userPriorShort, 'long', 'TAKE_NOW')).toBe('disagree_reverse');
  });

  it('disagree_take_vs_skip: user skip + system TAKE_NOW', () => {
    expect(computeAgreementBanner(userPriorSkip, 'long', 'TAKE_NOW')).toBe('disagree_take_vs_skip');
  });

  it('returns undefined for SETUP_FORMING (not in matrix)', () => {
    expect(computeAgreementBanner(userPriorLong, 'long', 'SETUP_FORMING')).toBeUndefined();
  });

  it('returns undefined when user skips and system also skips (alignment, no banner)', () => {
    // user prior=skip + system SKIP → no banner per §12 (only highlight is take vs skip)
    expect(computeAgreementBanner(userPriorSkip, 'none', 'SKIP')).toBeUndefined();
  });
});
