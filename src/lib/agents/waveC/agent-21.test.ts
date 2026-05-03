import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent21 } from './agent-21';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '21', score: 80, confidence: 75, abstain: false,
      evidence: ['VIX dropping', 'ES showing same setup'],
      ...overrides,
    }),
  }],
});

describe('runAgent21', () => {
  it('returns correlation score', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent21({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBe(80);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent21({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles abstain (single-symbol upload)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'no multi-symbol context provided',
      score: null,
    }));
    const r = await runAgent21({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('handles regime conflict (low score)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 12,
      evidence: ['VIX rising sharply', 'ES rolling over', 'DXY breaking out'],
    }));
    const r = await runAgent21({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBeLessThan(15);
  });
});
