import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent17 } from './agent-17';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '17', score: 85, confidence: 80, abstain: false,
      evidence: ['daily trending up cleanly', 'entry near prior weekly swing low'],
      ...overrides,
    }),
  }],
});

describe('runAgent17', () => {
  it('returns HTF agreement score', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent17({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBe(85);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent17({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles abstain when no HTF screenshot', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'no HTF screenshot provided',
      score: null,
    }));
    const r = await runAgent17({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('handles HTF disagreement', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 12,
      evidence: ['HTF clearly rolling over', 'daily lower highs'],
    }));
    const r = await runAgent17({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBeLessThan(15);
  });

  it('rejects when score is out of range', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ confidence: -5 }));
    await expect(runAgent17({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
