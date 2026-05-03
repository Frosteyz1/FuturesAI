/**
 * Pre-processing layer entry point.
 *
 * Runs once per upload, before any Wave 0 routing. Outputs are passed
 * to every downstream agent via `PreProcessingResult`.
 */

import type { PreProcessingResult } from '@/lib/orchestrator/types';
import { extractAtr } from './atr';

export class PreProcessingNotImplemented extends Error {
  constructor(step: string) {
    super(`Pre-processing step not implemented: ${step}`);
  }
}

export async function preProcess(
  imageBase64: string,
  imageMimeType: string,
): Promise<PreProcessingResult> {
  void imageBase64;
  void imageMimeType;
  void extractAtr;

  // Will: image-normalize, OCR (timeframe / instrument / timestamp / price axis),
  // ATR extraction (delegates to atr.ts), indicator detection.
  throw new PreProcessingNotImplemented('preProcess');
}

export { extractAtr };
