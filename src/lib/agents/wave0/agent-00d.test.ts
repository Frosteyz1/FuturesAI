import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();

vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
  },
}));

import { runAgent00d } from './agent-00d';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const validResponse = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '00d',
      score: 72,
      confidence: 75,
      abstain: false,
      evidence: ['blue cloud rising into 21300', 'macro slope still positive'],
      direction_bias: 'long',
      watch_level: 21300,
      watch_layer: 'blue',
      trigger_to_wait_for: 'rejection candle at blue cloud with wick > 1 ATR',
      expected_window: '15-60min',
      invalidation_price: 21250,
      ...overrides,
    }),
  }],
});

describe('runAgent00d', () => {
  it('returns watch-level recommendation', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());

    const result = await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });

    expect(result.direction_bias).toBe('long');
    expect(result.watch_level).toBe(21300);
    expect(result.watch_layer).toBe('blue');
    expect(result.expected_window).toBe('15-60min');
    expect(result.invalidation_price).toBe(21250);
  });

  it('uses Sonnet model tier', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles all expected_window values', async () => {
    const windows = ['5-15min', '15-60min', '1-3h', 'EOS', 'next-session'];
    for (const expected_window of windows) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(validResponse({ expected_window }));
      const result = await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.expected_window).toBe(expected_window);
    }
  });

  it('handles all watch_layer values', async () => {
    const layers = ['blue', 'yellow', 'white', 'none'];
    for (const watch_layer of layers) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(validResponse({ watch_layer }));
      const result = await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.watch_layer).toBe(watch_layer);
    }
  });

  it('rejects invalid expected_window', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ expected_window: '30min' }));
    await expect(
      runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('rejects invalid watch_layer', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ watch_layer: 'red' }));
    await expect(
      runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('handles abstain (no realistic level)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      abstain: true,
      abstain_reason: 'price more than 3 ATR from any cloud, no realistic watch',
      score: 30,
      direction_bias: 'none',
      watch_level: undefined,
      watch_layer: 'none',
    }));
    const result = await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.abstain).toBe(true);
    expect(result.watch_layer).toBe('none');
  });

  it('handles either-direction watch', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ direction_bias: 'either' }));
    const result = await runAgent00d({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.direction_bias).toBe('either');
  });
});
