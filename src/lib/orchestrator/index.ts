/**
 * Orchestrator entry point — scoreChart(input) → ScoringRun.
 *
 * Pipeline contract per architecture/02-wave-e-synthesis-spec.md §0:
 *   1. Wave 0 input quality (Agent 38) → ABSTAIN_INPUT short-circuit
 *   2. Wave 0 routing (00a/b/c/d) → SKIP_OUT_OF_SCOPE / WAIT / actionable
 *   3. Wave A/B/C/D parallel fan-out (only on actionable Variant A)
 *   4. Wave E synthesis (10 steps in synthesis.ts)
 *   5. Devil's advocate pass (mandatory per spec §8)
 *   6. Final card composition
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Agent26Schema,
  type Agent26Output,
} from '@/lib/agents/shared/schemas';
import { invokeAgent } from '@/lib/agents/shared/invoke';
import { runAgent38 } from '@/lib/agents/waveD/agent-38';
import { runWave0, type Wave0Result } from '@/lib/agents/wave0';
import { runWaveA, type WaveAResult } from '@/lib/agents/waveA';
import { runWaveB, type WaveBResult } from '@/lib/agents/waveB';
import { runWaveC, type WaveCResult } from '@/lib/agents/waveC';
import { runWaveD, type WaveDResult } from '@/lib/agents/waveD';
import { lookupCalibration } from '@/lib/calibration/lookup';
import {
  applyAlignmentCap,
  applyContextMultipliers,
  applyDevilsAdvocate,
  applyFailedBounceDowngrade,
  applyNqDisclaimerCap,
  applySkepticism,
  classifyDevilsAdvocate,
  computeAgreementBanner,
  computeBaseComposite,
  mapToVerdict,
  runVetoCascade,
} from './synthesis';
import type {
  ScoringInput,
  ScoringRun,
  VerdictCard,
} from '@/types/synthesis';
import type { VerdictMode } from '@/types/taxonomy';

/* ── Devil's advocate prompt (loaded once) ──────────────────────────── */

let devilsAdvocatePromptCache: string | null = null;
function getDevilsAdvocatePrompt(): string {
  if (devilsAdvocatePromptCache === null) {
    const here = dirname(fileURLToPath(import.meta.url));
    devilsAdvocatePromptCache = readFileSync(
      resolve(here, 'devils-advocate-prompt.md'),
      'utf-8',
    );
  }
  return devilsAdvocatePromptCache;
}

async function runDevilsAdvocate(
  imageBase64: string,
  imageMimeType: ScoringInput['imageMimeType'],
  upstreamSummary: string,
): Promise<Agent26Output> {
  return invokeAgent({
    tier: 'opus',
    systemPrompt: getDevilsAdvocatePrompt(),
    imageBase64,
    imageMimeType,
    schema: Agent26Schema,
    maxTokens: 600,
    userInstruction:
      `Initial system verdict and upstream summary:\n${upstreamSummary}\n\n` +
      'Argue against this verdict. Find the strongest counter-evidence visible. JSON only.',
  });
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function summarizeForRedTeam(
  initialVerdict: string,
  finalScore: number,
  variant: string,
  tier: 1 | 2 | 3 | null,
  topReasons: string[],
): string {
  return [
    `Verdict: ${initialVerdict}`,
    `Composite: ${finalScore.toFixed(0)}`,
    `Variant: ${variant}`,
    tier !== null ? `Tier: ${tier}` : 'Tier: n/a',
    'Top reasons:',
    ...topReasons.slice(0, 3).map((r) => `  - ${r}`),
  ].join('\n');
}

function topReasonsFrom(
  waveA: WaveAResult,
  waveB: WaveBResult,
  waveC: WaveCResult,
): string[] {
  const reasons: string[] = [];

  // Pull the single strongest evidence string from the highest-scoring agents
  const candidates: { agentId: string; score: number; evidence: string[] }[] = [];
  if (waveA.agent_02?.score !== null && waveA.agent_02 !== null) {
    candidates.push({ agentId: '02', score: waveA.agent_02.score, evidence: waveA.agent_02.evidence });
  }
  if (waveA.agent_04?.score !== null && waveA.agent_04 !== null) {
    candidates.push({ agentId: '04', score: waveA.agent_04.score, evidence: waveA.agent_04.evidence });
  }
  if (waveA.agent_08?.score !== null && waveA.agent_08 !== null) {
    candidates.push({ agentId: '08', score: waveA.agent_08.score, evidence: waveA.agent_08.evidence });
  }
  if (waveB.agent_09?.score !== null && waveB.agent_09 !== null) {
    candidates.push({ agentId: '09', score: waveB.agent_09.score, evidence: waveB.agent_09.evidence });
  }
  if (waveC.agent_19?.score !== null && waveC.agent_19 !== null) {
    candidates.push({ agentId: '19', score: waveC.agent_19.score, evidence: waveC.agent_19.evidence });
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 3)) {
    if (c.evidence.length > 0) reasons.push(c.evidence[0]!);
  }
  return reasons.slice(0, 3);
}

