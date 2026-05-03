import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent23 } from './agent-23';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '23', score: 70, confidence: 80, abstain: false,
      evidence: ['session_color STEADY', '2 trades today, both winners', 'no size escalation'],
      state: 'disciplined', flags_firing: [], veto_recommendation: 'none',
      ...overrides,
    }),
  }],
});

describe('runAgent23', () => {
  it('returns disciplined state with no veto', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent23({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.state).toBe('disciplined');
    expect(r.veto_recommendation).toBe('none');
  });

  it('uses Opus tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent23({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('handles confirmed_tilt with hard veto', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 15,
      state: 'confirmed_tilt',
      flags_firing: ['size_escalation', 'cadence_after_loss', 'streak_3_losses'],
      veto_recommendation: 'hard',
    }));
    const r = await runAgent23({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.state).toBe('confirmed_tilt');
    expect(r.veto_recommendation).toBe('hard');
  });

  it('passes behavioral context to user message', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent23({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      behavioralContext: 'session_color HEATED, 5 trades, 3 losses',
    });
    const userMsg = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    const textBlock = userMsg.find((c: { type: string; text?: string }) => c.type === 'text');
    expect(textBlock?.text).toContain('HEATED');
  });

  it('rejects invalid veto_recommendation', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ veto_recommendation: 'mild' }));
    await expect(runAgent23({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (no behavioral context)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true, abstain_reason: 'no behavioral context available',
      score: null, state: 'fresh', veto_recommendation: 'none',
    }));
    const r = await runAgent23({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
