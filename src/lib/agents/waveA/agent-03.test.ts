import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent03 } from './agent-03';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '03',
      score: 85,
      confidence: 80,
      abstain: false,
      evidence: ['slow grind back to micro cloud', 'declining red bodies'],
      shape_signature: 'textbook_slow_grind',
      depth_tier_multiplier: 1.0,
      ...overrides,
    }),
  }],
});

describe('runAgent03', () => {
  it('returns pullback shape signature', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent03({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.shape_signature).toBe('textbook_slow_grind');
    expect(r.depth_tier_multiplier).toBe(1.0);
  });

  it('uses Opus tier 600 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent03({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(600);
  });

  it('captures depth-tier multiplier variations', async () => {
    const cases = [
      { sig: 'sharp_flush_clean', mult: 1.05 },
      { sig: 'broken_pullback', mult: 0.5 },
    ];
    for (const c of cases) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({
        shape_signature: c.sig,
        depth_tier_multiplier: c.mult,
      }));
      const r = await runAgent03({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.depth_tier_multiplier).toBe(c.mult);
    }
  });

  it('handles abstain when variant is not A', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'pullback geometry not applicable to Variant B',
      score: null,
      shape_signature: 'not_a_pullback',
      depth_tier_multiplier: 0,
    }));
    const r = await runAgent03({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
    expect(r.score).toBeNull();
  });

  it('rejects when depth_tier_multiplier is missing', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          agent_id: '03', score: 80, confidence: 80, abstain: false,
          evidence: [], shape_signature: 'mixed_signals',
        }),
      }],
    });
    await expect(runAgent03({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
