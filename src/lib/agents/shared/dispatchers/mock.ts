/**
 * MockDispatcher — fixture-based responses keyed by agent_id.
 *
 * Used for synthesis-pipeline integration tests where we want the real
 * invokeAgent flow (extractJson, Zod validation) but deterministic responses.
 *
 * Per-agent unit tests in the agent-XX.test.ts files use vi.mock() at the
 * agent-function level and don't touch this dispatcher — both layers of
 * mocking coexist.
 */

import type { AgentDispatcher, DispatchRequest, DispatchResponse } from './types';
import { DispatchError } from './types';

export type MockResponseProvider =
  | string
  | ((req: DispatchRequest) => string | Promise<string>);

export class MockDispatcher implements AgentDispatcher {
  /** Map agent_id → response (string or producer). */
  private readonly fixtures = new Map<string, MockResponseProvider>();

  /**
   * Register a fixture for an agent. The string (or function-returned string)
   * is used as `rawText` in the dispatch response.
   *
   * Pass JSON-formatted text — invokeAgent will JSON.parse + Zod validate.
   */
  register(agentId: string, response: MockResponseProvider): this {
    this.fixtures.set(agentId, response);
    return this;
  }

  async dispatch(req: DispatchRequest): Promise<DispatchResponse> {
    const provider = this.fixtures.get(req.agentId);
    if (provider === undefined) {
      throw new DispatchError(
        `MockDispatcher: no fixture registered for agent_id=${req.agentId}`,
      );
    }

    const rawText = typeof provider === 'string' ? provider : await provider(req);

    return {
      requestId: req.requestId,
      rawText,
    };
  }
}
