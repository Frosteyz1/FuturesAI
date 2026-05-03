import { describe, expect, it } from 'vitest';

import { MockDispatcher } from './mock';
import { DispatchError } from './types';

describe('MockDispatcher', () => {
  it('returns registered fixture for matching agent_id', async () => {
    const dispatcher = new MockDispatcher();
    dispatcher.register('00a', '{"agent_id":"00a","value":42}');

    const response = await dispatcher.dispatch({
      requestId: 'r1',
      agentId: '00a',
      tier: 'haiku',
      systemPrompt: 'sys',
      image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
      userInstruction: 'instr',
      maxTokens: 100,
    });

    expect(response.rawText).toBe('{"agent_id":"00a","value":42}');
  });

  it('throws when agent_id has no fixture registered', async () => {
    const dispatcher = new MockDispatcher();

    await expect(
      dispatcher.dispatch({
        requestId: 'r1',
        agentId: 'unregistered',
        tier: 'haiku',
        systemPrompt: 'sys',
        image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
        userInstruction: 'instr',
        maxTokens: 100,
      }),
    ).rejects.toThrow(DispatchError);
  });

  it('supports function-based dynamic responses', async () => {
    const dispatcher = new MockDispatcher();
    dispatcher.register('00a', (req) =>
      JSON.stringify({ agent_id: req.agentId, requested_at: req.requestId }),
    );

    const response = await dispatcher.dispatch({
      requestId: 'dynamic-id',
      agentId: '00a',
      tier: 'haiku',
      systemPrompt: 'sys',
      image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
      userInstruction: 'instr',
      maxTokens: 100,
    });

    expect(JSON.parse(response.rawText)).toEqual({
      agent_id: '00a',
      requested_at: 'dynamic-id',
    });
  });

  it('supports async function-based responses', async () => {
    const dispatcher = new MockDispatcher();
    dispatcher.register('00a', async (req) => {
      await new Promise((r) => setTimeout(r, 10));
      return `{"agent_id":"${req.agentId}","async":true}`;
    });

    const response = await dispatcher.dispatch({
      requestId: 'r1',
      agentId: '00a',
      tier: 'haiku',
      systemPrompt: 'sys',
      image: { kind: 'base64', data: 'x', mimeType: 'image/png' },
      userInstruction: 'instr',
      maxTokens: 100,
    });

    expect(JSON.parse(response.rawText)).toEqual({ agent_id: '00a', async: true });
  });
});
