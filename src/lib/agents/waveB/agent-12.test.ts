import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent12 } from './agent-12';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '12', score: 88, confidence: 80, abstain: false,
      evidence: ['declining pullback volume', 'expansion on rejection bar'],
      label: 'CONFIRMING', pattern: 'declining-pullback', session_context: 'RTH',
      ...overrides,
    }),
  }],
});

describe('runAgent12', () => {
  it('returns confirming volume label', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent12({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.label).toBe('CONFIRMING');
    expect(r.session_context).toBe('RTH');
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent12({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles all 6 volume labels', async () => {
    const labels = ['CONFIRMING', 'SUPPORTING', 'NEUTRAL', 'DISCONFIRMING', 'CLIMAX_FADE', 'FALSE_BREAK_RISK'];
    for (const label of labels) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ label }));
      const r = await runAgent12({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.label).toBe(label);
    }
  });

  it('handles abstain when volume not visible', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'volume pane cropped on NinjaTrader chart',
      score: null, label: 'NEUTRAL', session_context: 'unknown',
    }));
    const r = await runAgent12({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
    expect(r.session_context).toBe('unknown');
  });

  it('rejects invalid session_context', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ session_context: 'AFTER_HOURS' }));
    await expect(runAgent12({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
