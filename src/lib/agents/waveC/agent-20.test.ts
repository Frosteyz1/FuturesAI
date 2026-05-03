import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent20 } from './agent-20';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '20', score: 92, confidence: 90, abstain: false,
      evidence: ['no prior touches', 'fresh first touch of blue cloud'],
      touches_relevant_cloud: 0, bars_since_last_touch: null,
      recent_failed_same_direction: 0, recent_won_same_direction: 0,
      cloud_broken_through_in_window: false,
      ...overrides,
    }),
  }],
});

describe('runAgent20', () => {
  it('returns freshness counts', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent20({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.touches_relevant_cloud).toBe(0);
    expect(r.bars_since_last_touch).toBeNull();
  });

  it('uses Haiku 350 max_tokens (cheap)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent20({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-haiku-4-5-20251001');
    expect(call.max_tokens).toBe(350);
  });

  it('handles cascade-continuation high score', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 70,
      touches_relevant_cloud: 3,
      recent_won_same_direction: 2, recent_failed_same_direction: 0,
      bars_since_last_touch: 12,
      evidence: ['3 prior touches all winners', 'cascade-continuation pattern'],
    }));
    const r = await runAgent20({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.recent_won_same_direction).toBe(2);
  });

  it('handles broken-and-retested low score', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 8,
      cloud_broken_through_in_window: true,
      bars_since_last_touch: 5,
      evidence: ['cloud broken via close 5 bars ago', 'level chewed up'],
    }));
    const r = await runAgent20({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.cloud_broken_through_in_window).toBe(true);
    expect(r.score).toBeLessThan(15);
  });

  it('rejects negative touches_relevant_cloud', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ touches_relevant_cloud: -1 }));
    await expect(runAgent20({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
