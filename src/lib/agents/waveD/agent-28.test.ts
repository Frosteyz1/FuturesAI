import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent28 } from './agent-28';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '28', score: 90, confidence: 85, abstain: false,
      evidence: ['composite 88, Variant A Tier 2', 'no tilt'],
      bucket: 'NORMAL', contract_count: 3,
      pattern_shape: 'single', applied_modifiers: [],
      ...overrides,
    }),
  }],
});

describe('runAgent28', () => {
  it('emits NORMAL 3 contracts on high composite', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 88,
      upstreamContext: 'Variant_A Tier_2',
    });
    expect(r.bucket).toBe('NORMAL');
    expect(r.contract_count).toBe(3);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 88,
      upstreamContext: 'x',
    });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('passes composite score to user message', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 73,
      upstreamContext: 'context',
    });
    const userMsg = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    const textBlock = userMsg.find((c: { type: string; text?: string }) => c.type === 'text');
    expect(textBlock?.text).toContain('73');
  });

  it('emits SMALL on borderline composite', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      bucket: 'SMALL', contract_count: 1, score: 55,
    }));
    const r = await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 75,
      upstreamContext: 'x',
    });
    expect(r.bucket).toBe('SMALL');
    expect(r.contract_count).toBe(1);
  });

  it('emits SKIP on low composite', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      bucket: 'SKIP', contract_count: 0, score: 0,
    }));
    const r = await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 60,
      upstreamContext: 'x',
    });
    expect(r.bucket).toBe('SKIP');
  });

  it('handles cascade pattern shape', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      pattern_shape: 'staggered_reentry',
      applied_modifiers: ['cascade_add_discount'],
    }));
    const r = await runAgent28({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      compositeScore: 88,
      upstreamContext: 'is_cascade_add',
    });
    expect(r.pattern_shape).toBe('staggered_reentry');
  });

  it('rejects bucket=LARGE (gated in V1)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ bucket: 'LARGE', contract_count: 5 }));
    await expect(
      runAgent28({
        imageBase64: 'x',
        imageMimeType: 'image/png',
        compositeScore: 95,
        upstreamContext: 'x',
      }),
    ).rejects.toThrow();
  });

  it('rejects contract_count > 10', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ contract_count: 15 }));
    await expect(
      runAgent28({
        imageBase64: 'x',
        imageMimeType: 'image/png',
        compositeScore: 88,
        upstreamContext: 'x',
      }),
    ).rejects.toThrow();
  });
});
