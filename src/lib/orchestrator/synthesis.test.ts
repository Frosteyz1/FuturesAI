/**
 * Unit tests for Wave E synthesis pure functions.
 * Source contract: architecture/02-wave-e-synthesis-spec.md
 */

import { describe, expect, it } from 'vitest';

import {
  ALIGNMENT_CAPS,
  applyAlignmentCap,
  applyContextMultipliers,
  applyDevilsAdvocate,
  applyFailedBounceDowngrade,
  applyNqDisclaimerCap,
  applySkepticism,
  classifyDevilsAdvocate,
  computeAgreementBanner,
  computeBaseComposite,
  CONTEXT_MULTIPLIER_BOUNDS,
  FACTOR_WEIGHTS,
  mapToVerdict,
  runVetoCascade,
  SKEPTICISM_RANGE,
  SUB_WEIGHTS,
} from './synthesis';
import type {
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

/* ── computeBaseComposite ───────────────────────────────────────────── */

function a02(score: number | null = 80): Agent02Output {
  return {
    agent_id: '02', score, confidence: 80, abstain: score === null,
    evidence: [], regime_label: 'x', direction_bias: 'long',
    per_pair_slope: { blue: 0, yellow: 0, white: 0 }, macro_visible: true,
  };
}
function a04(score: number | null = 80): Agent04Output {
  return {
    agent_id: '04', score, confidence: 80, abstain: score === null,
    evidence: [], tier: 1, tier_provisional: false, cloud_touched: 'blue',
    penetration_class: 'shallow_body_entry', residence_bars: 1,
    rejection_wick_to_body_ratio: 2, multi_touch_count: 1,
  };
}
function a08(score: number | null = 80): Agent08Output {
  return {
    agent_id: '08', score, confidence: 80, abstain: score === null,
    evidence: [], alignment_against: 'none', direction_bias: 'long', tier_backdrop: 3,
  };
}
function a09(score: number | null = 80): Agent09Output {
  return {
    agent_id: '09', score, confidence: 80, abstain: score === null,
    evidence: [], pattern: 'hammer', quality: 'good', bars_since_pattern: 1,
  };
}
function a10(score: number | null = 80): Agent10Output {
  return {
    agent_id: '10', score, confidence: 80, abstain: score === null,
    evidence: [], also_canonical_pattern: false,
    wick_to_body_ratio: 2, atr_relative_magnitude: 1.5,
  };
}
function a13(score: number | null = 80): Agent13Output {
  return {
    agent_id: '13', score, confidence: 80, abstain: score === null, evidence: [],
  };
}
function a19(score: number | null = 80): Agent19Output {
  return {
    agent_id: '19', score, confidence: 80, abstain: score === null,
    evidence: [], top_matches: [],
    outcome_distribution: { wins: 0, losses: 0, be: 0, no_trade: 0 },
  };
}
function a20(score: number | null = 80): Agent20Output {
  return {
    agent_id: '20', score, confidence: 80, abstain: score === null,
    evidence: [], touches_relevant_cloud: 0, bars_since_last_touch: null,
    recent_failed_same_direction: 0, recent_won_same_direction: 0,
    cloud_broken_through_in_window: false,
  };
}

describe('computeBaseComposite', () => {
  it('all agents at 80 → composite ≈ 80 (weighted sum)', () => {
    const r = computeBaseComposite(a02(80), a04(80), a08(80), a09(80), a10(80), a13(80), a19(80), a20(80));
    expect(r.score).toBeCloseTo(80, 1);
    expect(r.abstainCount).toBe(0);
    expect(r.abstainPenalty).toBe(0);
  });

  it('weighted sum reflects §0.6 weights', () => {
    // Score Agent 02 at 100 (39% of base), all others at 0
    const r = computeBaseComposite(a02(100), a04(0), a08(0), a09(0), a10(0), a13(0), a19(0), a20(0));
    // Expected: 100 * (0.25 + 0.20*0.70) = 100 * 0.39 = 39
    expect(r.score).toBeCloseTo(39, 1);
  });

  it('one abstention → +5 abstain_penalty, weight redistributed', () => {
    const r = computeBaseComposite(a02(80), a04(80), a08(80), a09(null), a10(80), a13(80), a19(80), a20(80));
    expect(r.abstainCount).toBe(1);
    expect(r.abstainPenalty).toBe(5);
    // Surviving agents should still produce a sensible composite
    expect(r.score).toBeGreaterThan(70);
  });

  it('two abstentions → +10 abstain_penalty', () => {
    const r = computeBaseComposite(a02(80), a04(80), a08(80), a09(null), a10(null), a13(80), a19(80), a20(80));
    expect(r.abstainCount).toBe(2);
    expect(r.abstainPenalty).toBe(10);
  });

  it('three+ abstentions → max penalty (caller forces SKIP)', () => {
    const r = computeBaseComposite(a02(null), a04(null), a08(null), a09(80), a10(80), a13(80), a19(80), a20(80));
    expect(r.abstainCount).toBe(3);
    expect(r.abstainPenalty).toBe(50);
  });

  it('all-null → returns 0 with max penalty', () => {
    const r = computeBaseComposite(null, null, null, null, null, null, null, null);
    expect(r.score).toBe(0);
    expect(r.abstainPenalty).toBe(50);
  });

  it('contributions array reflects per-slot accounting', () => {
    const r = computeBaseComposite(a02(80), a04(80), a08(80), a09(80), a10(80), a13(80), a19(80), a20(80));
    // Should have 9 contribution slots (some agents fill 2)
    expect(r.contributions).toHaveLength(9);
  });

  it('clamps result to [0, 100]', () => {
    const r = computeBaseComposite(a02(100), a04(100), a08(100), a09(100), a10(100), a13(100), a19(100), a20(100));
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

/* ── mapToVerdict ───────────────────────────────────────────────────── */

describe('mapToVerdict', () => {
  it('non-Variant-A → SKIP_OUT_OF_SCOPE', () => {
    const r = mapToVerdict(85, 'REJECTION_FIRING', false, false);
    expect(r.verdict).toBe('SKIP_OUT_OF_SCOPE');
  });

  it('score >= 80 + Variant A + actionable state → TAKE_NOW', () => {
    const r = mapToVerdict(85, 'REJECTION_FIRING', true, false);
    expect(r.verdict).toBe('TAKE_NOW');
  });

  it('score 60-79 → WAIT_FOR_LEVEL', () => {
    const r = mapToVerdict(70, 'REJECTION_FIRING', true, false);
    expect(r.verdict).toBe('WAIT_FOR_LEVEL');
  });

  it('score 40-59 in TREND_FORMING → SETUP_FORMING', () => {
    const r = mapToVerdict(50, 'TREND_FORMING', true, false);
    expect(r.verdict).toBe('SETUP_FORMING');
  });

  it('score 40-59 in REJECTION_FIRING → WAIT_FOR_LEVEL', () => {
    const r = mapToVerdict(50, 'REJECTION_FIRING', true, false);
    expect(r.verdict).toBe('WAIT_FOR_LEVEL');
  });

  it('score < 40 → SKIP', () => {
    const r = mapToVerdict(30, 'REJECTION_FIRING', true, false);
    expect(r.verdict).toBe('SKIP');
  });

  it('RANGE_BOUND → always SKIP regardless of score', () => {
    const r = mapToVerdict(95, 'RANGE_BOUND', true, false);
    expect(r.verdict).toBe('SKIP');
  });

  it('TREND_ESTABLISHED_RUNNING + high score → WAIT_FOR_LEVEL', () => {
    const r = mapToVerdict(85, 'TREND_ESTABLISHED_RUNNING', true, false);
    expect(r.verdict).toBe('WAIT_FOR_LEVEL');
  });

  it('Agent 19 abstained → capAppliedFromSpine flag set', () => {
    const r = mapToVerdict(85, 'REJECTION_FIRING', true, true);
    expect(r.capAppliedFromSpine).toBe(true);
  });
});

/* ── runVetoCascade ─────────────────────────────────────────────────── */

function vetoInput(overrides: Partial<Parameters<typeof runVetoCascade>[0]> = {}): Parameters<typeof runVetoCascade>[0] {
  return {
    agent38: { passed: true },
    agent22: { agent_id: '22', score: 90, confidence: 90, abstain: false, evidence: [], event_tier: null, pre_window_min: null, post_window_min: null, veto_fires: false } as Agent22Output,
    agent23: { agent_id: '23', score: 80, confidence: 80, abstain: false, evidence: [], state: 'fresh', flags_firing: [], veto_recommendation: 'none' } as Agent23Output,
    agent07: { agent_id: '07', score: 25, confidence: 80, abstain: false, evidence: [], label: 'STRONG_TREND', veto_overridable: true } as Agent07Output,
    agent14: { agent_id: '14', score: 25, confidence: 70, abstain: false, evidence: [], downgrade_factor: 0, variant_d_promotable: false } as Agent14Output,
    agent25: { agent_id: '25', score: 100, confidence: 80, abstain: false, evidence: [], veto_label: 'none', veto_severity: 'none' } as Agent25Output,
    agent16: { agent_id: '16', score: 80, confidence: 80, abstain: false, evidence: [], stop_price: 100, target_price: 110, achievable_r: 3, forces_downgrade: false } as Agent16Output,
    timeframe: '1m',
    ...overrides,
  };
}

describe('runVetoCascade', () => {
  it('all clean → no veto fired', () => {
    const r = runVetoCascade(vetoInput());
    expect(r.fired).toBe(false);
    expect(r.vetoSource).toBeNull();
  });

  it('Agent 38 input fail → input_quality veto wins priority', () => {
    const r = runVetoCascade(vetoInput({
      agent38: { passed: false, degradation_flags: ['low_resolution'] },
      agent22: { agent_id: '22', score: 0, confidence: 90, abstain: false, evidence: [], event_tier: 1, pre_window_min: 25, post_window_min: null, veto_fires: true } as Agent22Output,
    }));
    expect(r.vetoSource).toBe('input_quality');
  });

  it('Agent 22 news veto fires when veto_fires=true', () => {
    const r = runVetoCascade(vetoInput({
      agent22: { agent_id: '22', score: 10, confidence: 90, abstain: false, evidence: ['FOMC in 25min'], event_tier: 1, pre_window_min: 25, post_window_min: null, veto_fires: true } as Agent22Output,
    }));
    expect(r.fired).toBe(true);
    expect(r.vetoSource).toBe('news_event');
  });

  it('Agent 23 hard veto fires on confirmed_tilt', () => {
    const r = runVetoCascade(vetoInput({
      agent23: { agent_id: '23', score: 15, confidence: 85, abstain: false, evidence: [], state: 'confirmed_tilt', flags_firing: ['size_escalation'], veto_recommendation: 'hard' } as Agent23Output,
    }));
    expect(r.vetoSource).toBe('behavioral');
  });

  it('Agent 07 chop veto threshold = 75 on 1m', () => {
    const r = runVetoCascade(vetoInput({
      agent07: { agent_id: '07', score: 90, confidence: 80, abstain: false, evidence: [], label: 'CHOP', veto_overridable: false } as Agent07Output,
    }));
    expect(r.vetoSource).toBe('choppiness');
  });

  it('Agent 07 chop veto threshold = 85 on 20s timeframe', () => {
    const r = runVetoCascade(vetoInput({
      agent07: { agent_id: '07', score: 90, confidence: 80, abstain: false, evidence: [], label: 'CHOP', veto_overridable: false } as Agent07Output,
      timeframe: '20s',
    }));
    // confidence 80 < 85 threshold for 20s, so veto does NOT fire
    expect(r.vetoSource).not.toBe('choppiness');
  });

  it('Agent 14 hard veto on score≥85 + confidence≥75', () => {
    const r = runVetoCascade(vetoInput({
      agent14: { agent_id: '14', score: 90, confidence: 80, abstain: false, evidence: [], downgrade_factor: 1, variant_d_promotable: false } as Agent14Output,
    }));
    expect(r.vetoSource).toBe('failed_bounce');
  });

  it('Agent 16 R:R floor → soft veto', () => {
    const r = runVetoCascade(vetoInput({
      agent16: { agent_id: '16', score: 30, confidence: 80, abstain: false, evidence: [], stop_price: 100, target_price: 101, achievable_r: 0.5, forces_downgrade: true } as Agent16Output,
    }));
    expect(r.vetoSource).toBe('rr_floor');
    expect(r.vetoSeverity).toBe('soft');
  });

  it('soft Agent 23 logged but not applied when something else wins', () => {
    const r = runVetoCascade(vetoInput({
      agent23: { agent_id: '23', score: 30, confidence: 70, abstain: false, evidence: [], state: 'probable_tilt', flags_firing: [], veto_recommendation: 'soft' } as Agent23Output,
      agent14: { agent_id: '14', score: 90, confidence: 80, abstain: false, evidence: [], downgrade_factor: 1, variant_d_promotable: false } as Agent14Output,
    }));
    expect(r.vetoSource).toBe('failed_bounce');
    expect(r.loggedButNotApplied).toContain('agent_23_soft');
  });
});

/* ── classifyDevilsAdvocate ─────────────────────────────────────────── */

describe('classifyDevilsAdvocate', () => {
  it('thresholds match spec §8', () => {
    expect(classifyDevilsAdvocate(0)).toBe('none');
    expect(classifyDevilsAdvocate(39)).toBe('none');
    expect(classifyDevilsAdvocate(40)).toBe('add_concern');
    expect(classifyDevilsAdvocate(64)).toBe('add_concern');
    expect(classifyDevilsAdvocate(65)).toBe('downgrade_one_tier');
    expect(classifyDevilsAdvocate(84)).toBe('downgrade_one_tier');
    expect(classifyDevilsAdvocate(85)).toBe('force_skip');
    expect(classifyDevilsAdvocate(100)).toBe('force_skip');
  });
});

/* ── applyDevilsAdvocate ────────────────────────────────────────────── */

describe('applyDevilsAdvocate', () => {
  it('none/add_concern preserves verdict', () => {
    const r = applyDevilsAdvocate('TAKE_NOW', {
      counterEvidenceStrength: 50,
      counterArgument: 'mild concern',
      modeAdjustment: 'add_concern',
    });
    expect(r.verdict).toBe('TAKE_NOW');
  });

  it('downgrade_one_tier: TAKE_NOW → WAIT_FOR_LEVEL', () => {
    const r = applyDevilsAdvocate('TAKE_NOW', {
      counterEvidenceStrength: 75,
      counterArgument: 'x',
      modeAdjustment: 'downgrade_one_tier',
    });
    expect(r.verdict).toBe('WAIT_FOR_LEVEL');
  });

  it('downgrade_one_tier: WAIT_FOR_LEVEL → SKIP', () => {
    const r = applyDevilsAdvocate('WAIT_FOR_LEVEL', {
      counterEvidenceStrength: 75,
      counterArgument: 'x',
      modeAdjustment: 'downgrade_one_tier',
    });
    expect(r.verdict).toBe('SKIP');
  });

  it('force_skip → SKIP regardless of starting verdict', () => {
    const r = applyDevilsAdvocate('TAKE_NOW', {
      counterEvidenceStrength: 95,
      counterArgument: 'x',
      modeAdjustment: 'force_skip',
    });
    expect(r.verdict).toBe('SKIP');
  });

  it('preserves SKIP_OUT_OF_SCOPE through downgrade', () => {
    const r = applyDevilsAdvocate('SKIP_OUT_OF_SCOPE', {
      counterEvidenceStrength: 75,
      counterArgument: 'x',
      modeAdjustment: 'downgrade_one_tier',
    });
    expect(r.verdict).toBe('SKIP_OUT_OF_SCOPE');
  });
});
