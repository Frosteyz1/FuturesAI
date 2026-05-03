/**
 * Wave B orchestration — 8 price-action agents in parallel.
 *
 * All run in parallel. Agent 14 -> Agent 09 downgrade interaction is
 * handled at Wave E synthesis (§1.4), not here.
 */

import { runAgent09 } from './agent-09';
import { runAgent10 } from './agent-10';
import { runAgent11 } from './agent-11';
import { runAgent12 } from './agent-12';
import { runAgent13 } from './agent-13';
import { runAgent14 } from './agent-14';
import { runAgent15 } from './agent-15';
import { runAgent16 } from './agent-16';
import type {
  Agent09Output,
  Agent10Output,
  Agent11Output,
  Agent12Output,
  Agent13Output,
  Agent14Output,
  Agent15Output,
  Agent16Output,
} from '@/lib/agents/shared/schemas';

export interface RunWaveBInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface WaveBResult {
  agent_09: Agent09Output | null;
  agent_10: Agent10Output | null;
  agent_11: Agent11Output | null;
  agent_12: Agent12Output | null;
  agent_13: Agent13Output | null;
  agent_14: Agent14Output | null;
  agent_15: Agent15Output | null;
  agent_16: Agent16Output | null;
  errors: Array<{ agent_id: string; error: string }>;
}

export async function runWaveB(input: RunWaveBInput): Promise<WaveBResult> {
  const settled = await Promise.allSettled([
    runAgent09(input).then((r): ['09', Agent09Output] => ['09', r]),
    runAgent10(input).then((r): ['10', Agent10Output] => ['10', r]),
    runAgent11(input).then((r): ['11', Agent11Output] => ['11', r]),
    runAgent12(input).then((r): ['12', Agent12Output] => ['12', r]),
    runAgent13(input).then((r): ['13', Agent13Output] => ['13', r]),
    runAgent14(input).then((r): ['14', Agent14Output] => ['14', r]),
    runAgent15(input).then((r): ['15', Agent15Output] => ['15', r]),
    runAgent16(input).then((r): ['16', Agent16Output] => ['16', r]),
  ]);

  const result: WaveBResult = {
    agent_09: null, agent_10: null, agent_11: null, agent_12: null,
    agent_13: null, agent_14: null, agent_15: null, agent_16: null,
    errors: [],
  };

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const [id, value] = s.value;
      switch (id) {
        case '09': result.agent_09 = value as Agent09Output; break;
        case '10': result.agent_10 = value as Agent10Output; break;
        case '11': result.agent_11 = value as Agent11Output; break;
        case '12': result.agent_12 = value as Agent12Output; break;
        case '13': result.agent_13 = value as Agent13Output; break;
        case '14': result.agent_14 = value as Agent14Output; break;
        case '15': result.agent_15 = value as Agent15Output; break;
        case '16': result.agent_16 = value as Agent16Output; break;
      }
    } else {
      result.errors.push({
        agent_id: 'unknown',
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  }

  return result;
}
