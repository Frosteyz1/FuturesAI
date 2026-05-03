import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent06 } from './agent-06';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '06',
      score: 50,
      confidence: 80,
      abstain: false,
      evidence: ['~25 bars in trend', 'no exhaustion signals'],
      state: 'established',
      consider_reversal: false,
      ...overrides,
    }),
  }],
});

describe('runAgent06', () => {
  it('returns established state with consider_reversal=false', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent06({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.state).toBe('established');
    expect(r.consider_reversal).toBe(false);
  });

  it('flags consider_reversal=true on actively_exhausting', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 90,
      state: 'actively_exhausting',
      consider_reversal: true,
    }));
    const r = await runAgent06({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.state).toBe('actively_exhausting');
    expect(r.consider_reversal).toBe(true);
  });

  it('handles all 7 maturity states', async () => {
    const states = [
      'fresh', 'developing', 'established', 'mature_but_ongoing',
      'stretched', 'actively_exhausting', 'blow_off',
    ];
    for (const state of states) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ state }));
      const r = await runAgent06({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.state).toBe(state);
    }
  });

  it('uses Opus tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent06({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('rejects invalid state', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ state: 'middle_age' }));
    await expect(runAgent06({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
