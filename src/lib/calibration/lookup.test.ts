import { describe, expect, it } from 'vitest';

import {
  calibrationStateFor,
  coldStartProbability,
  lookupCalibration,
} from './lookup';

describe('calibrationStateFor', () => {
  it('returns none for n < 5', () => {
    expect(calibrationStateFor(0)).toBe('none');
    expect(calibrationStateFor(4)).toBe('none');
  });

  it('returns uncalibrated for 5-19', () => {
    expect(calibrationStateFor(5)).toBe('uncalibrated');
    expect(calibrationStateFor(19)).toBe('uncalibrated');
  });

  it('returns rough for 20-74', () => {
    expect(calibrationStateFor(20)).toBe('rough');
    expect(calibrationStateFor(74)).toBe('rough');
  });

  it('returns provisional for 75-149', () => {
    expect(calibrationStateFor(75)).toBe('provisional');
    expect(calibrationStateFor(149)).toBe('provisional');
  });

  it('returns calibrated for 150+', () => {
    expect(calibrationStateFor(150)).toBe('calibrated');
    expect(calibrationStateFor(500)).toBe('calibrated');
  });
});

describe('coldStartProbability', () => {
  it('score 80 -> ~0.58 (above 0.55 target floor)', () => {
    const { pWin } = coldStartProbability(80);
    expect(pWin).toBeGreaterThanOrEqual(0.55);
    expect(pWin).toBeLessThan(0.65);
  });

  it('score 100 -> 0.65 ceiling', () => {
    const { pWin } = coldStartProbability(100);
    expect(pWin).toBeCloseTo(0.65, 2);
  });

  it('score 0 -> 0.30 floor', () => {
    const { pWin } = coldStartProbability(0);
    expect(pWin).toBeCloseTo(0.30, 2);
  });

  it('returns wide CI in cold-start', () => {
    const { ci } = coldStartProbability(80);
    const width = ci[1] - ci[0];
    expect(width).toBeGreaterThanOrEqual(0.30);
  });

  it('CI clamps at [0, 1]', () => {
    const { ci: ciHigh } = coldStartProbability(100);
    expect(ciHigh[1]).toBeLessThanOrEqual(1);

    const { ci: ciLow } = coldStartProbability(0);
    expect(ciLow[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('lookupCalibration', () => {
  it('returns null calibrated_p_win when state=none', () => {
    const r = lookupCalibration({
      rawScore: 80, variant: 'VARIANT_A', tier: 2, instrument: 'NQ',
      cellSampleCount: 2,
    });
    expect(r.calibration_state).toBe('none');
    expect(r.calibrated_p_win).toBeNull();
  });

  it('returns probability + CI when state >= uncalibrated', () => {
    const r = lookupCalibration({
      rawScore: 80, variant: 'VARIANT_A', tier: 2, instrument: 'NQ',
      cellSampleCount: 30,
    });
    expect(r.calibration_state).toBe('rough');
    expect(r.calibrated_p_win).toBeGreaterThan(0);
    expect(r.calibrated_p_win_ci).toBeDefined();
  });

  it('preserves rawScore in score field', () => {
    const r = lookupCalibration({
      rawScore: 73, variant: 'VARIANT_A', tier: 1, instrument: 'NQ',
      cellSampleCount: 100,
    });
    expect(r.score).toBe(73);
    expect(r.calibration_state).toBe('provisional');
  });

  it('confidence=100 (this is a deterministic lookup, not an LLM call)', () => {
    const r = lookupCalibration({
      rawScore: 80, variant: 'VARIANT_A', tier: 2, instrument: 'NQ',
      cellSampleCount: 50,
    });
    expect(r.confidence).toBe(100);
  });
});
