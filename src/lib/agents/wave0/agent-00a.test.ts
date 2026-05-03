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

import { runAgent00a } from './agent-00a';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const validResponse = (overrides: Record<string, unknown> = {}) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        agent_id: '00a',
        score: null,
        confidence: 95,
        abstain: false,
        evidence: ['NinjaTrader header reads "1 Minute"'],
        timeframe: '1m',
        source: 'label_detected',
        ...overrides,
      }),
    },
  ],
});

describe('runAgent00a', () => {
  it('returns parsed timeframe on success', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());

    const result = await runAgent00a({
      imageBase64: 'IMG',
      imageMimeType: 'image/png',
    });

    expect(result.timeframe).toBe('1m');
    expect(result.source).toBe('label_detected');
    expect(result.confidence).toBe(95);
    expect(result.abstain).toBe(false);
  });

  it('uses Haiku model tier', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-haiku-4-5-20251001');
  });

  it('caps max_tokens at 350 (Haiku budget)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(350);
  });

  it('handles abstain response correctly', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      timeframe: 'UNKNOWN',
      source: 'abstain',
      confidence: 50,
      abstain: true,
      abstain_reason: 'no timeframe label visible',
    }));

    const result = await runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.abstain).toBe(true);
    expect(result.timeframe).toBe('UNKNOWN');
  });

  it('rejects invalid timeframe enum value', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ timeframe: '7m' }));
    await expect(
      runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('rejects when source is missing', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"00a","timeframe":"1m","confidence":80}' }],
    });
    await expect(
      runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('handles inferred-from-bar-density confidence cap', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      source: 'inferred_from_bar_density',
      confidence: 65,
      timeframe: '1m',
    }));

    const result = await runAgent00a({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.source).toBe('inferred_from_bar_density');
    expect(result.confidence).toBeLessThanOrEqual(70);
  });
});
