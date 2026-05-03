import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent05 } from './agent-05';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '05',
      score: 88,
      confidence: 85,
      abstain: false,
      evidence: ['three HH/HL pairs visible', 'most recent pullback held above prior HL'],
      direction: 'long',
      intactness: 'intact',
      pivot_pairs_visible: 3,
      most_recent_pivot_bars_ago: 6,
      ...overrides,
    }),
  }],
});

describe('runAgent05', () => {
  it('returns intact long structure', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.direction).toBe('long');
    expect(r.intactness).toBe('intact');
    expect(r.pivot_pairs_visible).toBe(3);
  });

  it('uses Opus 600 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(600);
  });

  it('handles all 6 intactness states', async () => {
    const states = [
      'intact', 'forming', 'ambiguous',
      'broken_wick', 'broken_close', 'broken_acceptance',
    ];
    for (const intactness of states) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ intactness }));
      const r = await runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.intactness).toBe(intactness);
    }
  });

  it('handles range-mode (direction = either)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      direction: 'either',
      intactness: 'forming',
    }));
    const r = await runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.direction).toBe('either');
  });

  it('handles abstain (insufficient bars)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'fewer than 30 bars visible',
      score: null,
      pivot_pairs_visible: 0,
      most_recent_pivot_bars_ago: null,
    }));
    const r = await runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
    expect(r.most_recent_pivot_bars_ago).toBeNull();
  });

  it('rejects invalid intactness', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ intactness: 'sideways' }));
    await expect(runAgent05({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
