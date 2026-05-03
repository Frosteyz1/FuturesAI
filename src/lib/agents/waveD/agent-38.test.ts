import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent38 } from './agent-38';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '38', score: 95, confidence: 95, abstain: false,
      evidence: ['NinjaTrader 1m chart', 'all 3 cloud pairs visible', 'NQ instrument'],
      passed: true, degradation_flags: [],
      context_bundle: {
        platform: 'NinjaTrader', theme: 'dark', instrument: 'NQ',
        timeframe_seconds: 60, indicator_stack_visible: true,
        staleness_hours: 0.1, candle_count: 80, score_cap_suggestion: null,
      },
      ...overrides,
    }),
  }],
});

describe('runAgent38', () => {
  it('passes pristine input', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.passed).toBe(true);
    expect(r.context_bundle.platform).toBe('NinjaTrader');
  });

  it('uses Sonnet 600 max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-sonnet-4-6');
    expect(call.max_tokens).toBe(600);
  });

  it('emits HARD ABSTAIN for non-chart input', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 0, passed: false,
      degradation_flags: ['not_a_chart'],
      evidence: ['image is a stock-broker website screenshot, not a price chart'],
      context_bundle: {
        platform: 'Unknown', theme: 'unknown', instrument: 'unknown',
        timeframe_seconds: null, indicator_stack_visible: false,
        staleness_hours: null, candle_count: null, score_cap_suggestion: 0,
      },
    }));
    const r = await runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.passed).toBe(false);
  });

  it('emits DEGRADE+FLAG for borderline input', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 65, passed: true,
      degradation_flags: ['low_resolution', 'stale_chart'],
      context_bundle: {
        platform: 'TOS Mobile', theme: 'dark', instrument: 'NQ',
        timeframe_seconds: 60, indicator_stack_visible: true,
        staleness_hours: 6, candle_count: 60, score_cap_suggestion: 75,
      },
    }));
    const r = await runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.passed).toBe(true);
    expect(r.degradation_flags).toHaveLength(2);
    expect(r.context_bundle.score_cap_suggestion).toBe(75);
  });

  it('rejects malformed context_bundle', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      context_bundle: { platform: 'NinjaTrader' }, // missing required fields
    }));
    await expect(runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles all theme values', async () => {
    for (const theme of ['dark', 'light', 'unknown']) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({
        context_bundle: {
          platform: 'TOS Mobile', theme, instrument: 'NQ',
          timeframe_seconds: 60, indicator_stack_visible: true,
          staleness_hours: 0.1, candle_count: 80, score_cap_suggestion: null,
        },
      }));
      const r = await runAgent38({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.context_bundle.theme).toBe(theme);
    }
  });
});