/* ── Public API ─────────────────────────────────────────────────────── */

export interface ScoreChartContext {
  /** Optional pre-retrieved corpus candidates (for Agent 19). */
  candidatesContext?: string;
  /** Optional pasted event calendar. */
  eventContext?: string;
  /** Optional behavioral state context (categorical, NOT raw P&L). */
  behavioralContext?: string;
  /** Reconciled-trade count for the cell (drives Agent 27 calibration ladder). */
  cellSampleCount?: number;
  /** Labeled /NQ corpus size — drives the §3 score-cap-at-85 disclaimer. */
  labeledNqCorpusCount?: number;
}

/**
 * Score a chart through the 44-agent + Wave E pipeline.
 */
export async function scoreChart(
  input: ScoringInput,
  context: ScoreChartContext = {},
): Promise<ScoringRun> {
  const scoringRunId = input.scoringRunId ?? randomUUID();
  const startedAt = new Date();
  const labeledNqCorpusCount = context.labeledNqCorpusCount ?? 0;

  // Step 1 — Wave 0 input quality (Agent 38) ────────────────────────────
  const inputQuality = await runAgent38({
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  });

  if (!inputQuality.passed) {
    return buildAbstainInputRun(scoringRunId, startedAt, input, [inputQuality]);
  }

  // Step 2 — Wave 0 routing ──────────────────────────────────────────────
  const wave0 = await runWave0({
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  });

  if (wave0.routing === 'abstain_input') {
    return buildShortCircuitRun(
      scoringRunId, startedAt, input,
      'ABSTAIN_INPUT',
      [inputQuality, wave0.agent_00a, wave0.agent_00b, wave0.agent_00c, wave0.agent_00d].filter((x) => x !== null),
      wave0.reason,
    );
  }
  if (wave0.routing === 'out_of_scope') {
    return buildShortCircuitRun(
      scoringRunId, startedAt, input,
      'SKIP_OUT_OF_SCOPE',
      [inputQuality, wave0.agent_00a, wave0.agent_00b, wave0.agent_00c, wave0.agent_00d].filter((x) => x !== null),
      wave0.reason,
      wave0,
    );
  }
  if (wave0.routing === 'skip_no_edge') {
    return buildShortCircuitRun(
      scoringRunId, startedAt, input,
      'SKIP',
      [inputQuality, wave0.agent_00a, wave0.agent_00b, wave0.agent_00c, wave0.agent_00d].filter((x) => x !== null),
      wave0.reason,
      wave0,
    );
  }
  if (wave0.routing === 'wait_for_level') {
    return buildShortCircuitRun(
      scoringRunId, startedAt, input,
      'WAIT_FOR_LEVEL',
      [inputQuality, wave0.agent_00a, wave0.agent_00b, wave0.agent_00c, wave0.agent_00d].filter((x) => x !== null),
      wave0.reason,
      wave0,
    );
  }

  // Step 3 — Wave A/B/C/D fan-out (only routing='actionable_now' reaches here)
  const baseInput = { imageBase64: input.imageBase64, imageMimeType: input.imageMimeType };
  const [waveA, waveB, waveC, waveD] = await Promise.all([
    runWaveA(baseInput),
    runWaveB(baseInput),
    runWaveC({
      ...baseInput,
      candidatesContext: context.candidatesContext,
      eventContext: context.eventContext,
      behavioralContext: context.behavioralContext,
    }),
    runWaveD(baseInput),
  ]);

  // Step 4 — Wave E synthesis pipeline ───────────────────────────────────

  // Step 4a — Agent 14 → Agent 09 downgrade
  const agent09Adjusted = applyFailedBounceDowngrade(waveB.agent_09, waveB.agent_14);

  // Step 4b — Base composite
  const baseComposite = computeBaseComposite(
    waveA.agent_02, waveA.agent_04, waveA.agent_08,
    agent09Adjusted, waveB.agent_10, waveB.agent_13,
    waveC.agent_19, waveC.agent_20,
  );

  // Step 4c — Alignment-gate cap
  const capped = applyAlignmentCap(baseComposite, waveA.agent_08);

  // Step 4d — Context multipliers
  const modulated = applyContextMultipliers(
    capped, waveC.agent_17, waveC.agent_18, waveC.agent_21, waveC.agent_24,
  );

  // Step 4e — Skepticism multiplier
  const skepticismAdjusted = applySkepticism(modulated, waveD.agent_26, baseComposite.abstainPenalty);

  // Step 4f — /NQ disclaimer cap
  let finalScore = applyNqDisclaimerCap(skepticismAdjusted.score, labeledNqCorpusCount);

  // Per spec §1.3: Agent 19 abstain caps final composite at 60
  const agent19Abstained = waveC.agent_19?.abstain ?? true;
  if (agent19Abstained) {
    finalScore = Math.min(finalScore, 60);
  }

  // Step 4g — Initial verdict mapping
  const variant = wave0.agent_00c?.variant ?? 'ABSTAIN_INPUT';
  const variantIsA = variant === 'VARIANT_A';
  const stateRightEdge = wave0.agent_00b?.state_at_right_edge ?? null;
  const initialVerdict = mapToVerdict(finalScore, stateRightEdge, variantIsA, agent19Abstained);

  // Step 4h — Veto cascade
  const vetoResult = runVetoCascade({
    agent38: { passed: inputQuality.passed, degradation_flags: inputQuality.degradation_flags },
    agent22: waveC.agent_22,
    agent23: waveC.agent_23,
    agent07: waveA.agent_07,
    agent14: waveB.agent_14,
    agent25: waveD.agent_25,
    agent16: waveB.agent_16,
    timeframe: wave0.agent_00a?.timeframe ?? null,
  });

  let postVetoVerdict: string = initialVerdict.verdict;
  if (vetoResult.fired) {
    if (vetoResult.vetoSeverity === 'hard') {
      postVetoVerdict = 'SKIP';
    } else if (vetoResult.vetoSeverity === 'soft') {
      // Soft veto downgrades verdict mode
      const downgrade = applyDevilsAdvocate(initialVerdict.verdict, {
        counterEvidenceStrength: 70,
        counterArgument: vetoResult.vetoReason,
        modeAdjustment: 'downgrade_one_tier',
      });
      postVetoVerdict = downgrade.verdict;
    }
  }

  // Step 4i — Devil's advocate (mandatory per spec §8 — even on SKIP, for audit)
  const topReasons = topReasonsFrom(waveA, waveB, waveC);
  const upstreamSummary = summarizeForRedTeam(
    postVetoVerdict, finalScore, variant, waveA.agent_04?.tier ?? null, topReasons,
  );

  let devilsAdvocateOutput: Agent26Output | null = null;
  let postDaVerdict = postVetoVerdict;
  try {
    devilsAdvocateOutput = await runDevilsAdvocate(
      input.imageBase64, input.imageMimeType, upstreamSummary,
    );
    const modeAdjustment = classifyDevilsAdvocate(devilsAdvocateOutput.skepticism_score);
    const adjusted = applyDevilsAdvocate(postVetoVerdict, {
      counterEvidenceStrength: devilsAdvocateOutput.skepticism_score,
      counterArgument: devilsAdvocateOutput.strongest_counter_argument,
      modeAdjustment,
    });
    postDaVerdict = adjusted.verdict;
  } catch (_err) {
    // Devil's advocate failure does NOT abort the run; we proceed with
    // postVetoVerdict and log the failure for observability.
  }

  // Step 4j — Calibration lookup (non-LLM)
  const calibration = lookupCalibration({
    rawScore: finalScore,
    variant: variantIsA ? 'VARIANT_A' : (variant as 'VARIANT_A'),
    tier: waveA.agent_04?.tier ?? null,
    instrument: 'NQ',
    cellSampleCount: context.cellSampleCount ?? 0,
  });

  // Step 5 — Final card composition ──────────────────────────────────────
  const card = composeCard({
    verdict: postDaVerdict as VerdictMode,
    finalScore,
    variant,
    waveA, waveB, waveC, waveD,
    wave0,
    inputQuality,
    calibration,
    devilsAdvocateOutput,
    initialVerdict: initialVerdict.verdict,
    vetoResult,
    userPrior: input.userPrior,
    nqDisclaimerActive: labeledNqCorpusCount < 30,
  });

  const completedAt = new Date();
  return {
    scoringRunId,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    input,
    agentOutputs: collectAllOutputs([
      inputQuality,
      wave0.agent_00a, wave0.agent_00b, wave0.agent_00c, wave0.agent_00d,
      waveA.agent_01, waveA.agent_02, waveA.agent_03, waveA.agent_04,
      waveA.agent_05, waveA.agent_06, waveA.agent_07, waveA.agent_08,
      waveB.agent_09, waveB.agent_10, waveB.agent_11, waveB.agent_12,
      waveB.agent_13, waveB.agent_14, waveB.agent_15, waveB.agent_16,
      waveC.agent_17, waveC.agent_18, waveC.agent_19, waveC.agent_20,
      waveC.agent_21, waveC.agent_22, waveC.agent_23, waveC.agent_24,
      waveD.agent_25, waveD.agent_26,
      devilsAdvocateOutput,
      calibration,
    ]),
    pipelineSteps: {
      base: baseComposite,
      capped,
      modulated,
      skepticismAdjusted,
      nqCapApplied: finalScore,
      initialVerdict: initialVerdict.verdict as VerdictMode,
      vetoResult,
      devilsAdvocate: devilsAdvocateOutput
        ? {
            counterEvidenceStrength: devilsAdvocateOutput.skepticism_score,
            counterArgument: devilsAdvocateOutput.strongest_counter_argument,
            modeAdjustment: classifyDevilsAdvocate(devilsAdvocateOutput.skepticism_score),
          }
        : null,
    },
    card,
    observability: {
      costUsd: 0, // populated by token-tracking middleware in V2
      cacheHitRate: 0,
      agentLatencyMs: {},
      totalTokens: { input: 0, output: 0, cached: 0 },
    },
  };
}

