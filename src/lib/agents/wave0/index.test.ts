/**
 * Tests for runWave0() orchestration.
 *
 * Mocks each agent's invocation function so the orchestration can be tested
 * without going near the Anthropic SDK.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Agent00aOutput,
  Agent00bOutput,
  Agent00cOutput,
  Agent00dOutput,
} from '@/lib/agents/shared/schemas';

// vi.mock is hoisted to the top of the file at parse time, so we need
// vi.hoisted() to declare the mock fns alongside it. See:
// https://vitest.dev/api/vi.html#vi-hoisted
const { mockRun00a, mockRun00b, mockRun00c, mockRun00d } = vi.hoisted(() => ({
  mockRun00a: vi.fn(),
  mockRun00b: vi.fn(),
  mockRun00c: vi.fn(),
  mockRun00d: vi.fn(),
}));

vi.mock('./agent-00a', () => ({ runAgent00a: mockRun00a }));
vi.mock('./agent-00b', () => ({ runAgent00b: mockRun00b }));
vi.mock('./agent-00c', () => ({ runAgent00c: mockRun00c }));
vi.mock('./agent-00d', () => ({ runAgent00d: mockRun00d }));

import { runWave0 } from './index';

const fixtureInput = { imageBase64: 'x', imageMimeType: 'image/png' as const };

const mock00a = (overrides: Partial<Agent00aOutput> = {}): Agent00aOutput => ({
  agent_id: '00a',
  score: null,
  confidence: 95,
  abstain: false,
  evidence: [],
  timeframe: '1m',
  source: 'label_detected',
  ...overrides,
});

const mock00b = (overrides: Partial<Agent00bOutput> = {}): Agent00bOutput => ({
  agent_id: '00b',
  score: null,
  confidence: 80,
  abstain: false,
  evidence: [],
  state: 'REJECTION_FIRING',
  state_at_right_edge: 'REJECTION_FIRING',
  recommended_verdict_modes: ['TAKE_NOW', 'WAIT_FOR_LEVEL'],
  ...overrides,
});

const mock00c = (overrides: Partial<Agent00cOutput> = {}): Agent00cOutput => ({
  agent_id: '00c',
  score: null,
  confidence: 80,
  abstain: false,
  evidence: [],
  variant: 'VARIANT_A',
  direction_bias: 'long',
  ...overrides,
});

const mock00d = (overrides: Partial<Agent00dOutput> = {}): Agent00dOutput => ({
  agent_id: '00d',
  score: 70,
  confidence: 75,
  abstain: false,
  evidence: [],
  direction_bias: 'long',
  watch_level: 21300,
  watch_layer: 'blue',
  trigger_to_wait_for: 'rejection candle',
  expected_window: '15-60min',
  invalidation_price: 21250,
  ...overrides,
});

beforeEach(() => {
  mockRun00a.mockReset();
  mockRun00b.mockReset();
  mockRun00c.mockReset();
  mockRun00d.mockReset();
});

afterEach(() => vi.clearAllMocks());

/* ── Routing: abstain_input ─────────────────────────────────────────────── */

describe('runWave0 — abstain_input routing', () => {
  it('routes to abstain_input when 00a abstains', async () => {
    mockRun00a.mockResolvedValue(mock00a({
      abstain: true,
      abstain_reason: 'no timeframe label',
      timeframe: 'UNKNOWN',
      source: 'abstain',
    }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('abstain_input');
    expect(result.agent_00b).toBeNull();
    expect(result.agent_00c).toBeNull();
    expect(result.agent_00d).toBeNull();
    expect(mockRun00b).not.toHaveBeenCalled();  // didn't pay for Opus calls
    expect(mockRun00c).not.toHaveBeenCalled();
  });

  it('routes to abstain_input when 00a returns UNKNOWN even without abstain flag', async () => {
    mockRun00a.mockResolvedValue(mock00a({ timeframe: 'UNKNOWN' }));
    const result = await runWave0(fixtureInput);
    expect(result.routing).toBe('abstain_input');
  });

  it('routes to abstain_input when 00c emits ABSTAIN_INPUT variant', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b());
    mockRun00c.mockResolvedValue(mock00c({
      variant: 'ABSTAIN_INPUT',
      abstain: true,
      abstain_reason: 'chart unreadable',
    }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('abstain_input');
    expect(result.agent_00d).toBeNull();
    expect(mockRun00d).not.toHaveBeenCalled();
  });
});

/* ── Routing: out_of_scope (V2 variants) ───────────────────────────────── */

describe('runWave0 — out_of_scope routing', () => {
  it.each([
    ['VARIANT_B', 'regime-establishment / open confluence'],
    ['VARIANT_C', 'macro break + retest'],
    ['VARIANT_D', 'failed-bounce reversal'],
    ['OTHER_PATTERNED', 'recognizable but unnamed'],
  ])('routes %s to out_of_scope (%s)', async (variant) => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b());
    mockRun00c.mockResolvedValue(mock00c({ variant: variant as 'VARIANT_B' }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('out_of_scope');
    expect(result.agent_00d).toBeNull();
    expect(mockRun00d).not.toHaveBeenCalled();
  });
});

/* ── Routing: actionable_now ────────────────────────────────────────────── */

describe('runWave0 — actionable_now routing', () => {
  it('routes REJECTION_FIRING + Variant A to actionable_now', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: 'REJECTION_FIRING' }));
    mockRun00c.mockResolvedValue(mock00c({ variant: 'VARIANT_A' }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('actionable_now');
    expect(result.agent_00d).toBeNull();
    expect(mockRun00d).not.toHaveBeenCalled();  // skip 00d on actionable
  });

  it('routes PULLBACK_IN_PROGRESS + Variant A to actionable_now', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: 'PULLBACK_IN_PROGRESS' }));
    mockRun00c.mockResolvedValue(mock00c());
    const result = await runWave0(fixtureInput);
    expect(result.routing).toBe('actionable_now');
  });

  it('runs 00b and 00c in parallel after 00a', async () => {
    mockRun00a.mockResolvedValue(mock00a());

    const order: string[] = [];
    mockRun00b.mockImplementation(async () => {
      order.push('00b');
      return mock00b();
    });
    mockRun00c.mockImplementation(async () => {
      order.push('00c');
      return mock00c();
    });

    await runWave0(fixtureInput);

    // Both invoked exactly once
    expect(mockRun00b).toHaveBeenCalledOnce();
    expect(mockRun00c).toHaveBeenCalledOnce();
  });
});

