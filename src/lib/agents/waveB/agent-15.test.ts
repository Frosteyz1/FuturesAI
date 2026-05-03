import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent15 } from './agent-15';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '15', score: 88, confidence: 80, abstain: false,
      evidence: ['rejection bar high at 21302', 'fresh within 1 bar'],
      trigger_label: 'break_of_rejection_high', trigger_price: 21302.25,
      is_cascade_add: false,
      ...overrides,
    }),
  }],
});

describe('runAgent15', () => {
  it('returns break-of-rejection-high trigger', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent15({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.trigger_label).toBe('break_of_rejection_high');
    expect(r.trigger_price).toBe(21302.25);
    expect(r.is_cascade_add).toBe(false);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent15({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles cascade add with add_context', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      is_cascade_add: true,
      add_context: { add_at_higher_price_in_trend_direction: true },
    }));
    const r = await runAgent15({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.is_cascade_add).toBe(true);
    expect(r.add_context?.add_at_higher_price_in_trend_direction).toBe(true);
  });

  it('handles NO_TRIGGER (cascade scale-into-loss)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 20,
      trigger_label: 'NO_TRIGGER',
      trigger_price: null,
      is_cascade_add: true,
      add_context: { add_at_higher_price_in_trend_direction: false },
    }));
    const r = await runAgent15({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.trigger_label).toBe('NO_TRIGGER');
    expect(r.trigger_price).toBeNull();
  });

  it('handles abstain (Variant != A)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'Variant B uses different trigger model',
      score: null,
      trigger_price: null,
    }));
    const r = await runAgent15({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