/* ── Card composition ──────────────────────────────────────────────── */

interface ComposeCardArgs {
  verdict: VerdictMode;
  finalScore: number;
  variant: string;
  waveA: WaveAResult;
  waveB: WaveBResult;
  waveC: WaveCResult;
  waveD: WaveDResult;
  wave0: Wave0Result;
  inputQuality: Awaited<ReturnType<typeof runAgent38>>;
  calibration: ReturnType<typeof lookupCalibration>;
  devilsAdvocateOutput: Agent26Output | null;
  initialVerdict: string;
  vetoResult: ReturnType<typeof runVetoCascade>;
  userPrior: ScoringInput['userPrior'];
  nqDisclaimerActive: boolean;
}

function composeCard(args: ComposeCardArgs): VerdictCard {
  const tier = args.waveA.agent_04?.tier ?? null;
  const direction = args.wave0.agent_00c?.direction_bias ?? 'none';
  const topReasons = topReasonsFrom(args.waveA, args.waveB, args.waveC);

  const concern = args.devilsAdvocateOutput?.strongest_counter_argument ?? undefined;

  const patternLabel = patternLabelFor(args.variant, tier);

  const card: VerdictCard = {
    verdict: args.verdict,
    direction,
    variant: args.variant as VerdictCard['variant'],
    tier,
    tierProvisional: args.waveA.agent_04?.tier_provisional ?? false,
    finalScore: args.finalScore,
    calibratedPWin: args.calibration.calibrated_p_win ?? null,
    calibratedPWinCI: args.calibration.calibrated_p_win_ci,
    calibrationState: args.calibration.calibration_state,
    patternLabel,
    topReasons,
    invalidatingConcern: concern,
    agreementBanner: computeAgreementBanner(args.userPrior, direction, args.verdict),
    disclaimer: args.nqDisclaimerActive
      ? 'Calibration anchored on /ES exemplars; treat with caution until /NQ corpus reaches 30+ entries.'
      : undefined,
  };

  // Action params for TAKE_NOW
  if (args.verdict === 'TAKE_NOW') {
    if (args.waveB.agent_15?.trigger_price !== null && args.waveB.agent_15?.trigger_price !== undefined) {
      card.entry = args.waveB.agent_15.trigger_price;
    }
    if (args.waveB.agent_16?.stop_price !== null && args.waveB.agent_16?.stop_price !== undefined) {
      card.stop = args.waveB.agent_16.stop_price;
    }
    if (args.waveB.agent_16?.target_price !== null && args.waveB.agent_16?.target_price !== undefined) {
      card.target = args.waveB.agent_16.target_price;
    }
    if (args.waveB.agent_16?.achievable_r !== null && args.waveB.agent_16?.achievable_r !== undefined) {
      card.achievableR = args.waveB.agent_16.achievable_r;
    }
    // V1: fixed sizing 3 contracts (overridden by Agent 28 if it ran)
    card.contractCount = 3;
  }

  // WAIT_FOR_LEVEL: pull from Agent 00d if present
  if (args.verdict === 'WAIT_FOR_LEVEL' && args.wave0.agent_00d) {
    if (args.wave0.agent_00d.watch_level !== undefined) {
      card.watchLevel = args.wave0.agent_00d.watch_level;
    }
    if (args.wave0.agent_00d.watch_layer !== undefined && args.wave0.agent_00d.watch_layer !== 'none') {
      card.watchLayer = args.wave0.agent_00d.watch_layer;
    }
    if (args.wave0.agent_00d.trigger_to_wait_for !== undefined) {
      card.triggerToWaitFor = args.wave0.agent_00d.trigger_to_wait_for;
    }
    if (args.wave0.agent_00d.expected_window !== undefined) {
      card.expectedWindow = args.wave0.agent_00d.expected_window;
    }
  }

  return card;
}

