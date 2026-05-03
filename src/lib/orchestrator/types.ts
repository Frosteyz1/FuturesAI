/**
 * Internal orchestrator types — pipeline-private contracts.
 * Public API types live in src/types/synthesis.ts.
 */

import type { AnyAgentOutput } from '@/types/agents';

export interface PreProcessingResult {
  imageBase64: string;
  imageMimeType: string;
  ocr: {
    timeframeLabel: string | null;
    instrumentLabel: string | null;
    timestamp: string | null;
    priceAxisSamples: Array<{ y: number; price: number }>;
  };
  atr: {
    valueNqPoints: number | null;
    source: 'ocr_derived' | 'externally_provided' | 'estimated' | 'unavailable';
    confidence: number;
    basisBars: number;
  };
  indicatorDetection: {
    threeCloudsVisible: boolean;
    deprecatedFourthCloudPresent: boolean;
    volumeVisible: boolean;
  };
}

export interface WaveOutputs {
  wave0: {
    a00: AnyAgentOutput | null;
    b00: AnyAgentOutput | null;
    c00: AnyAgentOutput | null;
    d00: AnyAgentOutput | null;
    a38: AnyAgentOutput | null;  // Agent 38 input quality runs in Wave 0 per Wave E spec §0
  };
  waveA: AnyAgentOutput[];
  waveB: AnyAgentOutput[];
  waveC: AnyAgentOutput[];
  waveD: AnyAgentOutput[];
}

export interface RoutingDecision {
  shortCircuit:
    | 'none'
    | 'abstain_input'
    | 'out_of_scope'
    | 'wave_a_meta_below_40'
    | 'unanimous_abstain_with_corpus_match';
  reason: string;
}
