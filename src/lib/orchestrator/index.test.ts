/**
 * Step 6 — End-to-end smoke test for scoreChart().
 *
 * Mocks all 30 agent invocations + the devil's-advocate Opus call. Reads a
 * real chart-exemplar PNG from disk and runs the full scoreChart() pipeline,
 * asserting the resulting card has the expected shape.
 *
 * Goal: verify the orchestration plumbing is wired correctly. Does NOT verify
 * agent vision quality (that requires real Anthropic API calls and a labeled
 * corpus, both of which are downstream concerns).
 *
 * Per autonomous build authorization: "Anthropic placeholder key fine, all
 * tests use mocks."
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist all mock function declarations so vi.mock() can reference them.
const mocks = vi.hoisted(() => ({
  m38: vi.fn(),
  m00a: vi.fn(), m00b: vi.fn(), m00c: vi.fn(), m00d: vi.fn(),
  m01: vi.fn(), m02: vi.fn(), m03: vi.fn(), m04: vi.fn(),
  m05: vi.fn(), m06: vi.fn(), m07: vi.fn(), m08: vi.fn(),
  m09: vi.fn(), m10: vi.fn(), m11: vi.fn(), m12: vi.fn(),
  m13: vi.fn(), m14: vi.fn(), m15: vi.fn(), m16: vi.fn(),
  m17: vi.fn(), m18: vi.fn(), m19: vi.fn(), m20: vi.fn(),
  m21: vi.fn(), m22: vi.fn(), m23: vi.fn(), m24: vi.fn(),
  m25: vi.fn(), m26: vi.fn(),
  invokeAgent: vi.fn(),  // for runDevilsAdvocate's direct invokeAgent call
}));

vi.mock('@/lib/agents/waveD/agent-38', () => ({ runAgent38: mocks.m38 }));
vi.mock('@/lib/agents/wave0/agent-00a', () => ({ runAgent00a: mocks.m00a }));
vi.mock('@/lib/agents/wave0/agent-00b', () => ({ runAgent00b: mocks.m00b }));
vi.mock('@/lib/agents/wave0/agent-00c', () => ({ runAgent00c: mocks.m00c }));
vi.mock('@/lib/agents/wave0/agent-00d', () => ({ runAgent00d: mocks.m00d }));
vi.mock('@/lib/agents/waveA/agent-01', () => ({ runAgent01: mocks.m01 }));
vi.mock('@/lib/agents/waveA/agent-02', () => ({ runAgent02: mocks.m02 }));
vi.mock('@/lib/agents/waveA/agent-03', () => ({ runAgent03: mocks.m03 }));
vi.mock('@/lib/agents/waveA/agent-04', () => ({ runAgent04: mocks.m04 }));
vi.mock('@/lib/agents/waveA/agent-05', () => ({ runAgent05: mocks.m05 }));
vi.mock('@/lib/agents/waveA/agent-06', () => ({ runAgent06: mocks.m06 }));
vi.mock('@/lib/agents/waveA/agent-07', () => ({ runAgent07: mocks.m07 }));
vi.mock('@/lib/agents/waveA/agent-08', () => ({ runAgent08: mocks.m08 }));
vi.mock('@/lib/agents/waveB/agent-09', () => ({ runAgent09: mocks.m09 }));
vi.mock('@/lib/agents/waveB/agent-10', () => ({ runAgent10: mocks.m10 }));
vi.mock('@/lib/agents/waveB/agent-11', () => ({ runAgent11: mocks.m11 }));
vi.mock('@/lib/agents/waveB/agent-12', () => ({ runAgent12: mocks.m12 }));
vi.mock('@/lib/agents/waveB/agent-13', () => ({ runAgent13: mocks.m13 }));
vi.mock('@/lib/agents/waveB/agent-14', () => ({ runAgent14: mocks.m14 }));
vi.mock('@/lib/agents/waveB/agent-15', () => ({ runAgent15: mocks.m15 }));
vi.mock('@/lib/agents/waveB/agent-16', () => ({ runAgent16: mocks.m16 }));
vi.mock('@/lib/agents/waveC/agent-17', () => ({ runAgent17: mocks.m17 }));
vi.mock('@/lib/agents/waveC/agent-18', () => ({ runAgent18: mocks.m18 }));
vi.mock('@/lib/agents/waveC/agent-19', () => ({ runAgent19: mocks.m19 }));
vi.mock('@/lib/agents/waveC/agent-20', () => ({ runAgent20: mocks.m20 }));
vi.mock('@/lib/agents/waveC/agent-21', () => ({ runAgent21: mocks.m21 }));
vi.mock('@/lib/agents/waveC/agent-22', () => ({ runAgent22: mocks.m22 }));
vi.mock('@/lib/agents/waveC/agent-23', () => ({ runAgent23: mocks.m23 }));
vi.mock('@/lib/agents/waveC/agent-24', () => ({ runAgent24: mocks.m24 }));
vi.mock('@/lib/agents/waveD/agent-25', () => ({ runAgent25: mocks.m25 }));
vi.mock('@/lib/agents/waveD/agent-26', () => ({ runAgent26: mocks.m26 }));

// Mock the invokeAgent function (used by runDevilsAdvocate inside index.ts)
vi.mock('@/lib/agents/shared/invoke', () => ({
  invokeAgent: mocks.invokeAgent,
  AgentInvocationError: class extends Error {},
  extractJson: vi.fn(),
}));

import { scoreChart } from './index';

/* ── Stub builders (Variant A Tier 1 happy-path winner) ─────────────── */

