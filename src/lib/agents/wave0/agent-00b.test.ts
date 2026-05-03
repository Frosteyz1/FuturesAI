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

import { runAgent00b } from './agent-00b';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const validResponse = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '00b',
      score: null,
      confidence: 80,
      abstain: false,
      evidence: ['Macro cloud rising', 'Price extended above blue'],
      state: 'TREND_ESTABLISHED_RUNNING',
      state_at_right_edge: 'TREND_ESTABLISHED_RUNNING',
      recommended_verdict_modes: ['WAIT_FOR_LEVEL', 'SKIP'],
      ...overrides,
    }),
  }],
});

describe('runAgent00b', () => {
  it('classifies trend-established-running correctly', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());

    const result = await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });

    expect(result.state).toBe('TREND_ESTABLISHED_RUNNING');
    expect(result.recommended_verdict_modes).toEqual(['WAIT_FOR_LEVEL', 'SKIP']);
  });

  it('uses Opus model tier (high-stakes routing)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('uses 600 max_tokens (Opus Wave 0 budget)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse());
    await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(600);
  });

  it('handles all 9 chart states', async () => {
    const states = [
      'TREND_ESTABLISHED_RUNNING',
      'TREND_FORMING',
      'PULLBACK_IN_PROGRESS',
      'REJECTION_FIRING',
      'POST_REJECTION_CONTINUATION',
      'RANGE_BOUND',
      'REGIME_TRANSITION',
      'MACRO_BREAK_RETEST',
      'INSUFFICIENT_HISTORY',
    ];
    for (const state of states) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(validResponse({
        state,
        state_at_right_edge: state,
      }));
      const result = await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(result.state).toBe(state);
    }
  });

  it('rejects unknown state', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({ state: 'BLOW_OFF_TOP' }));
    await expect(
      runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('rejects invalid recommended_verdict_modes value', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      recommended_verdict_modes: ['NOT_A_MODE'],
    }));
    await expect(
      runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' }),
    ).rejects.toThrow();
  });

  it('preserves state_at_right_edge as separate field for cycling charts', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      state: 'POST_REJECTION_CONTINUATION',
      state_at_right_edge: 'TREND_ESTABLISHED_RUNNING',
    }));
    const result = await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.state).not.toBe(result.state_at_right_edge);
  });

  it('handles abstain (chart unreadable)', async () => {
    mockMessagesCreate.mockResolvedValue(validResponse({
      abstain: true,
      abstain_reason: 'chart is too zoomed in to see the macro cloud',
      confidence: 30,
      state: 'INSUFFICIENT_HISTORY',
      state_at_right_edge: 'INSUFFICIENT_HISTORY',
      recommended_verdict_modes: ['SKIP'],
    }));
    const result = await runAgent00b({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(result.abstain).toBe(true);
  });
});
