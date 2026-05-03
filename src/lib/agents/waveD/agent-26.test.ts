import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent26 } from './agent-26';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '26', score: null, confidence: 80, abstain: false,
      evidence: ['daily showing lower highs not noted by Agent 17'],
      skepticism_score: 60,
      strongest_counter_argument: 'HTF showing reversal pattern unaddressed',
      chart_evidence: 'last 3 daily closes lower than prior pivot',
      ...overrides,
    }),
  }],
});

describe('runAgent26', () => {
  it('returns skepticism with counter argument', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent26({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.skepticism_score).toBe(60);
    expect(r.strongest_counter_argument).toContain('HTF');
  });

  it('uses Opus tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent26({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('passes upstreamSummary to user message', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent26({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      upstreamSummary: 'Composite=82, Variant_A, Tier_2_confluence',
    });
    const userMsg = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    const textBlock = userMsg.find((c: { type: string; text?: string }) => c.type === 'text');
    expect(textBlock?.text).toContain('Composite=82');
  });

  it('handles low-skepticism (no counter found)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      skepticism_score: 12,
      strongest_counter_argument: null,
      chart_evidence: null,
    }));
    const r = await runAgent26({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.skepticism_score).toBeLessThan(25);
    expect(r.strongest_counter_argument).toBeNull();
  });

  it('rejects skepticism_score outside [0, 100]', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ skepticism_score: 150 }));
    await expect(runAgent26({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