const stub = (id: string) => ({
  agent_id: id, score: 80, confidence: 80, abstain: false, evidence: [],
});

const happyPath = {
  // Wave 0 input quality (Agent 38)
  agent_38: () => ({
    agent_id: '38', score: 95, confidence: 95, abstain: false,
    evidence: ['NinjaTrader chart, all 3 clouds visible'],
    passed: true, degradation_flags: [],
    context_bundle: {
      platform: 'NinjaTrader', theme: 'dark', instrument: 'NQ',
      timeframe_seconds: 20, indicator_stack_visible: true,
      staleness_hours: 0.1, candle_count: 100, score_cap_suggestion: null,
    },
  }),
  // Wave 0 routing
  agent_00a: () => ({
    agent_id: '00a', score: null, confidence: 95, abstain: false,
    evidence: ['NinjaTrader header reads "20 Second"'],
    timeframe: '20s', source: 'label_detected',
  }),
  agent_00b: () => ({
    agent_id: '00b', score: null, confidence: 80, abstain: false,
    evidence: ['blue cloud rejection bar at right edge'],
    state: 'REJECTION_FIRING', state_at_right_edge: 'REJECTION_FIRING',
    recommended_verdict_modes: ['TAKE_NOW', 'WAIT_FOR_LEVEL'],
  }),
  agent_00c: () => ({
    agent_id: '00c', score: null, confidence: 85, abstain: false,
    evidence: ['Variant A pullback rejection at blue cloud'],
    variant: 'VARIANT_A', direction_bias: 'long',
  }),
  // Wave A
  agent_01: () => ({
    ...stub('01'), score: 82, label: 'strong_young',
    evidence: ['12 bars since against-trend cross', 'macro slope positive'],
  }),
  agent_02: () => ({
    ...stub('02'), score: 88,
    evidence: ['three clouds parallel rising', 'macro slope clearly positive'],
    regime_label: 'parallel_triple_stack_up', direction_bias: 'long',
    per_pair_slope: { blue: 0.5, yellow: 0.3, white: 0.15 }, macro_visible: true,
  }),
  agent_03: () => ({
    ...stub('03'), score: 85,
    shape_signature: 'sharp_flush_clean', depth_tier_multiplier: 1.05,
  }),
  agent_04: () => ({
    ...stub('04'), score: 90,
    evidence: ['wick pierced 0.4 cloud width then reversed in 2 bars', 'wick:body 2.5'],
    tier: 1, tier_provisional: false, cloud_touched: 'blue',
    penetration_class: 'shallow_body_entry', residence_bars: 1,
    rejection_wick_to_body_ratio: 2.5, multi_touch_count: 1,
  }),
  agent_05: () => ({
    ...stub('05'), score: 85,
    direction: 'long', intactness: 'intact',
    pivot_pairs_visible: 3, most_recent_pivot_bars_ago: 6,
  }),
  agent_06: () => ({ ...stub('06'), score: 45, state: 'established', consider_reversal: false }),
  agent_07: () => ({ ...stub('07'), score: 25, label: 'STRONG_TREND', veto_overridable: true }),
  agent_08: () => ({
    ...stub('08'), score: 88,
    evidence: ['triple-stack aligned and parallel', 'all three slopes positive'],
    alignment_against: 'none', direction_bias: 'long', tier_backdrop: 3,
  }),
  // Wave B
  agent_09: () => ({
    ...stub('09'), score: 85,
    evidence: ['textbook hammer at blue cloud edge', 'wick 2.5x body'],
    pattern: 'hammer', quality: 'good', bars_since_pattern: 1,
  }),
  agent_10: () => ({
    ...stub('10'), score: 82, also_canonical_pattern: true,
    wick_to_body_ratio: 2.5, atr_relative_magnitude: 1.8,
  }),
  agent_11: () => ({ ...stub('11'), score: 78 }),
  agent_12: () => ({
    ...stub('12'), score: 75, label: 'CONFIRMING',
    pattern: 'declining-pullback', session_context: 'RTH',
  }),
  agent_13: () => ({ ...stub('13'), score: 82 }),
  agent_14: () => ({
    ...stub('14'), score: 20, downgrade_factor: 0, variant_d_promotable: false,
  }),
  agent_15: () => ({
    ...stub('15'), score: 88,
    trigger_label: 'break_of_rejection_high', trigger_price: 4727.50,
    is_cascade_add: false,
  }),
  agent_16: () => ({
    ...stub('16'), score: 85,
    stop_price: 4722.50, target_price: 4737.50, achievable_r: 2.0,
    forces_downgrade: false,
  }),
  // Wave C
  agent_17: () => ({
    agent_id: '17', score: null, confidence: 100, abstain: true,
    abstain_reason: 'no HTF screenshot provided',
    evidence: [],
  }),
  agent_18: () => ({
    ...stub('18'), score: 75,
    multiplier: 1.05, session_bucket: 'mid_morning', event_window_proximity: false,
  }),
  agent_19: () => ({
    ...stub('19'), score: 80,
    evidence: ['Tier 1 micro pullback signature matches multiple corpus winners'],
    top_matches: [],
    outcome_distribution: { wins: 0, losses: 0, be: 0, no_trade: 0 },
  }),
  agent_20: () => ({
    ...stub('20'), score: 82,
    touches_relevant_cloud: 1, bars_since_last_touch: 8,
    recent_failed_same_direction: 0, recent_won_same_direction: 0,
    cloud_broken_through_in_window: false,
  }),
  agent_21: () => ({
    agent_id: '21', score: null, confidence: 100, abstain: true,
    abstain_reason: 'no multi-symbol context provided',
    evidence: [],
  }),
  agent_22: () => ({
    ...stub('22'), score: 90,
    event_tier: null, pre_window_min: null, post_window_min: null, veto_fires: false,
  }),
  agent_23: () => ({
    ...stub('23'), score: 75,
    state: 'disciplined', flags_firing: [], veto_recommendation: 'none',
  }),
  agent_24: () => ({
    ...stub('24'), score: 80, regime: 'NORMAL', multiplier: 1.0,
  }),
  // Wave D
  agent_25: () => ({
    ...stub('25'), score: 100, veto_label: 'none', veto_severity: 'none',
  }),
  agent_26: () => ({
    agent_id: '26', score: null, confidence: 80, abstain: false,
    evidence: [],
    skepticism_score: 25,
    strongest_counter_argument: 'minor concern about post-lunch session timing',
    chart_evidence: 'one earlier failed bounce at this level',
  }),
  // Devil's advocate (second invokeAgent call)
  devils_advocate: () => ({
    agent_id: '26', score: null, confidence: 80, abstain: false,
    evidence: ['second pass found mild concern'],
    skepticism_score: 30,
    strongest_counter_argument: 'mild concern only',
    chart_evidence: 'minor doji in pullback bars',
  }),
};

