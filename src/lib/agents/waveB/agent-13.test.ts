import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent13 } from './agent-13';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '13', score: 82, confidence: 80, abstain: false,
      evidence: ['body-to-range 0.6 average', 'low doji density', 'consistent rhythm'],
      ...overrides,
    }),
  }],
});

describe('runAgent13', () => {
  it('returns crispness score', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent13({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBe(82);
  });

  it('uses Sonnet 500 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent13({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(500);
  });

  it('handles low score (doji-heavy)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 22,
      evidence: ['high doji density 60%', 'inconsistent rhythm'],
    }));
    const r = await runAgent13({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBe(22);
  });

  it('handles abstain (Heikin Ashi detected)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'Heikin Ashi candles detected, different visual semantics',
      score: null,
    }));
    const r = await runAgent13({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('rejects when confidence is out of range', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ confidence: 150 }));
    await expect(runAgent13({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
