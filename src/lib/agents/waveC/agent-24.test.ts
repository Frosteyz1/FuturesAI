import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent24 } from './agent-24';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '24', score: 80, confidence: 80, abstain: false,
      evidence: ['cloud band normal width', 'bars typical size'],
      regime: 'NORMAL', multiplier: 1.0,
      ...overrides,
    }),
  }],
});

describe('runAgent24', () => {
  it('returns regime classification and multiplier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.regime).toBe('NORMAL');
    expect(r.multiplier).toBe(1.0);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles all 5 regime classifications', async () => {
    const cases = [
      { regime: 'DEAD', multiplier: 0.40 },
      { regime: 'LOW', multiplier: 0.85 },
      { regime: 'NORMAL', multiplier: 1.00 },
      { regime: 'ELEVATED', multiplier: 1.10 },
      { regime: 'EXTREME', multiplier: 0.70 },
    ];
    for (const c of cases) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ regime: c.regime, multiplier: c.multiplier }));
      const r = await runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.regime).toBe(c.regime);
      expect(r.multiplier).toBe(c.multiplier);
    }
  });

  it('rejects invalid regime', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ regime: 'CRAZY' }));
    await expect(runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('rejects multiplier outside [0.3, 1.5]', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ multiplier: 2.0 }));
    await expect(runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (Heikin Ashi)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'Heikin Ashi candles detected',
      score: null,
    }));
    const r = await runAgent24({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
