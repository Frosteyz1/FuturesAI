/**
 * Dispatcher selector — picks an implementation based on env var.
 *
 *   AGENT_DISPATCHER=sdk         → SdkDispatcher (production deploy)
 *   AGENT_DISPATCHER=file-queue  → FileQueueDispatcher (Stage 4 backtest, smoke test)
 *   AGENT_DISPATCHER=mock        → MockDispatcher (synthesis integration tests)
 *   AGENT_DISPATCHER unset       → defaults to 'sdk' for backwards compat
 *
 * For one-off overrides, pass `dispatcher: ...` to invokeAgent() directly
 * — that always wins over the env-determined default.
 */

import { FileQueueDispatcher } from './file-queue';
import { MockDispatcher } from './mock';
import { SdkDispatcher } from './sdk';
import type { AgentDispatcher } from './types';

export { FileQueueDispatcher } from './file-queue';
export { MockDispatcher } from './mock';
export { SdkDispatcher } from './sdk';
export type {
  AgentDispatcher,
  DispatchRequest,
  DispatchResponse,
} from './types';
export { DispatchError, DispatchTimeoutError } from './types';

let cachedDefault: AgentDispatcher | null = null;
let cachedMode: string | null = null;

/**
 * Returns the env-selected dispatcher. Cached per-process to avoid
 * re-instantiating on every invokeAgent call.
 */
export function getDefaultDispatcher(): AgentDispatcher {
  // Treat empty string as unset (some tooling stubs env vars to '' rather
  // than deleting them).
  const mode = process.env.AGENT_DISPATCHER || 'sdk';

  if (cachedDefault !== null && cachedMode === mode) {
    return cachedDefault;
  }

  switch (mode) {
    case 'sdk':
      cachedDefault = new SdkDispatcher();
      break;
    case 'file-queue':
      cachedDefault = new FileQueueDispatcher({
        queueDir: process.env.AGENT_QUEUE_DIR,
      });
      break;
    case 'mock':
      cachedDefault = new MockDispatcher();
      break;
    default:
      throw new Error(
        `Unknown AGENT_DISPATCHER=${mode}; expected 'sdk' | 'file-queue' | 'mock'`,
      );
  }
  cachedMode = mode;
  return cachedDefault;
}

/** Test-only: clear the cached dispatcher. */
export function _resetDispatcherCache(): void {
  cachedDefault = null;
  cachedMode = null;
}
