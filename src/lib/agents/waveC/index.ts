/**
 * Wave C orchestration — 7 context agents in parallel.
 *
 * Agent 19 (Comparable Historical Setup) takes a pre-retrieved candidate
 * context (from SQL kNN); orchestrator passes it via input.
 * Agent 22 (News) takes optional event context.
 * Agent 23 (Behavioral) takes optional categorical behavioral context.
 *
 * Agent 27 (Calibration) is NOT included here — it's a non-LLM database
 * lookup invoked separately at Wave E from src/lib/calibration/lookup.ts.
 */

import { runAgent17 } from './agent-17';
import { runAgent18 } from './agent-18';
import { runAgent19 } from './agent-19';
import { runAgent20 } from './agent-20';
import { runAgent21 } from './agent-21';
import { runAgent22 } from './agent-22';
import { runAgent23 } from './agent-23';
import { runAgent24 } from './agent-24';
import type {
  Agent17Output,
  Agent18Output,
  Agent19Output,
  Agent20Output,
  Agent21Output,
  Agent22Output,
  Agent23Output,
  Agent24Output,
} from '@/lib/agents/shared/schemas';

export interface RunWaveCInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Optional contexts (Wave E passes these through). */
  candidatesContext?: string;
  eventContext?: string;
  behavioralContext?: string;
}

export interface WaveCResult {
  agent_17: Agent17Output | null;
  agent_18: Agent18Output | null;
  agent_19: Agent19Output | null;
  agent_20: Agent20Output | null;
  agent_21: Agent21Output | null;
  agent_22: Agent22Output | null;
  agent_23: Agent23Output | null;
  agent_24: Agent24Output | null;
  errors: Array<{ agent_id: string; error: string }>;
}

export async function runWaveC(input: RunWaveCInput): Promise<WaveCResult> {
  const baseInput = {
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  };

  const settled = await Promise.allSettled([
    runAgent17(baseInput).then((r): ['17', Agent17Output] => ['17', r]),
    runAgent18(baseInput).then((r): ['18', Agent18Output] => ['18', r]),
    // Agent 19 needs candidates context; if not provided, we skip its call
    // (it would just abstain anyway). Pass empty string if missing.
    runAgent19({
      ...baseInput,
      candidatesContext: input.candidatesContext ?? '',
    }).then((r): ['19', Agent19Output] => ['19', r]),
    runAgent20(baseInput).then((r): ['20', Agent20Output] => ['20', r]),
    runAgent21(baseInput).then((r): ['21', Agent21Output] => ['21', r]),
    runAgent22({ ...baseInput, eventContext: input.eventContext })
      .then((r): ['22', Agent22Output] => ['22', r]),
    runAgent23({ ...baseInput, behavioralContext: input.behavioralContext })
      .then((r): ['23', Agent23Output] => ['23', r]),
    runAgent24(baseInput).then((r): ['24', Agent24Output] => ['24', r]),
  ]);

  const result: WaveCResult = {
    agent_17: null, agent_18: null, agent_19: null, agent_20: null,
    agent_21: null, agent_22: null, agent_23: null, agent_24: null,
    errors: [],
  };

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const [id, value] = s.value;
      switch (id) {
        case '17': result.agent_17 = value as Agent17Output; break;
        case '18': result.agent_18 = value as Agent18Output; break;
        case '19': result.agent_19 = value as Agent19Output; break;
        case '20': result.agent_20 = value as Agent20Output; break;
        case '21': result.agent_21 = value as Agent21Output; break;
        case '22': result.agent_22 = value as Agent22Output; break;
        case '23': result.agent_23 = value as Agent23Output; break;
        case '24': result.agent_24 = value as Agent24Output; break;
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
