import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent10 } from './agent-10';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '10', score: 85, confidence: 80, abstain: false,
      evidence: ['lower wick 1.8 ATR', 'wick:body 3:1'],
      also_canonical_pattern: true,
      wick_to_body_ratio: 3.0,
      atr_relative_magnitude: 1.8,
      ...overrides,
    }),
  }],
});

describe('runAgent10', () => {
  it('returns wick metrics', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent10({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.wick_to_body_ratio).toBe(3.0);
    expect(r.atr_relative_magnitude).toBe(1.8);
    expect(r.also_canonical_pattern).toBe(true);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent10({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles null metrics (insufficient data for measurement)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      wick_to_body_ratio: null, atr_relative_magnitude: null,
      also_canonical_pattern: false, score: 30,
    }));
    const r = await runAgent10({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.wick_to_body_ratio).toBeNull();
    expect(r.atr_relative_magnitude).toBeNull();
  });

  it('handles abstain (ATR unreadable)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'price-axis labels not readable',
      score: null, also_canonical_pattern: false,
    }));
    const r = await runAgent10({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('rejects when also_canonical_pattern is missing', async () => {
    const response = {
      content: [{ type: 'text', text: JSON.stringify({
        agent_id: '10', score: 80, confidence: 80, abstain: false,
        evidence: [], wick_to_body_ratio: 2, atr_relative_magnitude: 1.5,
      })}],
    };
    mockMessagesCreate.mockResolvedValue(response);
    await expect(runAgent10({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
