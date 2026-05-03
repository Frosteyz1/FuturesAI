import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent25 } from './agent-25';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '25', score: 100, confidence: 80, abstain: false,
      evidence: ['no V1/V5/V7/V8/V9/V11 conditions present'],
      veto_label: 'none', veto_severity: 'none',
      ...overrides,
    }),
  }],
});

describe('runAgent25', () => {
  it('returns no veto when conditions clean', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent25({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.veto_severity).toBe('none');
    expect(r.veto_label).toBe('none');
  });

  it('uses Opus tier 600 max_tokens (veto agent)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent25({ imageBase64: 'x', imageMimeType: 'image/png' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(600);
  });

  it('handles V8 incomplete-stack soft veto', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 50, veto_label: 'V8', veto_severity: 'soft',
      evidence: ['legacy 2-cloud template, no white macro visible'],
    }));
    const r = await runAgent25({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.veto_label).toBe('V8');
    expect(r.veto_severity).toBe('soft');
  });

  it('handles V5 macro-broken hard veto', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 0, veto_label: 'V5', veto_severity: 'hard',
      evidence: ['decisive close through white macro 4 bars ago, no retest'],
    }));
    const r = await runAgent25({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.veto_severity).toBe('hard');
  });

  it('rejects invalid veto_severity', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ veto_severity: 'medium' }));
    await expect(runAgent25({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