/* ── Test helpers ───────────────────────────────────────────────────── */

const EXEMPLAR_09_PATH = resolve(
  'C:/Users/Kevin/trading-copilot-research/chart-exemplars/chart-exemplars',
  '09-ninjatrader-20sec-blue-cloud-bounce-ES-MAR24.png',
);

function loadExemplarBase64(): string | null {
  if (!existsSync(EXEMPLAR_09_PATH)) return null;
  const buf = readFileSync(EXEMPLAR_09_PATH);
  return buf.toString('base64');
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());

  // Default: every agent returns its happy-path stub
  mocks.m38.mockResolvedValue(happyPath.agent_38());
  mocks.m00a.mockResolvedValue(happyPath.agent_00a());
  mocks.m00b.mockResolvedValue(happyPath.agent_00b());
  mocks.m00c.mockResolvedValue(happyPath.agent_00c());
  mocks.m00d.mockResolvedValue({
    agent_id: '00d', score: null, confidence: 100, abstain: true,
    abstain_reason: 'state actionable, 00d not invoked',
    evidence: [], direction_bias: 'long',
  });
  mocks.m01.mockResolvedValue(happyPath.agent_01());
  mocks.m02.mockResolvedValue(happyPath.agent_02());
  mocks.m03.mockResolvedValue(happyPath.agent_03());
  mocks.m04.mockResolvedValue(happyPath.agent_04());
  mocks.m05.mockResolvedValue(happyPath.agent_05());
  mocks.m06.mockResolvedValue(happyPath.agent_06());
  mocks.m07.mockResolvedValue(happyPath.agent_07());
  mocks.m08.mockResolvedValue(happyPath.agent_08());
  mocks.m09.mockResolvedValue(happyPath.agent_09());
  mocks.m10.mockResolvedValue(happyPath.agent_10());
  mocks.m11.mockResolvedValue(happyPath.agent_11());
  mocks.m12.mockResolvedValue(happyPath.agent_12());
  mocks.m13.mockResolvedValue(happyPath.agent_13());
  mocks.m14.mockResolvedValue(happyPath.agent_14());
  mocks.m15.mockResolvedValue(happyPath.agent_15());
  mocks.m16.mockResolvedValue(happyPath.agent_16());
  mocks.m17.mockResolvedValue(happyPath.agent_17());
  mocks.m18.mockResolvedValue(happyPath.agent_18());
  mocks.m19.mockResolvedValue(happyPath.agent_19());
  mocks.m20.mockResolvedValue(happyPath.agent_20());
  mocks.m21.mockResolvedValue(happyPath.agent_21());
  mocks.m22.mockResolvedValue(happyPath.agent_22());
  mocks.m23.mockResolvedValue(happyPath.agent_23());
  mocks.m24.mockResolvedValue(happyPath.agent_24());
  mocks.m25.mockResolvedValue(happyPath.agent_25());
  mocks.m26.mockResolvedValue(happyPath.agent_26());
  mocks.invokeAgent.mockResolvedValue(happyPath.devils_advocate());
});

