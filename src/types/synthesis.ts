/**
 * Wave E synthesis types — runtime contract.
 *
 * Source of truth: architecture/02-wave-e-synthesis-spec.md
 * The 10-step pipeline contract is encoded here as types; implementation
 * lives in src/lib/orchestrator/synthesis.ts.
 */

import type { AnyAgentOutput } from './agents';
import type {
  ConvictionTier,
  Direction,
  PatternVariant,
  VerdictMode,
} from './taxonomy';

/* ── Inputs ─────────────────────────────────────────────────────── */

export interface ScoringInput {
  imageBase64: string;
  imageMimeType: 'image/png' | 'image/jpeg' | 'image/webp';

  /** "Your Call?" prior (optional, framing-pivot UX) */
  userPrior?: {
    direction: 'long' | 'short' | 'skip';
    note?: string;
  };

  /** Optional separately-uploaded HTF screenshot */
  htfImageBase64?: string;
  htfImageMimeType?: 'image/png' | 'image/jpeg' | 'image/webp';

  /** Optional pasted news/event context */
  pastedEventContext?: string;

  /** Internal: ID assigned at request entry */
  scoringRunId?: string;
}

/* ── Pipeline step outputs ──────────────────────────────────────── */

export interface BaseComposite {
  /** Score before any caps or modifiers, [0, 100] */
  score: number;
  /** Per-agent contributions to the base for explainability */
  contributions: Array<{
    agentId: string;
    factor: string;        // e.g. "cloud_compression", "ema_acceleration"
    weight: number;        // effective weight after sub-splits
    rawScore: number;
    contribution: number;  // weight * rawScore
  }>;
  abstainCount: number;
  abstainPenalty: number;
}

export interface CappedScore {
  score: number;
  alignmentCap: number | null;       // 40, 55, or null
  alignmentGateFired: boolean;
}

export interface ModulatedScore {
  score: number;
  contextMultipliers: {
    htf: number;        // Agent 17
    timeOfDay: number;  // Agent 18
    internals: number;  // Agent 21
    volatility: number; // Agent 24
  };
  compoundMultiplier: number;
}

export interface SkepticismAdjusted {
  score: number;
  skepticismMultiplier: number;
  strongestCounter: string | null;
}

/* ── Veto ───────────────────────────────────────────────────────── */

export interface VetoResult {
  fired: boolean;
  vetoSource:
    | 'input_quality'
    | 'news_event'
    | 'behavioral'
    | 'choppiness'
    | 'failed_bounce'
    | 'disqualifier_catalog'
    | 'rr_floor'
    | null;
  vetoSeverity: 'hard' | 'soft' | 'none';
  vetoReason: string | null;
  loggedButNotApplied: string[];  // other vetos that fired but didn't win priority
}

/* ── Devil's advocate ───────────────────────────────────────────── */

export interface DevilsAdvocateResult {
  counterEvidenceStrength: number;  // 0-100
  counterArgument: string | null;
  modeAdjustment: 'none' | 'add_concern' | 'downgrade_one_tier' | 'force_skip';
}

/* ── Final verdict ──────────────────────────────────────────────── */

export interface VerdictCard {
  verdict: VerdictMode;
  direction: Direction;
  variant: PatternVariant;
  tier: ConvictionTier | null;
  tierProvisional: boolean;

  /** Final composite, post all steps */
  finalScore: number;
  /** Calibrated probability if available, else null (cold-start) */
  calibratedPWin: number | null;
  calibratedPWinCI?: [number, number];
  calibrationState: 'none' | 'uncalibrated' | 'rough' | 'provisional' | 'calibrated';

  /** Action params (TAKE_NOW only) */
  entry?: number;
  stop?: number;
  target?: number;
  contractCount?: number;
  achievableR?: number;

  /** WAIT_FOR_LEVEL only */
  watchLevel?: number;
  watchLayer?: 'blue' | 'yellow' | 'white';
  triggerToWaitFor?: string;
  expectedWindow?: string;

  /** Card content */
  patternLabel: string;          // e.g. "Pullback rejection — Tier 2 confluence"
  topReasons: string[];          // exactly 3 in TAKE_NOW
  invalidatingConcern?: string;  // exactly 1 in TAKE_NOW

  /** UX banner for "Your Call?" disagreement */
  agreementBanner?:
    | 'agree'
    | 'disagree_skip_vs_take'
    | 'disagree_reverse'
    | 'disagree_take_vs_skip';

  /** Mandatory cold-start disclaimer */
  disclaimer?: string;
}

/* ── Full scoring run ───────────────────────────────────────────── */

export interface ScoringRun {
  scoringRunId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;

  input: ScoringInput;
  agentOutputs: AnyAgentOutput[];

  pipelineSteps: {
    base: BaseComposite | null;
    capped: CappedScore | null;
    modulated: ModulatedScore | null;
    skepticismAdjusted: SkepticismAdjusted | null;
    nqCapApplied: number | null;
    initialVerdict: VerdictMode | null;
    vetoResult: VetoResult | null;
    devilsAdvocate: DevilsAdvocateResult | null;
  };

  card: VerdictCard;

  /** Cost & latency observability */
  observability: {
    costUsd: number;
    cacheHitRate: number;
    agentLatencyMs: Record<string, number>;
    totalTokens: { input: number; output: number; cached: number };
  };
}
