import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent08 } from './agent-08';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '08',
      score: 88,
      confidence: 85,
      abstain: false,
      evidence: ['triple-stack parallel rising', 'all three slopes positive'],
      alignment_against: 'none',
      direction_bias: 'long',
      tier_backdrop: 3,
      ...overrides,
    }),
  }],
});

describe('runAgent08', () => {
  it('returns clean alignment with tier 3 backdrop', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.alignment_against).toBe('none');
    expect(r.tier_backdrop).toBe(3);
  });

  it('uses Opus tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-opus-4-7');
  });

  it('handles all 5 alignment_against values (drives Wave E cap)', async () => {
    const values = [
      'none', 'short_structural', 'macro', 'both_macro_and_short_structural', 'all_tangled',
    ];
    for (const alignment_against of values) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ alignment_against }));
      const r = await runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.alignment_against).toBe(alignment_against);
    }
  });

  it('handles all 4 tier_backdrop values', async () => {
    for (const tier_backdrop of [0, 1, 2, 3]) {
      mockMessagesCreate.mockReset();
      mockMessagesCreate.mockResolvedValue(valid({ tier_backdrop }));
      const r = await runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' });
      expect(r.tier_backdrop).toBe(tier_backdrop);
    }
  });

  it('rejects tier_backdrop=4', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ tier_backdrop: 4 }));
    await expect(runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('rejects invalid alignment_against', async () => {
    mockMessagesCreate.mockResolvedValue(valid({ alignment_against: 'macro_only' }));
    await expect(runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });

  it('handles abstain (macro cropped)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'macro cloud cropped on TOS mobile, fewer than 30 bars visible',
      score: null,
      tier_backdrop: 1,
    }));
    const r = await runAgent08({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });
});