/* ── Routing: wait_for_level ────────────────────────────────────────────── */

describe('runWave0 — wait_for_level routing', () => {
  it.each([
    'TREND_ESTABLISHED_RUNNING',
    'TREND_FORMING',
    'POST_REJECTION_CONTINUATION',
    'REGIME_TRANSITION',
    'MACRO_BREAK_RETEST',
  ])('runs 00d for state %s', async (state) => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: state as 'TREND_ESTABLISHED_RUNNING' }));
    mockRun00c.mockResolvedValue(mock00c());
    mockRun00d.mockResolvedValue(mock00d({ score: 70 }));

    const result = await runWave0(fixtureInput);

    expect(mockRun00d).toHaveBeenCalledOnce();
    expect(result.routing).toBe('wait_for_level');
    expect(result.agent_00d).not.toBeNull();
    expect(result.reason).toContain('21300');
  });

  it('downgrades wait_for_level to skip when 00d score < 55', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: 'TREND_ESTABLISHED_RUNNING' }));
    mockRun00c.mockResolvedValue(mock00c());
    mockRun00d.mockResolvedValue(mock00d({ score: 40 }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('skip_no_edge');
    expect(result.agent_00d).not.toBeNull();
  });

  it('downgrades wait_for_level to skip when 00d abstains', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: 'TREND_ESTABLISHED_RUNNING' }));
    mockRun00c.mockResolvedValue(mock00c());
    mockRun00d.mockResolvedValue(mock00d({
      abstain: true,
      abstain_reason: 'price 4×ATR from any cloud',
      score: null,
    }));

    const result = await runWave0(fixtureInput);

    expect(result.routing).toBe('skip_no_edge');
    expect(result.reason).toContain('4×ATR');
  });
});

/* ── Routing: skip_no_edge ─────────────────────────────────────────────── */

describe('runWave0 — skip_no_edge routing', () => {
  it.each(['RANGE_BOUND', 'INSUFFICIENT_HISTORY'])(
    'routes %s to skip_no_edge without invoking 00d',
    async (state) => {
      mockRun00a.mockResolvedValue(mock00a());
      mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: state as 'RANGE_BOUND' }));
      mockRun00c.mockResolvedValue(mock00c());

      const result = await runWave0(fixtureInput);

      expect(result.routing).toBe('skip_no_edge');
      expect(mockRun00d).not.toHaveBeenCalled();
    },
  );
});

/* ── Cost discipline: cheap path bails before paying for Opus ──────────── */

describe('runWave0 — cost discipline', () => {
  it('bails after 00a (Haiku) when timeframe abstains — no Opus calls made', async () => {
    mockRun00a.mockResolvedValue(mock00a({
      abstain: true,
      timeframe: 'UNKNOWN',
      source: 'abstain',
    }));

    await runWave0(fixtureInput);

    expect(mockRun00a).toHaveBeenCalledOnce();
    expect(mockRun00b).not.toHaveBeenCalled();
    expect(mockRun00c).not.toHaveBeenCalled();
    expect(mockRun00d).not.toHaveBeenCalled();
  });

  it('skips 00d when state is actionable (no Sonnet call)', async () => {
    mockRun00a.mockResolvedValue(mock00a());
    mockRun00b.mockResolvedValue(mock00b({ state_at_right_edge: 'REJECTION_FIRING' }));
    mockRun00c.mockResolvedValue(mock00c());

    await runWave0(fixtureInput);

    expect(mockRun00d).not.toHaveBeenCalled();
  });
});
