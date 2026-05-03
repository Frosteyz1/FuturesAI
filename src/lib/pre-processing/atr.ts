/**
 * ATR extraction service.
 *
 * Several agents (03, 10, 16, 24, 27) reference ATR-relative thresholds.
 * No agent owned ATR computation in the research phase; pre-processing layer
 * owns it per Auth Doc §7.
 *
 * V1 strategy:
 *   1. OCR-derived (preferred) — read y-axis price labels + count visible bars,
 *      compute ATR from bar height × price-per-pixel ratio.
 *   2. Externally provided — if the API call passes an explicit ATR value
 *      (Databento backtest harness, optional production augmentation).
 *   3. Estimated — vision model bar-size estimate. Lowest confidence; emits
 *      `confidence` < 60 so downstream agents can choose to abstain on
 *      ATR-relative scoring.
 *
 * Production V1 implementation is stubbed. The interface is the load-bearing
 * contract; the implementation can be filled in once Wave 0 OCR pipeline lands.
 */

export interface AtrInput {
  imageBase64: string;
  imageMimeType: string;
  /** Optional pre-computed price-axis samples from OCR */
  priceAxisSamples?: Array<{ y: number; price: number }>;
  /** Optional explicit override (backtest path) */
  externalAtrNqPoints?: number;
}

export interface AtrResult {
  /** ATR value in NQ points. Null when extraction fails. */
  valueNqPoints: number | null;
  source: 'ocr_derived' | 'externally_provided' | 'estimated' | 'unavailable';
  confidence: number;
  basisBars: number;
  /** Optional notes for explainability ("derived from 14-bar window", etc.) */
  notes?: string;
}

export class AtrNotImplemented extends Error {
  constructor() {
    super('ATR extraction not yet implemented (V1 pre-processing pending)');
  }
}

export async function extractAtr(input: AtrInput): Promise<AtrResult> {
  // Externally-provided path is trivial.
  if (typeof input.externalAtrNqPoints === 'number') {
    return {
      valueNqPoints: input.externalAtrNqPoints,
      source: 'externally_provided',
      confidence: 100,
      basisBars: 0,
      notes: 'Caller provided explicit ATR override.',
    };
  }

  // OCR-derived and vision-estimated paths require the Wave 0 OCR pipeline
  // and a vision model invocation respectively. Both are stubbed here.
  throw new AtrNotImplemented();
}