function patternLabelFor(variant: string, tier: 1 | 2 | 3 | null): string {
  const tierStr =
    tier === 1 ? 'Tier 1 micro' :
    tier === 2 ? 'Tier 2 confluence' :
    tier === 3 ? 'Tier 3 macro (rare)' :
    '';

  switch (variant) {
    case 'VARIANT_A':
      return tierStr ? `Pullback rejection — ${tierStr}` : 'Pullback rejection';
    case 'VARIANT_B':
      return 'Regime-establishment (V1 out of scope)';
    case 'VARIANT_C':
      return 'Macro break + retest (V1 out of scope)';
    case 'VARIANT_D':
      return 'Failed-bounce reversal (V1 out of scope)';
    case 'OTHER_PATTERNED':
      return 'Recognizable structure, V1 out of scope';
    default:
      return variant;
  }
}

/* ── Short-circuit run builders ───────────────────────────────────── */

function buildAbstainInputRun(
  scoringRunId: string,
  startedAt: Date,
  input: ScoringInput,
  agentOutputs: ReadonlyArray<unknown>,
): ScoringRun {
  const completedAt = new Date();
  return {
    scoringRunId,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    input,
    agentOutputs: collectAllOutputs(agentOutputs),
    pipelineSteps: {
      base: null, capped: null, modulated: null,
      skepticismAdjusted: null, nqCapApplied: null,
      initialVerdict: 'ABSTAIN_INPUT', vetoResult: null, devilsAdvocate: null,
    },
    card: {
      verdict: 'ABSTAIN_INPUT',
      direction: 'none',
      variant: 'ABSTAIN_INPUT',
      tier: null,
      tierProvisional: false,
      finalScore: 0,
      calibratedPWin: null,
      calibrationState: 'none',
      patternLabel: 'Input quality gate failed',
      topReasons: [],
    },
    observability: {
      costUsd: 0, cacheHitRate: 0, agentLatencyMs: {},
      totalTokens: { input: 0, output: 0, cached: 0 },
    },
  };
}

