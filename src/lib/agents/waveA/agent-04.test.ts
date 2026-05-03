import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent04 } from './agent-04';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '04',
      score: 90,
      confidence: 85,
      abstain: false,
      evidence: ['wick pierced 0.4 cloud width', 'reversed within 2 bars'],
      tier: 1,
      tier_provisional: false,
      cloud_touched: 'blue',
      penetration_class: 'shallow_body_entry',
      residence_bars: 2,
      rejection_wick_to_body_ratio: 2.5,
      multi_touch_count: 1,
      ...overrides,
    }),
  }],
});

describe('runAgent04', () => {
  it('returns tier and penetration class', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.tier).toBe(1);
    expect(r.cloud_touched).toBe('blue');
    expect(r.penetration_class).toBe('shallow_body_entry');
  });

  it('uses Opus 700 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(700);
  });

  it('handles all penetration classes', async () => {
    const classes = [
      'upper_edge_tag', 'shallow_body_entry', 'mid_cloud_penetration',
      'full_traverse_recovery', 'decisive_close_through', 'none',
    ];
    for (const c of classes) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ penetration_class: c }));
      const r = await runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.penetration_class).toBe(c);
    }
  });

  it('flags tier_provisional for Tier 3', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      tier: 3,
      tier_provisional: true,
      cloud_touched: 'white',
    }));
    const r = await runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.tier).toBe(3);
    expect(r.tier_provisional).toBe(true);
  });

  it('handles tier=null when no cloud touched', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      tier: null,
      cloud_touched: 'none',
      penetration_class: 'none',
      residence_bars: 0,
      rejection_wick_to_body_ratio: null,
    }));
    const r = await runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.tier).toBeNull();
    expect(r.rejection_wick_to_body_ratio).toBeNull();
  });

  it('rejects invalid cloud_touched', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ cloud_touched: 'red' }));
    await expect(runAgent04({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
