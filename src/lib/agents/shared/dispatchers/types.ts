/**
 * Pluggable agent dispatcher interface.
 *
 * Three implementations target three execution modes:
 *   - SdkDispatcher    — direct Anthropic API calls; production deploy only.
 *                        Requires ANTHROPIC_API_KEY.
 *   - MockDispatcher   — fixture-based responses keyed by agent_id;
 *                        used for synthesis-pipeline integration tests.
 *   - FileQueueDispatcher — writes request JSON to disk, awaits response
 *                        JSON in disk; consumed by the Stage 4 runner +
 *                        smoke test script driven by Claude Code Task tool.
 *
 * Existing per-agent unit tests mock at the agent-function level
 * (vi.mock('./agent-XX')) and never touch this dispatcher abstraction,
 * so the refactor is backwards-compatible with the 350-test suite.
 */

import type { ModelTier } from '@/lib/anthropic/client';

export interface DispatchRequest {
  /** Unique per-invocation ID; used as filename in FileQueue mode. */
  requestId: string;
  /** Agent identifier ("00a", "02", "26_da", etc.) for audit/routing. */
  agentId: string;
  /** Anthropic model tier. SdkDispatcher resolves to a model ID. */
  tier: ModelTier;
  /** System prompt (cacheable in SdkDispatcher). */
  systemPrompt: string;
  /** Chart image (base64 in SDK/Mock mode; path in FileQueue mode). */
  image:
    | { kind: 'base64'; data: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
    | { kind: 'path'; path: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' };
  /** User instruction text. */
  userInstruction: string;
  /** Output token budget. */
  maxTokens: number;
}

export interface DispatchResponse {
  requestId: string;
  /** Raw model output text — invokeAgent will JSON-parse + Zod-validate. */
  rawText: string;
  /** Optional usage metrics. Both SDK and FileQueue can populate; Mock omits. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
  };
}

export interface AgentDispatcher {
  /** Dispatch a single agent invocation. */
  dispatch(req: DispatchRequest): Promise<DispatchResponse>;
  /** Optional cleanup (FileQueue closes its watchers, etc.). */
  close?(): Promise<void>;
}

export class DispatchTimeoutError extends Error {
  constructor(message: string, public readonly request: DispatchRequest) {
    super(message);
    this.name = 'DispatchTimeoutError';
  }
}

export class DispatchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DispatchError';
  }
}
