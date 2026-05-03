"""Stage 1 — Setup Candidate Detector.

Per pipeline spec §3 (architecture/03-mass-calibration-backtest-pipeline.md):
emits raw candidate timestamps where any plausible setup geometry exists.
~5,000 candidates from 12 months of /NQ 1-min OHLC.

Per Stage 1.5 then narrows to 1,000 selected via the rule-based pre-filter.

Design discipline (from Agent 35 deliverable):
    - Single source of clock truth: every candidate eval pulls T from one var
    - Materialize-then-evaluate: indicators computed on frame_df only
    - No look-ahead leakage by construction
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd

from replay_engine.shared.indicators import WARMUP_BARS, compute_emas
from replay_engine.shared.timeframe import materialize_frame


# ── Candidate types per spec §3.1 ───────────────────────────────────────────

CANDIDATE_TYPES = (
    "pullback",
    "regime_establishment",
    "macro_break_retest",
    "failed_bounce",
    "random",
)

# ── Stratification windows (ET, see spec §3.2) ──────────────────────────────

# Sessions — every candidate gets exactly one stratum tag
STRATA = (
    "trending",
    "chop",
    "opening_drive",       # 9:30-10:30 ET
    "midday",              # 11:30-13:30 ET
    "power_hour",          # 15:00-16:00 ET
    "overnight",           # 16:00-9:30 ET
    "post_fomc",           # within 24h of an FOMC release
)


@dataclass(frozen=True)
class RawCandidate:
    """One candidate emitted by Stage 1, before pre-filter."""
    candidate_id: str
    ts_utc: pd.Timestamp
    candidate_type: str           # one of CANDIDATE_TYPES
    stratum: str                  # one of STRATA
    atr_at_candidate: float
    raw_features: dict[str, float]


# ── ATR helper (14-period default) ──────────────────────────────────────────

def compute_atr(frame_df: pd.DataFrame, period: int = 14) -> float | None:
    """Compute 14-period ATR on the right edge of frame_df.

    Returns None if frame_df has fewer than `period+1` rows.
    """
    if len(frame_df) < period + 1:
        return None

    high = frame_df["high"].to_numpy()
    low = frame_df["low"].to_numpy()
    close = frame_df["close"].to_numpy()

    # True range: max(high-low, |high - prev_close|, |low - prev_close|)
    tr = np.maximum(
        high[1:] - low[1:],
        np.maximum(
            np.abs(high[1:] - close[:-1]),
            np.abs(low[1:] - close[:-1]),
        ),
    )
    return float(np.mean(tr[-period:]))


# ── Candidate detection rules per spec §3.1 ─────────────────────────────────

def is_pullback_candidate(emas: pd.DataFrame, atr_value: float) -> bool:
    """Pullback candidate: price closed within 1 ATR of any cloud AND prior 10
    bars trended in dominant cloud direction.

    `emas` is a DataFrame with 'close' and ema_72/89/216/267/720/890 columns
    on the rolling 11-bar window ending at the candidate moment.
    """
    if len(emas) < 11 or atr_value <= 0:
        return False

    last = emas.iloc[-1]
    close = float(last["close"])

    # Distance to each cloud's mid
    dist_blue = abs(close - (last["ema_72"] + last["ema_89"]) / 2)
    dist_yellow = abs(close - (last["ema_216"] + last["ema_267"]) / 2)
    dist_white = abs(close - (last["ema_720"] + last["ema_890"]) / 2)
    near_any = min(dist_blue, dist_yellow, dist_white) <= atr_value

    # Trend continuation in prior 10 bars: did macro slope persist?
    macro_slope = float(emas.iloc[-1]["ema_720"] - emas.iloc[-11]["ema_720"])
    trended = abs(macro_slope) > atr_value * 0.1  # at least small slope

    return near_any and trended


def is_regime_establishment_candidate(emas: pd.DataFrame) -> bool:
    """Regime establishment: clouds curled from divergent slopes to converging
    within last 15 bars.

    Heuristic: macro and short-structural slopes were in different signs 15
    bars ago, but now agree.
    """
    if len(emas) < 16:
        return False

    last_macro = float(emas.iloc[-1]["ema_720"] - emas.iloc[-16]["ema_720"]) / 15
    last_yellow = float(emas.iloc[-1]["ema_216"] - emas.iloc[-16]["ema_216"]) / 15
    return np.sign(last_macro) == np.sign(last_yellow) and abs(last_macro) > 0


def is_macro_break_retest_candidate(emas: pd.DataFrame) -> bool:
    """Price crossed back through the white macro cloud within last 8 bars."""
    if len(emas) < 9:
        return False

    closes = emas["close"].to_numpy()
    macro_mid = (emas["ema_720"] + emas["ema_890"]).to_numpy() / 2
    relative = closes[-9:] - macro_mid[-9:]
    # Did the sign flip in the last 8 bars?
    signs = np.sign(relative)
    return bool((signs[1:] != signs[:-1]).any())


def is_failed_bounce_candidate(emas: pd.DataFrame) -> bool:
    """Short bounce off cloud followed by re-entry within last 5 bars.

    Heuristic: price was outside any cloud 5 bars ago, came back inside within
    last 3 bars (incomplete bounce).
    """
    if len(emas) < 6:
        return False

    last5 = emas.iloc[-5:]
    blue_mid = (last5["ema_72"] + last5["ema_89"]) / 2
    yellow_mid = (last5["ema_216"] + last5["ema_267"]) / 2

    # Was price > blue_mid 5 bars ago and < blue_mid now? (bear failed bounce)
    above_then = last5.iloc[0]["close"] > blue_mid.iloc[0]
    below_now = last5.iloc[-1]["close"] < blue_mid.iloc[-1]
    bear_signature = above_then and below_now

    # Bull failed bounce
    below_then = last5.iloc[0]["close"] < yellow_mid.iloc[0]
    above_now = last5.iloc[-1]["close"] > yellow_mid.iloc[-1]
    bull_signature = below_then and above_now

    return bear_signature or bull_signature


# ── Stratum classification per spec §3.2 ────────────────────────────────────

def assign_stratum(
    ts_utc: pd.Timestamp,
    emas: pd.DataFrame,
    atr_value: float,
    fomc_dates_utc: set[pd.Timestamp] | None = None,
) -> str:
    """Assign one stratum tag per candidate.

    Priority order: post_fomc > session-of-day > regime-derived.
    """
    fomc_dates_utc = fomc_dates_utc or set()

    # Post-FOMC check (within 24h)
    for fomc_ts in fomc_dates_utc:
        if 0 <= (ts_utc - fomc_ts).total_seconds() <= 86400:
            return "post_fomc"

    # Convert to ET for session classification (UTC-5 standard, UTC-4 DST)
    # Use pandas tz_convert; assume "America/New_York" tz at boundary
    et = ts_utc.tz_convert("America/New_York")
    hour, minute = et.hour, et.minute
    minutes_since_midnight = hour * 60 + minute

    if 9 * 60 + 30 <= minutes_since_midnight < 10 * 60 + 30:
        return "opening_drive"
    if 11 * 60 + 30 <= minutes_since_midnight < 13 * 60 + 30:
        return "midday"
    if 15 * 60 <= minutes_since_midnight < 16 * 60:
        return "power_hour"
    if minutes_since_midnight < 9 * 60 + 30 or minutes_since_midnight >= 16 * 60:
        return "overnight"

    # Default to regime classification
    if len(emas) < 11 or atr_value <= 0:
        return "chop"
    macro_slope = abs(emas.iloc[-1]["ema_720"] - emas.iloc[-11]["ema_720"])
    return "trending" if macro_slope > atr_value * 0.5 else "chop"


# ── Detector orchestration (pure function, takes a frame_df) ────────────────

def detect_candidates_at(
    full_df: pd.DataFrame,
    t_now: pd.Timestamp,
    fomc_dates_utc: set[pd.Timestamp] | None = None,
    candidate_id_prefix: str = "c",
) -> list[RawCandidate]:
    """At simulated moment t_now, evaluate full_df and emit zero or more candidates.

    Per Agent 35 §2: materialize frame_df ONCE, compute all indicators on the
    frame, evaluate detection rules. Never expose full_df past this boundary.

    Returns a list of RawCandidate (may be empty if no candidate type fires).
    """
    frame = materialize_frame(full_df, t_now)
    if len(frame) < WARMUP_BARS:
        return []

    emas = compute_emas(frame, t_now)
    atr_value = compute_atr(emas)
    if atr_value is None or atr_value <= 0:
        return []

    candidates: list[RawCandidate] = []
    last_ts = frame["ts_utc"].iloc[-1]

    # The candidate is timestamped at the close of the last visible bar (T_now-1)
    candidate_ts = last_ts

    raw_features = {
        "atr": atr_value,
        "close": float(emas.iloc[-1]["close"]),
        "ema_72": float(emas.iloc[-1]["ema_72"]),
        "ema_216": float(emas.iloc[-1]["ema_216"]),
        "ema_720": float(emas.iloc[-1]["ema_720"]),
    }

    stratum = assign_stratum(candidate_ts, emas, atr_value, fomc_dates_utc)

    fired_types: list[str] = []
    if is_pullback_candidate(emas, atr_value):
        fired_types.append("pullback")
    if is_regime_establishment_candidate(emas):
        fired_types.append("regime_establishment")
    if is_macro_break_retest_candidate(emas):
        fired_types.append("macro_break_retest")
    if is_failed_bounce_candidate(emas):
        fired_types.append("failed_bounce")

    for i, ct in enumerate(fired_types):
        candidates.append(
            RawCandidate(
                candidate_id=f"{candidate_id_prefix}_{candidate_ts.value}_{i}",
                ts_utc=candidate_ts,
                candidate_type=ct,
                stratum=stratum,
                atr_at_candidate=atr_value,
                raw_features=raw_features,
            )
        )

    return candidates


def add_random_samples(
    full_df: pd.DataFrame,
    every_n_bars: int = 100,
    fomc_dates_utc: set[pd.Timestamp] | None = None,
    candidate_id_prefix: str = "r",
) -> Iterable[RawCandidate]:
    """Emit a random-sample candidate every N bars for diversity baseline.

    Per spec §3.1 rule 5: bar every 100 (regardless of structure).
    """
    if len(full_df) <= WARMUP_BARS + every_n_bars:
        return []

    fomc_dates_utc = fomc_dates_utc or set()
    output: list[RawCandidate] = []

    for i in range(WARMUP_BARS, len(full_df), every_n_bars):
        t_now = full_df["ts_utc"].iloc[i]  # audit-ok: timestamp column read only — IS t_now itself
        frame = materialize_frame(full_df, t_now)
        if len(frame) < WARMUP_BARS:
            continue
        emas = compute_emas(frame, t_now)
        atr_value = compute_atr(emas)
        if atr_value is None:
            continue

        candidate_ts = frame["ts_utc"].iloc[-1]
        stratum = assign_stratum(candidate_ts, emas, atr_value, fomc_dates_utc)

        output.append(
            RawCandidate(
                candidate_id=f"{candidate_id_prefix}_{candidate_ts.value}",
                ts_utc=candidate_ts,
                candidate_type="random",
                stratum=stratum,
                atr_at_candidate=atr_value,
                raw_features={
                    "atr": atr_value,
                    "close": float(emas.iloc[-1]["close"]),
                },
            )
        )

    return output
