import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent22 } from './agent-22';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '22', score: 90, confidence: 90, abstain: false,
      evidence: ['no events within 60 min', 'clean window'],
      event_tier: null, pre_window_min: null, post_window_min: null,
      veto_fires: false,
      ...overrides,
    }),
  }],
});

describe('runAgent22', () => {
  it('returns clean window score with no veto', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent22({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.veto_fires).toBe(false);
    expect(r.score).toBe(90);
  });

  it('uses Opus 600 max_tokens (veto)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent22({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(600);
  });

  it('passes event context to user message when provided', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent22({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      eventContext: 'FOMC at 14:00 ET',
    });
    const userMsg = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    const textBlock = userMsg.find((c: { type: string; text?: string }) => c.type === 'text');
    expect(textBlock?.text).toContain('FOMC at 14:00 ET');
  });

  it('fires veto on T1 event proximity', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 10,
      evidence: ['FOMC release in 25 minutes'],
      event_tier: 1, pre_window_min: 25,
      veto_fires: true,
    }));
    const r = await runAgent22({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.veto_fires).toBe(true);
    expect(r.event_tier).toBe(1);
  });

  it('handles abstain (timestamp unreadable)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'timestamp not readable on chart',
      score: null,
    }));
    const r = await runAgent22({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('rejects invalid event_tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ event_tier: 4 }));
    await expect(runAgent22({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
