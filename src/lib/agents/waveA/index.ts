/**
 * Wave A orchestration — 8 structural agents in parallel.
 *
 * All Opus tier per Kevin's "lean Opus on Wave A structural agents
 * since they're the foundation everything else depends on" directive.
 *
 * Promise.allSettled — individual agent failures don't abort the whole
 * wave. The synthesis layer decides how to handle nulls (per Wave E
 * spec §1.3 abstention handling).
 */

import { runAgent01 } from './agent-01';
import { runAgent02 } from './agent-02';
import { runAgent03 } from './agent-03';
import { runAgent04 } from './agent-04';
import { runAgent05 } from './agent-05';
import { runAgent06 } from './agent-06';
import { runAgent07 } from './agent-07';
import { runAgent08 } from './agent-08';
import type {
  Agent01Output,
  Agent02Output,
  Agent03Output,
  Agent04Output,
  Agent05Output,
  Agent06Output,
  Agent07Output,
  Agent08Output,
} from '@/lib/agents/shared/schemas';

export interface RunWaveAInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface WaveAResult {
  agent_01: Agent01Output | null;
  agent_02: Agent02Output | null;
  agent_03: Agent03Output | null;
  agent_04: Agent04Output | null;
  agent_05: Agent05Output | null;
  agent_06: Agent06Output | null;
  agent_07: Agent07Output | null;
  agent_08: Agent08Output | null;
  errors: Array<{ agent_id: string; error: string }>;
}

export async function runWaveA(input: RunWaveAInput): Promise<WaveAResult> {
  const calls = [
    runAgent01(input).then((r) => ({ id: '01', value: r as Agent01Output })),
    runAgent02(input).then((r) => ({ id: '02', value: r as Agent02Output })),
    runAgent03(input).then((r) => ({ id: '03', value: r as Agent03Output })),
    runAgent04(input).then((r) => ({ id: '04', value: r as Agent04Output })),
    runAgent05(input).then((r) => ({ id: '05', value: r as Agent05Output })),
    runAgent06(input).then((r) => ({ id: '06', value: r as Agent06Output })),
    runAgent07(input).then((r) => ({ id: '07', value: r as Agent07Output })),
    runAgent08(input).then((r) => ({ id: '08', value: r as Agent08Output })),
  ];

  const settled = await Promise.allSettled(calls);

  const result: WaveAResult = {
    agent_01: null, agent_02: null, agent_03: null, agent_04: null,
    agent_05: null, agent_06: null, agent_07: null, agent_08: null,
    errors: [],
  };

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const { id, value } = s.value;
      // Type-safe assignment via switch (TS can't infer from string id)
      switch (id) {
        case '01': result.agent_01 = value as Agent01Output; break;
        case '02': result.agent_02 = value as Agent02Output; break;
        case '03': result.agent_03 = value as Agent03Output; break;
        case '04': result.agent_04 = value as Agent04Output; break;
        case '05': result.agent_05 = value as Agent05Output; break;
        case '06': result.agent_06 = value as Agent06Output; break;
        case '07': result.agent_07 = value as Agent07Output; break;
        case '08': result.agent_08 = value as Agent08Output; break;
      }
    } else {
      // Promise.allSettled.reason loses the agent id when the call rejects
      // before reaching the .then() — log a generic error.
      result.errors.push({
        agent_id: 'unknown',
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  }

  return result;
}
