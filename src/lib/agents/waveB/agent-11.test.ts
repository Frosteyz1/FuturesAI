import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMessagesCreate = vi.fn();
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
  MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-7' },
}));

import { runAgent11 } from './agent-11';

beforeEach(() => mockMessagesCreate.mockReset());
afterEach(() => vi.clearAllMocks());

const valid = (overrides: Record<string, unknown> = {}) => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      agent_id: '11', score: 80, confidence: 75, abstain: false,
      evidence: ['three sequentially smaller red bodies', 'terminal doji at cloud'],
      ...overrides,
    }),
  }],
});

describe('runAgent11', () => {
  it('returns momentum decay score', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    const r = await runAgent11({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBe(80);
  });

  it('uses Sonnet tier', async () => {
    mockMessagesCreate.mockResolvedValue(valid());
    await runAgent11({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(mockMessagesCreate.mock.calls[0]?.[0].model).toBe('claude-sonnet-4-6');
  });

  it('handles soft-veto floor (10-29 score)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      score: 18,
      evidence: ['fresh expansion bar pointing into cloud'],
    }));
    const r = await runAgent11({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.score).toBeLessThan(30);
  });

  it('handles abstain (Variant != A)', async () => {
    mockMessagesCreate.mockResolvedValue(valid({
      abstain: true,
      abstain_reason: 'Variant B regime-establishment, no pullback to grade',
      score: null,
    }));
    const r = await runAgent11({ imageBase64: 'x', imageMimeType: 'image/png' });
    expect(r.abstain).toBe(true);
  });

  it('rejects malformed evidence (must be array of strings)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        agent_id: '11', score: 80, confidence: 80, abstain: false,
        evidence: [{not: 'string'}],
      })}],
    });
    await expect(runAgent11({ imageBase64: 'x', imageMimeType: 'image/png' })).rejects.toThrow();
  });
});
