"""6-factor scorer — port of nq-trigger-tracker confidence-scorer.ts.

Ported line-by-line from the production NQ Trigger Tracker source per
MASTER-AUTHORIZATION §3 Stage 1.5: "Do not 'improve' the logic during port —
fidelity is the goal." Ranges, breakpoints, and weights match exactly.

What changed from the original (NOT improvements — adaptations to V1 spec):
    - Alignment gate uses the new 3-cloud system (72/89 + 216/267 + 720/890)
      per planning prompt §1.0, not the original 29/44 + 72/89 stack.
    - The 6 scoring functions are pure (inputs explicit); the wrapper
      filter.py manages prior_outcome history and setup-freshness state.

Source: C:/Users/Kevin/nq-trigger-tracker-source/nq-trigger-tracker-main/
        src/lib/confidence-scorer.ts
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np


# ── Constants (from confidence-scorer/constants.ts) ─────────────────────────

COMPRESSION_LOOKBACK = 10
SLOPE_LOOKBACK = 5
MAX_FRESH_SETUPS = 5

CONFIDENCE_WEIGHTS = {
    "cloud_compression": 0.25,
    "ema_acceleration": 0.20,
    "prior_outcome": 0.15,
    "setup_freshness": 0.15,
    "trigger_body_ratio": 0.15,
    "wick_depth": 0.10,
}

CONF_STRONG = 80
CONF_MODERATE = 60
CONF_WEAK = 40


Direction = Literal["long", "short"]
Tier = Literal["strong", "moderate", "weak", "fade"]


@dataclass(frozen=True)
class Candle:
    """Single OHLC bar."""
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass(frozen=True)
class ConfidenceFactors:
    cloud_compression: float
    ema_acceleration: float
    prior_outcome: float
    setup_freshness: float
    trigger_body_ratio: float
    wick_depth: float


# ── 1. Cloud compression ────────────────────────────────────────────────────

def score_cloud_compression(
    ema_fast: np.ndarray,
    ema_slow: np.ndarray,
    atr: np.ndarray,
    idx: int,
) -> float:
    """Score how the cloud (ema_fast - ema_slow) is compressing/expanding.

    Source: confidence-scorer.ts:7-31
    Width floor caps: width<0.15 -> 35, <0.25 -> 50, <0.35 -> 70 (ATR-relative)
    Compression rate breakpoints: +0.05 / +0.02 / -0.01 / -0.03
    """
    i0 = idx - COMPRESSION_LOOKBACK
    if i0 < 0 or np.isnan(ema_fast[i0]) or np.isnan(ema_slow[i0]) or np.isnan(atr[idx]) or atr[idx] == 0:
        return 50.0

    current_width = abs(ema_fast[idx] - ema_slow[idx])
    past_width = abs(ema_fast[i0] - ema_slow[i0])
    current_norm = current_width / atr[idx]
    past_norm = past_width / atr[idx]
    rate = current_norm - past_norm

    cap = 100.0
    if current_norm < 0.15:
        cap = 35.0
    elif current_norm < 0.25:
        cap = 50.0
    elif current_norm < 0.35:
        cap = 70.0

    if rate > 0.05:
        raw = 95.0
    elif rate > 0.02:
        raw = 80.0
    elif rate > -0.01:
        raw = 55.0
    elif rate > -0.03:
        raw = 30.0
    else:
        raw = 10.0

    return min(raw, cap)


# ── 2. EMA acceleration ─────────────────────────────────────────────────────

def score_ema_acceleration(ema_short: np.ndarray, idx: int, direction: Direction) -> float:
    """Score whether the short EMA is accelerating in trade direction.

    Source: confidence-scorer.ts:33-54
    Deceleration threshold: -0.3 x |currentSlope|
    """
    i1 = idx - SLOPE_LOOKBACK
    i2 = idx - 2 * SLOPE_LOOKBACK
    if i2 < 0 or np.isnan(ema_short[i1]) or np.isnan(ema_short[i2]):
        return 50.0

    current_slope = ema_short[idx] - ema_short[i1]
    prev_slope = ema_short[i1] - ema_short[i2]
    accel = current_slope - prev_slope

    if direction == "long":
        if current_slope > 0 and accel > 0:
            return 100.0
        if current_slope > 0 and accel > -0.3 * abs(current_slope):
            return 70.0
        if current_slope > 0:
            return 40.0
        return 10.0
    else:  # short
        if current_slope < 0 and accel < 0:
            return 100.0
        if current_slope < 0 and accel < 0.3 * abs(current_slope):
            return 70.0
        if current_slope < 0:
            return 40.0
        return 10.0


# ── 3. Prior outcome ────────────────────────────────────────────────────────

def score_prior_outcome(prior_outcomes: list[bool]) -> float:
    """Score based on the running history of recent identical-setup outcomes.

    Source: confidence-scorer.ts:56-67
    True = win, False = loss. Most recent at end of list.
    """
    if len(prior_outcomes) == 0:
        return 65.0

    wins = sum(1 for x in prior_outcomes if x)
    total = len(prior_outcomes)
    last = prior_outcomes[-1]

    if total >= 2 and wins == 0:
        return 10.0
    if not last and total >= 2:
        return 30.0
    if not last:
        return 45.0
    if last and wins == total:
        return 100.0
    if last:
        return 75.0
    return 50.0


# ── 4. Setup freshness ──────────────────────────────────────────────────────

def score_setup_freshness(setup_count_in_leg: int) -> float:
    """Score how fresh the setup is within the current trend leg.

    Source: confidence-scorer.ts:69-77
    Decay: 100 / 85 / 60 / 30 / 10
    """
    if setup_count_in_leg == 1:
        return 100.0
    if setup_count_in_leg == 2:
        return 85.0
    if setup_count_in_leg == 3:
        return 60.0
    if setup_count_in_leg == 4:
        return 30.0
    return 10.0


# ── 5. Trigger body ratio ───────────────────────────────────────────────────

def score_trigger_body_ratio(c: Candle, direction: Direction) -> float:
    """Score the trigger candle's body/range ratio.

    Source: confidence-scorer.ts:79-92
    Wrong-direction penalty caps the score at 30.
    """
    body = abs(c.close - c.open)
    range_ = c.high - c.low
    if range_ == 0:
        return 0.0
    ratio = body / range_

    correct_dir = (c.close > c.open) if direction == "long" else (c.close < c.open)

    if ratio > 0.7:
        s = 100.0
    elif ratio > 0.5:
        s = 85.0
    elif ratio > 0.3:
        s = 55.0
    else:
        s = 20.0

    if not correct_dir:
        s = min(s, 30.0)
    return s


# ── 6. Wick depth ───────────────────────────────────────────────────────────

def score_wick_depth(setup: Candle, ema_fast: float, ema_slow: float, direction: Direction) -> float:
    """Score how deep the rejection wick penetrates the cloud.

    Source: confidence-scorer.ts:94-107
    Sweet spot: 0.2-0.6 = 100. Too shallow or too deep = lower score.
    """
    cloud_range = abs(ema_fast - ema_slow)
    if cloud_range == 0:
        return 50.0

    if direction == "long":
        penetration = (ema_fast - setup.low) / cloud_range
    else:
        penetration = (setup.high - ema_fast) / cloud_range

    if 0.2 <= penetration <= 0.6:
        return 100.0
    if 0.6 < penetration <= 0.8:
        return 60.0
    if penetration > 0.8:
        return 20.0
    if 0.05 <= penetration < 0.2:
        return 50.0
    return 30.0


# ── 7. Alignment gate (V1 3-cloud version, NOT a port — extended per §1.0) ──

def apply_alignment_gate_v1(
    score: float,
    ema_72: float,
    ema_89: float,
    ema_216: float,
    ema_267: float,
    ema_720: float,
    ema_890: float,
    direction: Direction,
) -> float:
    """V1 3-cloud alignment gate per planning prompt section 1.0.

    NOT a port — this is the new 3-cloud version. The original scorer used
    29/44 + 72/89; the V1 system uses 72/89 (micro) + 216/267 (short-structural)
    + 720/890 (macro). Cap rules:
        - both macro AND short-structural against -> cap at 40
        - either macro OR short-structural against -> cap at 55
        - otherwise no cap
    """
    # ema_72 and ema_89 are unused here (the micro pair), but kept in the
    # signature so the call shape mirrors the original scorer's. The V1 cap
    # only depends on the structural and macro pairs being aligned.
    del ema_72, ema_89

    if direction == "long":
        macro_against = ema_720 < ema_890
        short_structural_against = ema_216 < ema_267
    else:
        macro_against = ema_720 > ema_890
        short_structural_against = ema_216 > ema_267

    if macro_against and short_structural_against:
        return min(score, 40.0)
    if macro_against or short_structural_against:
        return min(score, 55.0)
    return score


# ── 8. Composite + tier ─────────────────────────────────────────────────────

def tier_for(score: float) -> Tier:
    """Map composite score to tier label.

    Source: confidence-scorer.ts:128-133
    """
    if score >= CONF_STRONG:
        return "strong"
    if score >= CONF_MODERATE:
        return "moderate"
    if score >= CONF_WEAK:
        return "weak"
    return "fade"


def calc_confidence(
    factors: ConfidenceFactors,
    ema_72: float,
    ema_89: float,
    ema_216: float,
    ema_267: float,
    ema_720: float,
    ema_890: float,
    direction: Direction,
) -> tuple[float, Tier]:
    """Compute weighted composite score and tier.

    Source: confidence-scorer.ts:135-151
    Note: original used (emaShort, emaLong, ema72, ema89) for the alignment
    gate. V1 version uses (72/89, 216/267, 720/890) per section 1.0.
    """
    w = CONFIDENCE_WEIGHTS
    raw = round(
        factors.cloud_compression * w["cloud_compression"]
        + factors.ema_acceleration * w["ema_acceleration"]
        + factors.prior_outcome * w["prior_outcome"]
        + factors.setup_freshness * w["setup_freshness"]
        + factors.trigger_body_ratio * w["trigger_body_ratio"]
        + factors.wick_depth * w["wick_depth"]
    )
    score = apply_alignment_gate_v1(
        raw, ema_72, ema_89, ema_216, ema_267, ema_720, ema_890, direction
    )
    return float(score), tier_for(score)