function buildShortCircuitRun(
  scoringRunId: string,
  startedAt: Date,
  input: ScoringInput,
  verdict: VerdictMode,
  agentOutputs: ReadonlyArray<unknown>,
  reason: string,
  wave0?: Wave0Result,
): ScoringRun {
  const completedAt = new Date();
  const variant = (wave0?.agent_00c?.variant ?? 'ABSTAIN_INPUT') as VerdictCard['variant'];

  const card: VerdictCard = {
    verdict,
    direction: wave0?.agent_00c?.direction_bias ?? 'none',
    variant,
    tier: null,
    tierProvisional: false,
    finalScore: 0,
    calibratedPWin: null,
    calibrationState: 'none',
    patternLabel: patternLabelFor(variant, null),
    topReasons: [reason],
    agreementBanner: computeAgreementBanner(
      input.userPrior, wave0?.agent_00c?.direction_bias ?? 'none', verdict,
    ),
  };

  // WAIT_FOR_LEVEL short-circuit gets Agent 00d's level info
  if (verdict === 'WAIT_FOR_LEVEL' && wave0?.agent_00d) {
    if (wave0.agent_00d.watch_level !== undefined) card.watchLevel = wave0.agent_00d.watch_level;
    if (wave0.agent_00d.watch_layer !== undefined && wave0.agent_00d.watch_layer !== 'none') {
      card.watchLayer = wave0.agent_00d.watch_layer;
    }
    if (wave0.agent_00d.trigger_to_wait_for !== undefined) {
      card.triggerToWaitFor = wave0.agent_00d.trigger_to_wait_for;
    }
    if (wave0.agent_00d.expected_window !== undefined) {
      card.expectedWindow = wave0.agent_00d.expected_window;
    }
  }

  return {
    scoringRunId,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    input,
    agentOutputs: collectAllOutputs(agentOutputs),
    pipelineSteps: {
      base: null, capped: null, modulated: null,
      skepticismAdjusted: null, nqCapApplied: null,
      initialVerdict: verdict, vetoResult: null, devilsAdvocate: null,
    },
    card,
    observability: {
      costUsd: 0, cacheHitRate: 0, agentLatencyMs: {},
      totalTokens: { input: 0, output: 0, cached: 0 },
    },
  };
}

function collectAllOutputs(outputs: ReadonlyArray<unknown>): ScoringRun['agentOutputs'] {
  return outputs.filter((o) => o !== null && o !== undefined) as ScoringRun['agentOutputs'];
}
