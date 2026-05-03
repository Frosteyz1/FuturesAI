import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent18 } from './agent-18';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '18', score: 80, confidence: 95, abstain: false,
      evidence: ['timestamp 9:45 ET', 'cash_open bucket'],
      multiplier: 1.10, session_bucket: 'cash_open',
      event_window_proximity: false,
      ...overrides,
    }),
  }],
});

describe('runAgent18', () => {
  it('returns session bucket and multiplier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.session_bucket).toBe('cash_open');
    expect(r.multiplier).toBe(1.10);
  });

  it('uses Haiku tier 350 max_tokens (cheap)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-haiku-4-5-20251001');
    expect(call.max_tokens).toBe(350);
  });

  it('handles lunch_chop bucket (lowest edge)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 30, multiplier: 0.80, session_bucket: 'lunch_chop',
    }));
    const r = await runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.session_bucket).toBe('lunch_chop');
    expect(r.multiplier).toBeLessThan(1);
  });

  it('flags event_window_proximity when applicable', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      session_bucket: 'event_window',
      multiplier: 0.75, event_window_proximity: true,
    }));
    const r = await runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.event_window_proximity).toBe(true);
  });

  it('rejects multiplier outside [0.7, 1.25]', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ multiplier: 1.5 }));
    await expect(runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (timestamp unreadable)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'timestamp not visible on chart',
      score: null, multiplier: 1.00, session_bucket: 'unknown',
    }));
    const r = await runAgent18({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
