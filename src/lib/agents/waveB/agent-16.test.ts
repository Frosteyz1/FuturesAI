import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent16 } from './agent-16';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '16', score: 88, confidence: 80, abstain: false,
      evidence: ['stop at swing low 21290', 'target prior high 21330', 'R:R 3.3'],
      stop_price: 21290, target_price: 21330, achievable_r: 3.3,
      forces_downgrade: false,
      ...overrides,
    }),
  }],
});

describe('runAgent16', () => {
  it('returns stop/target/achievable_r', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent16({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.stop_price).toBe(21290);
    expect(r.target_price).toBe(21330);
    expect(r.achievable_r).toBe(3.3);
    expect(r.forces_downgrade).toBe(false);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent16({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('flags forces_downgrade for poor R:R', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 25, achievable_r: 0.8,
      forces_downgrade: true,
      evidence: ['target only 1pt past round number', 'R:R 0.8'],
    }));
    const r = await runAgent16({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.forces_downgrade).toBe(true);
    expect(r.achievable_r).toBeLessThan(1.0);
  });

  it('handles abstain (no structural levels)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'no swing pivot identifiable, no opposing cloud',
      score: null, stop_price: null, target_price: null, achievable_r: null,
    }));
    const r = await runAgent16({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
    expect(r.achievable_r).toBeNull();
  });

  it('rejects when forces_downgrade is missing', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        agent_id: '16', score: 80, confidence: 80, abstain: false,
        evidence: [], stop_price: 100, target_price: 110, achievable_r: 2,
      })}],
    });
    await expect(runAgent16({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
