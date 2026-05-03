import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ m25: vi.fn(), m26: vi.fn() }));

vi.mock('./agent-25', () => ({ runAgent25: mocks.m25 }));
vi.mock('./agent-26', () => ({ runAgent26: mocks.m26 }));

import { runWaveD } from './index';

const stub = (id: string) => ({
  agent_id: id, score: 80, confidence: 80, abstain: false, evidence: [],
});

const fixture = { imageBase64: 'x', imageMimeType: 'image/png' as const };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});
afterEach(() => vi.clearAllMocks());

describe('runWaveD', () => {
  it('runs 25 + 26 in parallel', async () => {
    mocks.m25.mockResolvedValue({
      ...stub('25'), score: 100, veto_label: 'none', veto_severity: 'none',
    });
    mocks.m26.mockResolvedValue({
      ...stub('26'), score: null, skepticism_score: 30,
      strongest_counter_argument: 'mild concern', chart_evidence: 'minor wick',
    });

    const r = await runWaveD(fixture);
    expect(r.agent_25?.veto_severity).toBe('none');
    expect(r.agent_26?.skepticism_score).toBe(30);
  });

  it('passes upstreamSummary to Agent 26', async () => {
    mocks.m25.mockResolvedValue({
      ...stub('25'), score: 100, veto_label: 'none', veto_severity: 'none',
    });
    mocks.m26.mockResolvedValue({
      ...stub('26'), score: null, skepticism_score: 50,
      strongest_counter_argument: 'x', chart_evidence: 'y',
    });

    await runWaveD({ ...fixture, upstreamSummary: 'Composite=82, Variant_A' });

    expect(mocks.m26).toHaveBeenCalledWith(
      expect.objectContaining({ upstreamSummary: 'Composite=82, Variant_A' }),
    );
  });
});
