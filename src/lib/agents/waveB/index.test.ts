import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  m09: vi.fn(), m10: vi.fn(), m11: vi.fn(), m12: vi.fn(),
  m13: vi.fn(), m14: vi.fn(), m15: vi.fn(), m16: vi.fn(),
}));

vi.mock('./agent-09', () => ({ runAgent09: mocks.m09 }));
vi.mock('./agent-10', () => ({ runAgent10: mocks.m10 }));
vi.mock('./agent-11', () => ({ runAgent11: mocks.m11 }));
vi.mock('./agent-12', () => ({ runAgent12: mocks.m12 }));
vi.mock('./agent-13', () => ({ runAgent13: mocks.m13 }));
vi.mock('./agent-14', () => ({ runAgent14: mocks.m14 }));
vi.mock('./agent-15', () => ({ runAgent15: mocks.m15 }));
vi.mock('./agent-16', () => ({ runAgent16: mocks.m16 }));

import { runWaveB } from './index';

const stub = (id: string) => ({
  agent_id: id, score: 80, confidence: 80, abstain: false, evidence: [],
});

const fixture = { imageBase64: 'x', imageMimeType: 'image/png' as const };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});
afterEach(() => vi.clearAllMocks());

describe('runWaveB', () => {
  it('runs all 8 agents and aggregates', async () => {
    mocks.m09.mockResolvedValue({
      ...stub('09'), pattern: 'hammer', quality: 'good', bars_since_pattern: 1,
    });
    mocks.m10.mockResolvedValue({
      ...stub('10'), also_canonical_pattern: true,
      wick_to_body_ratio: 2.5, atr_relative_magnitude: 1.5,
    });
    mocks.m11.mockResolvedValue(stub('11'));
    mocks.m12.mockResolvedValue({
      ...stub('12'), label: 'CONFIRMING', pattern: 'declining', session_context: 'RTH',
    });
    mocks.m13.mockResolvedValue(stub('13'));
    mocks.m14.mockResolvedValue({
      ...stub('14'), score: 20, downgrade_factor: 0, variant_d_promotable: false,
    });
    mocks.m15.mockResolvedValue({
      ...stub('15'), trigger_label: 'break_of_rejection_high',
      trigger_price: 21302, is_cascade_add: false,
    });
    mocks.m16.mockResolvedValue({
      ...stub('16'), stop_price: 21290, target_price: 21330,
      achievable_r: 3.3, forces_downgrade: false,
    });

    const r = await runWaveB(fixture);
    expect(r.agent_09?.pattern).toBe('hammer');
    expect(r.agent_14?.score).toBe(20);
    expect(r.errors).toEqual([]);
  });

  it('records partial failures', async () => {
    mocks.m09.mockResolvedValue({
      ...stub('09'), pattern: 'hammer', quality: 'good', bars_since_pattern: 1,
    });
    mocks.m10.mockRejectedValue(new Error('Agent 10 timeout'));
    mocks.m11.mockResolvedValue(stub('11'));
    mocks.m12.mockResolvedValue({
      ...stub('12'), label: 'NEUTRAL', pattern: 'unclear', session_context: 'RTH',
    });
    mocks.m13.mockResolvedValue(stub('13'));
    mocks.m14.mockResolvedValue({
      ...stub('14'), score: 20, downgrade_factor: 0, variant_d_promotable: false,
    });
    mocks.m15.mockResolvedValue({
      ...stub('15'), trigger_label: 'NO_TRIGGER',
      trigger_price: null, is_cascade_add: false,
    });
    mocks.m16.mockResolvedValue({
      ...stub('16'), stop_price: 21290, target_price: 21330,
      achievable_r: 3.3, forces_downgrade: false,
    });

    const r = await runWaveB(fixture);
    expect(r.agent_09).not.toBeNull();
    expect(r.agent_10).toBeNull();
    expect(r.errors).toHaveLength(1);
  });
});
