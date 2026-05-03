import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  m17: vi.fn(), m18: vi.fn(), m19: vi.fn(), m20: vi.fn(),
  m21: vi.fn(), m22: vi.fn(), m23: vi.fn(), m24: vi.fn(),
}));

vi.mock('./agent-17', () => ({ runAgent17: mocks.m17 }));
vi.mock('./agent-18', () => ({ runAgent18: mocks.m18 }));
vi.mock('./agent-19', () => ({ runAgent19: mocks.m19 }));
vi.mock('./agent-20', () => ({ runAgent20: mocks.m20 }));
vi.mock('./agent-21', () => ({ runAgent21: mocks.m21 }));
vi.mock('./agent-22', () => ({ runAgent22: mocks.m22 }));
vi.mock('./agent-23', () => ({ runAgent23: mocks.m23 }));
vi.mock('./agent-24', () => ({ runAgent24: mocks.m24 }));

import { runWaveC } from './index';

const stub = (id: string) => ({
  agent_id: id, score: 80, confidence: 80, abstain: false, evidence: [],
});

const fixture = { imageBase64: 'x', imageMimeType: 'image/png' as const };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});
afterEach(() => vi.clearAllMocks());

describe('runWaveC', () => {
  it('runs all 8 agents and aggregates', async () => {
    mocks.m17.mockResolvedValue(stub('17'));
    mocks.m18.mockResolvedValue({
      ...stub('18'), multiplier: 1.05, session_bucket: 'mid_morning',
      event_window_proximity: false,
    });
    mocks.m19.mockResolvedValue({
      ...stub('19'), top_matches: [],
      outcome_distribution: { wins: 0, losses: 0, be: 0, no_trade: 0 },
    });
    mocks.m20.mockResolvedValue({
      ...stub('20'), touches_relevant_cloud: 1, bars_since_last_touch: 5,
      recent_failed_same_direction: 0, recent_won_same_direction: 0,
      cloud_broken_through_in_window: false,
    });
    mocks.m21.mockResolvedValue(stub('21'));
    mocks.m22.mockResolvedValue({
      ...stub('22'), event_tier: null, pre_window_min: null,
      post_window_min: null, veto_fires: false,
    });
    mocks.m23.mockResolvedValue({
      ...stub('23'), state: 'disciplined', flags_firing: [],
      veto_recommendation: 'none',
    });
    mocks.m24.mockResolvedValue({
      ...stub('24'), regime: 'NORMAL', multiplier: 1.0,
    });

    const r = await runWaveC({ ...fixture, candidatesContext: 'corpus' });
    expect(r.agent_19?.outcome_distribution.wins).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it('passes contexts to context-aware agents', async () => {
    mocks.m17.mockResolvedValue(stub('17'));
    mocks.m18.mockResolvedValue({
      ...stub('18'), multiplier: 1.0, session_bucket: 'cash_open',
      event_window_proximity: false,
    });
    mocks.m19.mockResolvedValue({
      ...stub('19'), top_matches: [],
      outcome_distribution: { wins: 0, losses: 0, be: 0, no_trade: 0 },
    });
    mocks.m20.mockResolvedValue({
      ...stub('20'), touches_relevant_cloud: 0, bars_since_last_touch: null,
      recent_failed_same_direction: 0, recent_won_same_direction: 0,
      cloud_broken_through_in_window: false,
    });
    mocks.m21.mockResolvedValue(stub('21'));
    mocks.m22.mockResolvedValue({
      ...stub('22'), event_tier: 1, pre_window_min: 25,
      post_window_min: null, veto_fires: true,
    });
    mocks.m23.mockResolvedValue({
      ...stub('23'), state: 'fresh', flags_firing: [], veto_recommendation: 'none',
    });
    mocks.m24.mockResolvedValue({
      ...stub('24'), regime: 'NORMAL', multiplier: 1.0,
    });

    await runWaveC({
      ...fixture,
      candidatesContext: 'CANDIDATES',
      eventContext: 'FOMC at 14:00',
      behavioralContext: 'session_color STEADY',
    });

    expect(mocks.m19).toHaveBeenCalledWith(
      expect.objectContaining({ candidatesContext: 'CANDIDATES' }),
    );
    expect(mocks.m22).toHaveBeenCalledWith(
      expect.objectContaining({ eventContext: 'FOMC at 14:00' }),
    );
    expect(mocks.m23).toHaveBeenCalledWith(
      expect.objectContaining({ behavioralContext: 'session_color STEADY' }),
    );
  });
});
