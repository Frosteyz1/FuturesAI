import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent07 } from './agent-07';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '07',
      score: 25,
      confidence: 80,
      abstain: false,
      evidence: ['three clouds aligned and parallel', 'macro slope clearly positive'],
      label: 'STRONG_TREND',
      veto_overridable: true,
      ...overrides,
    }),
  }],
});

describe('runAgent07', () => {
  it('returns regime label and veto_overridable flag', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.label).toBe('STRONG_TREND');
    expect(r.veto_overridable).toBe(true);
  });

  it('uses Opus 700 max_tokens (veto agent)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(700);
  });

  it('handles hard CHOP veto (not overridable)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 90,
      label: 'CHOP',
      confidence: 85,
      veto_overridable: false,
    }));
    const r = await runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.label).toBe('CHOP');
    expect(r.veto_overridable).toBe(false);
  });

  it('handles all 7 regime labels', async () => {
    const labels = [
      'STRONG_TREND', 'WEAK_TREND', 'TRANSITION', 'COIL',
      'RANGE_DEFINED', 'CHOP', 'INSUFFICIENT_HISTORY',
    ];
    for (const label of labels) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ label }));
      const r = await runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.label).toBe(label);
    }
  });

  it('rejects invalid label', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ label: 'TRENDING_UP' }));
    await expect(runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles INSUFFICIENT_HISTORY (not abstain)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      label: 'INSUFFICIENT_HISTORY',
      score: null,
      veto_overridable: true,
    }));
    const r = await runAgent07({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.label).toBe('INSUFFICIENT_HISTORY');
    expect(r.abstain).toBe(false);
  });
});
