import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent09 } from './agent-09';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '09', score: 88, confidence: 80, abstain: false,
      evidence: ['hammer at blue cloud edge', 'wick 2.5x body'],
      pattern: 'hammer', quality: 'textbook', bars_since_pattern: 1,
      ...overrides,
    }),
  }],
});

describe('runAgent09', () => {
  it('returns hammer pattern with quality grade', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent09({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.pattern).toBe('hammer');
    expect(r.quality).toBe('textbook');
  });

  it('uses Sonnet 500 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent09({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-sonnet-4-6');
    expect(call.max_tokens).toBe(500);
  });

  it('handles all quality grades', async () => {
    for (const quality of ['textbook', 'good', 'mediocre', 'weak', 'absent']) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ quality }));
      const r = await runAgent09({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.quality).toBe(quality);
    }
  });

  it('handles bars_since_pattern null when pattern absent', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      pattern: 'absent', quality: 'absent', bars_since_pattern: null, score: 0,
    }));
    const r = await runAgent09({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.bars_since_pattern).toBeNull();
  });

  it('rejects invalid quality value', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ quality: 'amazing' }));
    await expect(runAgent09({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
