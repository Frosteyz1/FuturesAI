/**
 * Test runWaveA orchestration with mocked agent functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mock01, mock02, mock03, mock04, mock05, mock06, mock07, mock08 } = vi.hoisted(() => ({
  mock01: vi.fn(), mock02: vi.fn(), mock03: vi.fn(), mock04: vi.fn(),
  mock05: vi.fn(), mock06: vi.fn(), mock07: vi.fn(), mock08: vi.fn(),
}));

vi.mock('./agent-01', () => ({ runAgent01: mock01 }));
vi.mock('./agent-02', () => ({ runAgent02: mock02 }));
vi.mock('./agent-03', () => ({ runAgent03: mock03 }));
vi.mock('./agent-04', () => ({ runAgent04: mock04 }));
vi.mock('./agent-05', () => ({ runAgent05: mock05 }));
vi.mock('./agent-06', () => ({ runAgent06: mock06 }));
vi.mock('./agent-07', () => ({ runAgent07: mock07 }));
vi.mock('./agent-08', () => ({ runAgent08: mock08 }));

import { runWaveA } from './index';

const stub = (id: string) => ({
  agent_id: id, score: 80, confidence: 80, abstain: false, evidence: [],
});

const fixture = { imageBase64: 'x', imageMimeType: 'image/png' as const };

beforeEach(() => {
  for (const m of [mock01, mock02, mock03, mock04, mock05, mock06, mock07, mock08]) m.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('runWaveA', () => {
  it('runs all 8 agents in parallel and aggregates results', async () => {
    mock01.mockResolvedValue({ ...stub('01'), label: 'strong_young' });
    mock02.mockResolvedValue({
      ...stub('02'), regime_label: 'parallel_triple_stack_up',
      direction_bias: 'long', per_pair_slope: { blue: 0.1, yellow: 0.1, white: 0.1 },
      macro_visible: true,
    });
    mock03.mockResolvedValue({
      ...stub('03'), shape_signature: 'textbook_slow_grind', depth_tier_multiplier: 1.0,
    });
    mock04.mockResolvedValue({
      ...stub('04'), tier: 1, tier_provisional: false, cloud_touched: 'blue',
      penetration_class: 'shallow_body_entry', residence_bars: 1,
      rejection_wick_to_body_ratio: 2.5, multi_touch_count: 1,
    });
    mock05.mockResolvedValue({
      ...stub('05'), direction: 'long', intactness: 'intact',
      pivot_pairs_visible: 3, most_recent_pivot_bars_ago: 5,
    });
    mock06.mockResolvedValue({ ...stub('06'), state: 'established', consider_reversal: false });
    mock07.mockResolvedValue({ ...stub('07'), label: 'STRONG_TREND', veto_overridable: true });
    mock08.mockResolvedValue({
      ...stub('08'), alignment_against: 'none', direction_bias: 'long', tier_backdrop: 3,
    });

    const r = await runWaveA(fixture);

    expect(r.agent_01).not.toBeNull();
    expect(r.agent_02?.regime_label).toBe('parallel_triple_stack_up');
    expect(r.agent_07?.label).toBe('STRONG_TREND');
    expect(r.errors).toEqual([]);
  });

  it('records errors but keeps other agent outputs when one fails', async () => {
    mock01.mockResolvedValue({ ...stub('01'), label: 'strong_young' });
    mock02.mockRejectedValue(new Error('Agent 02 failed'));
    mock03.mockResolvedValue({
      ...stub('03'), shape_signature: 'mixed_signals', depth_tier_multiplier: 0.9,
    });
    mock04.mockResolvedValue({
      ...stub('04'), tier: 1, tier_provisional: false, cloud_touched: 'blue',
      penetration_class: 'none', residence_bars: 0,
      rejection_wick_to_body_ratio: null, multi_touch_count: 0,
    });
    mock05.mockResolvedValue({
      ...stub('05'), direction: 'long', intactness: 'intact',
      pivot_pairs_visible: 2, most_recent_pivot_bars_ago: 8,
    });
    mock06.mockResolvedValue({ ...stub('06'), state: 'established', consider_reversal: false });
    mock07.mockResolvedValue({ ...stub('07'), label: 'WEAK_TREND', veto_overridable: true });
    mock08.mockResolvedValue({
      ...stub('08'), alignment_against: 'none', direction_bias: 'long', tier_backdrop: 2,
    });

    const r = await runWaveA(fixture);

    expect(r.agent_01).not.toBeNull();
    expect(r.agent_02).toBeNull();
    expect(r.agent_03).not.toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.error).toContain('Agent 02 failed');
  });

  it('runs agents in parallel (not sequential)', async () => {
    let callsInFlight = 0;
    let maxInFlight = 0;
    const trackedStub = (id: string, payload: Record<string, unknown>) => async () => {
      callsInFlight++;
      maxInFlight = Math.max(maxInFlight, callsInFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      callsInFlight--;
      return { ...stub(id), ...payload };
    };

    mock01.mockImplementation(trackedStub('01', { label: 'strong_young' }));
    mock02.mockImplementation(trackedStub('02', {
      regime_label: 'x', direction_bias: 'long',
      per_pair_slope: { blue: 0, yellow: 0, white: 0 }, macro_visible: true,
    }));
    mock03.mockImplementation(trackedStub('03', {
      shape_signature: 'x', depth_tier_multiplier: 1,
    }));
    mock04.mockImplementation(trackedStub('04', {
      tier: 1, tier_provisional: false, cloud_touched: 'blue',
      penetration_class: 'none', residence_bars: 0,
      rejection_wick_to_body_ratio: null, multi_touch_count: 0,
    }));
    mock05.mockImplementation(trackedStub('05', {
      direction: 'long', intactness: 'intact', pivot_pairs_visible: 1,
      most_recent_pivot_bars_ago: 3,
    }));
    mock06.mockImplementation(trackedStub('06', { state: 'fresh', consider_reversal: false }));
    mock07.mockImplementation(trackedStub('07', {
      label: 'STRONG_TREND', veto_overridable: true,
    }));
    mock08.mockImplementation(trackedStub('08', {
      alignment_against: 'none', direction_bias: 'long', tier_backdrop: 3,
    }));

    await runWaveA(fixture);
    // All 8 should be in-flight simultaneously
    expect(maxInFlight).toBe(8);
  });
});
