/**
 * Tests for the invocation harness.
 *
 * Mocks the Anthropic SDK so we don't make real API calls during build/test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mockMessagesCreate = vi.fn();

vi.mock('@/lib/anthropic/client', () => ({
  getAnthropic: () => ({
    messages: { create: mockMessagesCreate },
  }),
  MODELS: {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
  },
}));

import { AgentInvocationError, extractJson, invokeAgent } from './invoke';

const TestSchema = z.object({
  agent_id: z.string(),
  value: z.number(),
});

beforeEach(() => {
  mockMessagesCreate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ── extractJson ──────────────────────────────────────────────────────── */

describe('extractJson', () => {
  it('returns input directly when it starts with {', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('extracts JSON from prose-wrapped response', () => {
    const text = 'Here is the result:\n{"agent_id":"00a","value":42}';
    expect(extractJson(text)).toBe('{"agent_id":"00a","value":42}');
  });

  it('handles nested objects', () => {
    const text = 'Result: {"outer":{"inner":1},"x":2}';
    expect(extractJson(text)).toBe('{"outer":{"inner":1},"x":2}');
  });

  it('handles strings containing braces', () => {
    const text = 'OK: {"reason":"saw {curly} brace","ok":true}';
    expect(extractJson(text)).toBe('{"reason":"saw {curly} brace","ok":true}');
  });

  it('handles escaped quotes in strings', () => {
    const text = '{"text":"a \\"quoted\\" word","x":1}';
    expect(extractJson(text)).toBe('{"text":"a \\"quoted\\" word","x":1}');
  });

  it('throws when no JSON found', () => {
    expect(() => extractJson('no braces here')).toThrow(AgentInvocationError);
  });

  it('throws on unbalanced braces', () => {
    expect(() => extractJson('{"a":1')).toThrow(AgentInvocationError);
  });
});

/* ── invokeAgent ──────────────────────────────────────────────────────── */

describe('invokeAgent', () => {
  it('returns validated output on success', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"test","value":42}' }],
    });

    const result = await invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'aGVsbG8=',
      imageMimeType: 'image/png',
      schema: TestSchema,
    });

    expect(result).toEqual({ agent_id: 'test', value: 42 });
    expect(mockMessagesCreate).toHaveBeenCalledOnce();
  });

  it('passes prompt cache control on the system prompt', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"t","value":1}' }],
    });

    await invokeAgent({
      tier: 'opus',
      systemPrompt: 'cacheable system prompt',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    });

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0];
    expect(callArgs.system).toEqual([
      {
        type: 'text',
        text: 'cacheable system prompt',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('selects model from tier', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"t","value":1}' }],
    });

    await invokeAgent({
      tier: 'sonnet',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    });

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0];
    expect(callArgs.model).toBe('claude-sonnet-4-6');
  });

  it('throws AgentInvocationError on invalid JSON', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });

    await expect(invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    })).rejects.toThrow(AgentInvocationError);
  });

  it('throws AgentInvocationError on schema validation failure', async () => {
    // Missing the required `value` field
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"test"}' }],
    });

    await expect(invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    })).rejects.toThrow(AgentInvocationError);
  });

  it('attaches the chart image to the user message', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"t","value":1}' }],
    });

    await invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'IMAGE_DATA',
      imageMimeType: 'image/jpeg',
      schema: TestSchema,
    });

    const callArgs = mockMessagesCreate.mock.calls[0]?.[0];
    const imageBlock = callArgs.messages[0].content[0];
    expect(imageBlock).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: 'IMAGE_DATA',
      },
    });
  });

  it('respects max_tokens override (default 500)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"t","value":1}' }],
    });

    await invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
      maxTokens: 200,
    });

    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(200);
  });

  it('default max_tokens is 500', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"agent_id":"t","value":1}' }],
    });

    await invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    });

    expect(mockMessagesCreate.mock.calls[0]?.[0].max_tokens).toBe(500);
  });

  it('concatenates multiple text blocks in response', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Reasoning... ' },
        { type: 'text', text: '{"agent_id":"t","value":99}' },
      ],
    });

    const result = await invokeAgent({
      tier: 'haiku',
      systemPrompt: 'sys',
      imageBase64: 'x',
      imageMimeType: 'image/png',
      schema: TestSchema,
    });

    expect(result.value).toBe(99);
  });
});
