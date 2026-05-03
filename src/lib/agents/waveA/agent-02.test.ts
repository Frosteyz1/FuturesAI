import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent02 } from './agent-02';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '02',
      score: 88,
      confidence: 85,
      abstain: false,
      evidence: ['three clouds parallel rising', 'macro slope steepening'],
      regime_label: 'parallel_triple_stack_up',
      direction_bias: 'long',
      per_pair_slope: { blue: 0.5, yellow: 0.3, white: 0.15 },
      macro_visible: true,
      ...overrides,
    }),
  }],
});

describe('runAgent02', () => {
  it('returns regime label and direction bias', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.regime_label).toBe('parallel_triple_stack_up');
    expect(r.direction_bias).toBe('long');
    expect(r.per_pair_slope.white).toBe(0.15);
  });

  it('uses Opus 700 max_tokens (heavier scoring)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(700);
  });

  it('captures macro_visible: false for cropped TOS mobile', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      macro_visible: false,
      confidence: 65,
      regime_label: 'transition_macro_unclear',
    }));
    const r = await runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.macro_visible).toBe(false);
    expect(r.confidence).toBe(65);
  });

  it('rejects malformed per_pair_slope', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      per_pair_slope: { blue: 'rising', yellow: 0.3, white: 0.15 },
    }));
    await expect(runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('rejects missing macro_visible', async () => {
    const response = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          agent_id: '02', score: 80, confidence: 80, abstain: false,
          evidence: [], regime_label: 'x', direction_bias: 'long',
          per_pair_slope: { blue: 0, yellow: 0, white: 0 },
        }),
      }],
    };
    mockMessagesCreate.mockResolvedValue(response);
    await expect(runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles bear regime', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      regime_label: 'parallel_triple_stack_down',
      direction_bias: 'short',
      per_pair_slope: { blue: -0.5, yellow: -0.3, white: -0.15 },
    }));
    const r = await runAgent02({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.direction_bias).toBe('short');
  });
});
