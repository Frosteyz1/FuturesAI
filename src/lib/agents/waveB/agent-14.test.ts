import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent14 } from './agent-14';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '14', score: 25, confidence: 70, abstain: false,
      evidence: ['no re-entry signal', 'clean rejection'],
      downgrade_factor: 0.0, variant_d_promotable: false,
      ...overrides,
    }),
  }],
});

describe('runAgent14', () => {
  it('returns failed-bounce metrics', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.downgrade_factor).toBe(0);
    expect(r.variant_d_promotable).toBe(false);
  });

  it('uses Opus 700 max_tokens (veto agent)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(700);
  });

  it('handles hard veto signature (score >= 85)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 90, confidence: 80,
      evidence: ['re-entry close inside cloud', 'amplitude decay 3 attempts'],
      downgrade_factor: 1.0,
    }));
    const r = await runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.downgrade_factor).toBe(1.0);
  });

  it('handles Variant D promotable flag', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 88, confidence: 85, downgrade_factor: 1.0,
      variant_d_promotable: true,
    }));
    const r = await runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.variant_d_promotable).toBe(true);
  });

  it('rejects downgrade_factor outside [0, 1]', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ downgrade_factor: 1.5 }));
    await expect(runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (no bounce visible)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'no cloud approach in window',
      score: null,
    }));
    const r = await runAgent14({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
