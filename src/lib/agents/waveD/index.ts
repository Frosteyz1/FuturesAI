/**
 * Wave D orchestration.
 *
 * Wave D contains 16 conceptual agents (25-40). Only 5 run per-upload at
 * runtime; the rest are research-only deliverables.
 *
 * Per-upload Wave D agents:
 *   - 25 Disqualifier (parallel with 26)
 *   - 26 Confirmation Bias (parallel — V1 doesn't pass upstreamSummary;
 *        red-teams the chart abstractly. V2 may add a re-run with summary
 *        post-Wave-E for sharper red-team)
 *   - 28 Position Sizing — DEFERRED to Wave E (needs composite score)
 *   - 38 Robustness — runs in WAVE 0 as input-quality gate, NOT here
 *
 * So runWaveD() at this layer = parallel(25, 26).
 */

import { runAgent25 } from './agent-25';
import { runAgent26 } from './agent-26';
import type {
  Agent25Output,
  Agent26Output,
} from '@/lib/agents/shared/schemas';

export interface RunWaveDInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Optional upstreamSummary for Agent 26 red-team specificity. */
  upstreamSummary?: string;
}

export interface WaveDResult {
  agent_25: Agent25Output | null;
  agent_26: Agent26Output | null;
  errors: Array<{ agent_id: string; error: string }>;
}

export async function runWaveD(input: RunWaveDInput): Promise<WaveDResult> {
  const baseInput = {
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  };

  const settled = await Promise.allSettled([
    runAgent25(baseInput).then((r): ['25', Agent25Output] => ['25', r]),
    runAgent26({ ...baseInput, upstreamSummary: input.upstreamSummary })
      .then((r): ['26', Agent26Output] => ['26', r]),
  ]);

  const result: WaveDResult = {
    agent_25: null, agent_26: null, errors: [],
  };

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      const [id, value] = s.value;
      switch (id) {
        case '25': result.agent_25 = value as Agent25Output; break;
        case '26': result.agent_26 = value as Agent26Output; break;
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
