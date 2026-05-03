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

import { runAgent00c } from './agent-00c';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const validResponse = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '00c',
      score: null,
      confidence: 80,
      abstain: false,
      evidence: ['hammer rejection at blue cloud edge', 'macro cloud rising'],
      variant: 'VARIANT_A',
      direction_bias: 'long',
      ...overrides,
    }),
  }],
});

describe('runAgent00c', () => {
  it('classifies Variant A (the V1 happy path)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());

    const result = await runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' });

    expect(result.variant).toBe('VARIANT_A');
    expect(result.direction_bias).toBe('long');
  });

  it('uses Opus model tier', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('handles V2 variants (out of scope for V1)', async () => {
    const v2Variants = ['VARIANT_B', 'VARIANT_C', 'VARIANT_D', 'OTHER_PATTERNED'];
    for (const variant of v2Variants) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(validResponse({ variant }));
      const result = await runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.variant).toBe(variant);
    }
  });

  it('handles ABSTAIN_INPUT for unreadable charts', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      variant: 'ABSTAIN_INPUT',
      abstain: true,
      abstain_reason: 'chart is too zoomed out to identify variant',
      confidence: 30,
      direction_bias: 'none',
    }));
    const result = await runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.variant).toBe('ABSTAIN_INPUT');
    expect(result.abstain).toBe(true);
  });

  it('rejects invalid variant', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ variant: 'VARIANT_E' }));
    await expect(
      runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('preserves secondary_variants when populated', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      confidence: 50,
      variant: 'VARIANT_A',
      secondary_variants: ['VARIANT_B'],
    }));
    const result = await runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.secondary_variants).toEqual(['VARIANT_B']);
  });

  it('rejects invalid direction_bias', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ direction_bias: 'sideways' }));
    await expect(
      runAgent00c({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });
});
