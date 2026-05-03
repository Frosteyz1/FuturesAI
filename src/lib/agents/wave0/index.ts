/**
 * Wave 0 orchestration — runs the 4 routing agents and emits a routing decision.
 *
 * Per architecture/02-wave-e-synthesis-spec.md §0:
 *   Wave 0 → routing decision → conditional Wave A–D fan-out
 *
 * Pipeline:
 *   1. Agent 00a (Haiku) — timeframe detector. If abstains → ABSTAIN_INPUT,
 *      bail before paying for Opus calls.
 *   2. Agent 00b (Opus) + Agent 00c (Opus) in parallel — chart state + variant.
 *   3. If variant != VARIANT_A → SKIP_OUT_OF_SCOPE (V1 routes only A to TAKE).
 *   4. If state is non-actionable and variant is A → run Agent 00d (Sonnet)
 *      for the wait-level. Otherwise skip 00d.
 */

import type { ChartState } from '@/types/taxonomy';
import {
  runAgent00a,
  type RunAgent00aInput,
} from './agent-00a';
import { runAgent00b } from './agent-00b';
import { runAgent00c } from './agent-00c';
import { runAgent00d } from './agent-00d';
import type {
  Agent00aOutput,
  Agent00bOutput,
  Agent00cOutput,
  Agent00dOutput,
} from '@/lib/agents/shared/schemas';

/** Chart states for which we still want a wait-level recommendation. */
const STATES_WORTH_WATCHING = new Set<ChartState>([
  'TREND_ESTABLISHED_RUNNING',
  'TREND_FORMING',
  'POST_REJECTION_CONTINUATION',
  'REGIME_TRANSITION',
  'MACRO_BREAK_RETEST',
]);

export type Wave0Routing =
  | 'abstain_input'        // 00a couldn't classify timeframe
  | 'out_of_scope'         // variant ≠ A; route to SKIP_OUT_OF_SCOPE
  | 'actionable_now'       // proceed to Wave A fan-out
  | 'wait_for_level'       // non-actionable now, watch the level from 00d
  | 'skip_no_edge';        // chart state offers no edge (RANGE_BOUND / INSUFFICIENT_HISTORY)

export interface Wave0Result {
  agent_00a: Agent00aOutput;
  agent_00b: Agent00bOutput | null;  // null when 00a abstained (we never ran 00b)
  agent_00c: Agent00cOutput | null;  // null when 00a abstained
  agent_00d: Agent00dOutput | null;  // null when 00d wasn't run
  routing: Wave0Routing;
  reason: string;
}

export interface RunWave0Input extends RunAgent00aInput {}

export async function runWave0(input: RunWave0Input): Promise<Wave0Result> {
  // Step 1 — Timeframe (cheap Haiku call)
  const agent_00a = await runAgent00a(input);

  if (agent_00a.abstain || agent_00a.timeframe === 'UNKNOWN') {
    return {
      agent_00a,
      agent_00b: null,
      agent_00c: null,
      agent_00d: null,
      routing: 'abstain_input',
      reason: agent_00a.abstain_reason ?? 'timeframe undetectable',
    };
  }

  // Step 2 — State + variant in parallel (both Opus)
  const [agent_00b, agent_00c] = await Promise.all([
    runAgent00b(input),
    runAgent00c(input),
  ]);

  // ABSTAIN_INPUT from variant classifier overrides everything
  if (agent_00c.variant === 'ABSTAIN_INPUT' || agent_00c.abstain) {
    return {
      agent_00a,
      agent_00b,
      agent_00c,
      agent_00d: null,
      routing: 'abstain_input',
      reason: agent_00c.abstain_reason ?? 'variant unclassifiable',
    };
  }

  // Non-A variants → SKIP_OUT_OF_SCOPE per V1 routing
  if (agent_00c.variant !== 'VARIANT_A') {
    return {
      agent_00a,
      agent_00b,
      agent_00c,
      agent_00d: null,
      routing: 'out_of_scope',
      reason: `${agent_00c.variant} is V2-only; V1 grades Variant A pullback rejection only`,
    };
  }

  // Variant A path — decide actionable vs watch vs skip
  const stateNow = agent_00b.state_at_right_edge;

  // States that should fall through to full Wave A fan-out
  const actionableStates: Set<ChartState> = new Set([
    'REJECTION_FIRING',
    'PULLBACK_IN_PROGRESS',  // setup is mechanically forming; Wave A grades it
  ]);
  if (actionableStates.has(stateNow)) {
    return {
      agent_00a,
      agent_00b,
      agent_00c,
      agent_00d: null,
      routing: 'actionable_now',
      reason: `Variant A in state ${stateNow}`,
    };
  }

  // Non-actionable but state is worth watching → run 00d for the watch level
  if (STATES_WORTH_WATCHING.has(stateNow)) {
    const agent_00d = await runAgent00d(input);

    // 00d may abstain (no realistic level within 3× ATR, late session, etc.)
    if (agent_00d.abstain || (agent_00d.score !== null && agent_00d.score < 55)) {
      return {
        agent_00a,
        agent_00b,
        agent_00c,
        agent_00d,
        routing: 'skip_no_edge',
        reason: agent_00d.abstain_reason ?? 'no realistic wait-level identified',
      };
    }
    return {
      agent_00a,
      agent_00b,
      agent_00c,
      agent_00d,
      routing: 'wait_for_level',
      reason: `${stateNow}; watch ${agent_00d.watch_level} on ${agent_00d.watch_layer} cloud`,
    };
  }

  // RANGE_BOUND / INSUFFICIENT_HISTORY → SKIP, don't bother with 00d
  return {
    agent_00a,
    agent_00b,
    agent_00c,
    agent_00d: null,
    routing: 'skip_no_edge',
    reason: `state ${stateNow} offers no actionable edge`,
  };
}