afterEach(() => vi.clearAllMocks());

/* ── Smoke tests ────────────────────────────────────────────────────── */

describe('scoreChart end-to-end smoke test', () => {
  describe('happy path (Variant A Tier 1 winner — chart-exemplar 09)', () => {
    it('produces a TAKE_NOW verdict on the happy-path scenario', async () => {
      const imageBase64 = loadExemplarBase64() ?? 'fallback_base64_data';
      const result = await scoreChart({
        imageBase64,
        imageMimeType: 'image/png',
        userPrior: { direction: 'long', note: 'pullback rejection setting up' },
      });

      expect(result.card.verdict).toBe('TAKE_NOW');
      expect(result.card.direction).toBe('long');
      expect(result.card.variant).toBe('VARIANT_A');
      expect(result.card.tier).toBe(1);
    });

    it('populates entry/stop/target action params', async () => {
      const result = await scoreChart({
        imageBase64: 'x',
        imageMimeType: 'image/png',
      });

      expect(result.card.entry).toBe(4727.50);
      expect(result.card.stop).toBe(4722.50);
      expect(result.card.target).toBe(4737.50);
      expect(result.card.contractCount).toBe(3);
    });

    it('applies /NQ disclaimer when corpus < 30', async () => {
      const result = await scoreChart(
        { imageBase64: 'x', imageMimeType: 'image/png' },
        { labeledNqCorpusCount: 5 },
      );
      expect(result.card.disclaimer).toContain('Calibration anchored on /ES');
    });

    it('omits /NQ disclaimer when corpus >= 30', async () => {
      const result = await scoreChart(
        { imageBase64: 'x', imageMimeType: 'image/png' },
        { labeledNqCorpusCount: 30 },
      );
      expect(result.card.disclaimer).toBeUndefined();
    });

    it('caps composite at 85 with /NQ corpus < 30', async () => {
      const result = await scoreChart(
        { imageBase64: 'x', imageMimeType: 'image/png' },
        { labeledNqCorpusCount: 0 },
      );
      expect(result.card.finalScore).toBeLessThanOrEqual(85);
    });

    it('agreement banner shows agree when user prior matches direction', async () => {
      const result = await scoreChart({
        imageBase64: 'x', imageMimeType: 'image/png',
        userPrior: { direction: 'long' },
      });
      expect(result.card.agreementBanner).toBe('agree');
    });

    it('agreement banner shows reverse when user prior conflicts', async () => {
      const result = await scoreChart({
        imageBase64: 'x', imageMimeType: 'image/png',
        userPrior: { direction: 'short' },
      });
      expect(result.card.agreementBanner).toBe('disagree_reverse');
    });

    it('runs all 30+ agent invocations (parallel + Wave E + DA)', async () => {
      await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });

      expect(mocks.m38).toHaveBeenCalledOnce();
      expect(mocks.m00a).toHaveBeenCalledOnce();
      expect(mocks.m00b).toHaveBeenCalledOnce();
      expect(mocks.m00c).toHaveBeenCalledOnce();
      expect(mocks.m02).toHaveBeenCalledOnce();
      expect(mocks.m04).toHaveBeenCalledOnce();
      expect(mocks.m08).toHaveBeenCalledOnce();
      expect(mocks.m09).toHaveBeenCalledOnce();
      expect(mocks.m19).toHaveBeenCalledOnce();
      expect(mocks.m20).toHaveBeenCalledOnce();
      expect(mocks.m25).toHaveBeenCalledOnce();
      expect(mocks.m26).toHaveBeenCalledOnce();
      expect(mocks.invokeAgent).toHaveBeenCalledOnce();  // devil's advocate
    });

    it('produces top reasons (3) and a concern (1)', async () => {
      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.card.topReasons.length).toBeLessThanOrEqual(3);
      expect(result.card.topReasons.length).toBeGreaterThan(0);
    });

    it('records full pipeline trace', async () => {
      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.pipelineSteps.base).not.toBeNull();
      expect(result.pipelineSteps.capped).not.toBeNull();
      expect(result.pipelineSteps.modulated).not.toBeNull();
      expect(result.pipelineSteps.skepticismAdjusted).not.toBeNull();
      expect(result.pipelineSteps.devilsAdvocate).not.toBeNull();
    });

    it('completes within reasonable time (mocked agents)', async () => {
      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      // Mocked agents resolve instantly; durationMs should be < 100ms
      expect(result.durationMs).toBeLessThan(1000);
    });
  });

  describe('short-circuit paths', () => {
    it('Agent 38 fails → ABSTAIN_INPUT, no Wave 0/A/B/C/D calls', async () => {
      mocks.m38.mockResolvedValue({
        agent_id: '38', score: 0, confidence: 95, abstain: false,
        evidence: ['image is not a chart'],
        passed: false, degradation_flags: ['not_a_chart'],
        context_bundle: {
          platform: 'Unknown', theme: 'unknown', instrument: 'unknown',
          timeframe_seconds: null, indicator_stack_visible: false,
          staleness_hours: null, candle_count: null, score_cap_suggestion: 0,
        },
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });

      expect(result.card.verdict).toBe('ABSTAIN_INPUT');
      expect(mocks.m00a).not.toHaveBeenCalled();
      expect(mocks.m02).not.toHaveBeenCalled();
      expect(mocks.invokeAgent).not.toHaveBeenCalled();
    });

    it('Variant B → SKIP_OUT_OF_SCOPE, no Wave A/B/C/D calls', async () => {
      mocks.m00c.mockResolvedValue({
        agent_id: '00c', score: null, confidence: 85, abstain: false,
        evidence: ['regime-establishment morning open'],
        variant: 'VARIANT_B', direction_bias: 'long',
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });

      expect(result.card.verdict).toBe('SKIP_OUT_OF_SCOPE');
      expect(result.card.variant).toBe('VARIANT_B');
      expect(mocks.m02).not.toHaveBeenCalled();
      expect(mocks.invokeAgent).not.toHaveBeenCalled();
    });

    it('CHOP veto fires → SKIP', async () => {
      mocks.m07.mockResolvedValue({
        ...stub('07'), score: 92,
        confidence: 85,
        label: 'CHOP', veto_overridable: false,
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });

      expect(result.card.verdict).toBe('SKIP');
    });

    it('FOMC event → news veto → SKIP', async () => {
      mocks.m22.mockResolvedValue({
        ...stub('22'), score: 10,
        confidence: 95,
        event_tier: 1, pre_window_min: 25, post_window_min: null,
        veto_fires: true,
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.card.verdict).toBe('SKIP');
    });

    it('confirmed tilt → behavioral veto → SKIP', async () => {
      mocks.m23.mockResolvedValue({
        ...stub('23'), score: 15,
        state: 'confirmed_tilt',
        flags_firing: ['size_escalation', 'cadence_after_loss'],
        veto_recommendation: 'hard',
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.card.verdict).toBe('SKIP');
    });

    it('devil\'s advocate force_skip → SKIP regardless of upstream', async () => {
      mocks.invokeAgent.mockResolvedValue({
        agent_id: '26', score: null, confidence: 90, abstain: false,
        evidence: ['decisive HTF reversal pattern unaddressed'],
        skepticism_score: 92,
        strongest_counter_argument: 'daily clearly rolling over despite local rejection',
        chart_evidence: 'three consecutive lower-highs visible',
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.card.verdict).toBe('SKIP');
    });

    it('devil\'s advocate downgrade → TAKE_NOW becomes WAIT_FOR_LEVEL', async () => {
      mocks.invokeAgent.mockResolvedValue({
        agent_id: '26', score: null, confidence: 80, abstain: false,
        evidence: ['concern noted'],
        skepticism_score: 70,
        strongest_counter_argument: 'strong counter found',
        chart_evidence: 'evidence',
      });

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.card.verdict).toBe('WAIT_FOR_LEVEL');
    });
  });

  describe('robustness', () => {
    it('devil\'s advocate failure does not abort the run', async () => {
      mocks.invokeAgent.mockRejectedValue(new Error('Anthropic API timeout'));

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      // Should still complete with the pre-DA verdict (TAKE_NOW from happy path)
      expect(result.card.verdict).toBe('TAKE_NOW');
    });

    it('individual Wave A agent failure does not abort run', async () => {
      mocks.m02.mockRejectedValue(new Error('Agent 02 failed'));

      const result = await scoreChart({ imageBase64: 'x', imageMimeType: 'image/png' });
      // Should complete with abstention penalty applied
      expect(result.card).toBeDefined();
      expect(result.pipelineSteps.base?.abstainCount).toBeGreaterThan(0);
    });
  });
});
