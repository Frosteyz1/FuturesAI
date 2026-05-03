import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent01 } from './agent-01';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '01',
      score: 82,
      confidence: 80,
      abstain: false,
      evidence: ['macro cloud sloping up', '8 bars since against-trend cross'],
      label: 'strong_young',
      ...overrides,
    }),
  }],
});

describe('runAgent01', () => {
  it('returns trend strength label', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent01({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.label).toBe('strong_young');
    expect(r.score).toBe(82);
  });

  it('uses Opus tier with 600 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent01({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(600);
  });

  it('handles all 8 labels', async () => {
    const labels = [
      'strong_young', 'strong_mature', 'healthy_ongoing', 'trend_forming',
      'weak_decaying', 'chop_disguised', 'no_trend', 'parabolic_exhaustion',
    ];
    for (const label of labels) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ label }));
      const r = await runAgent01({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.label).toBe(label);
    }
  });

  it('rejects invalid label', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ label: 'mega_strong' }));
    await expect(runAgent01({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (chart unreadable)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'macro cloud cropped on TOS mobile',
      score: null,
      label: 'no_trend',
    }));
    const r = await runAgent01({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
