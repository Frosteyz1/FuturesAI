import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent19 } from './agent-19';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '19', score: 88, confidence: 80, abstain: false,
      evidence: ['Tier 1 micro pullback signature matches multiple corpus winners'],
      top_matches: [
        {
          corpus_id: '009',
          cosine_similarity: 0.88,
          outcome: 'W',
          instrument_caveat: true,
          seed_only: true,
          resemblance_diff: {
            shared: ['Tier 1 blue cloud bounce', 'macro rising'],
            different: ['current 1m, match 20s'],
          },
        },
      ],
      outcome_distribution: { wins: 6, losses: 2, be: 1, no_trade: 1 },
      ...overrides,
    }),
  }],
});

describe('runAgent19', () => {
  it('returns top matches and outcome distribution', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent19({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      candidatesContext: '<corpus candidates here>',
    });
    expect(r.top_matches).toHaveLength(1);
    expect(r.top_matches[0]?.cosine_similarity).toBe(0.88);
    expect(r.outcome_distribution.wins).toBe(6);
  });

  it('uses Opus 800 max_tokens (spine agent)', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent19({ imageBase64: 'x', imageMimeType: 'image/png', candidatesContext: 'x' });
    const call = mockMessagesCreate.mock.calls[0]?.[0];
    expect(call.model).toBe('claude-opus-4-7');
    expect(call.max_tokens).toBe(800);
  });

  it('passes candidatesContext to user message', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent19({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      candidatesContext: 'CANDIDATE_LIST_HERE',
    });
    const userMsg = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    const textBlock = userMsg.find((c: { type: string; text?: string }) => c.type === 'text');
    expect(textBlock?.text).toContain('CANDIDATE_LIST_HERE');
  });

  it('handles abstain (no good match)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'best cosine 0.55, below 0.62 threshold',
      score: null,
      top_matches: [],
      outcome_distribution: { wins: 0, losses: 0, be: 0, no_trade: 0 },
    }));
    const r = await runAgent19({
      imageBase64: 'x',
      imageMimeType: 'image/png',
      candidatesContext: 'x',
    });
    expect(r.abstain).toBe(true);
    expect(r.top_matches).toHaveLength(0);
  });

  it('rejects malformed top_matches', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      top_matches: [{ corpus_id: '001', cosine_similarity: 0.9 }], // missing required fields
    }));
    await expect(
      runAgent19({ imageBase64: 'x', imageMimeType: 'image/png', candidatesContext: 'x' }),
    ).rejects.toThrow();
  });
});
