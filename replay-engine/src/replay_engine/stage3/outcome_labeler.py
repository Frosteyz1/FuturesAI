"""Stage 3 outcome labeler — walk-forward simulation with R-bucket tracking.

Per pipeline spec §6.3 (post-2026-05-03 correction):
    Primary outcome label is binary on `r_to_2_5R`:
        'W'  = reached 2.5R before stop
        'L'  = stop hit before reaching 2.5R
        'BE' = neither stop nor 2.5R hit within 60-bar horizon

Secondary labels preserve scenario richness:
        r_to_3R, r_to_4R, max_r_achieved

Walks forward bar-by-bar through OHLCV-1s data — high/low of each second
captures intra-bar wick action that hits stop or target. Sub-second
precision is overkill for 12pt stops.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd

from replay_engine.shared.types import OutcomeLabel, StopLogic


# Per spec §6.1 constants
R_BUCKET_2_5 = 2.5
R_BUCKET_3 = 3.0
R_BUCKET_4 = 4.0
MAX_HOLD_BARS_DEFAULT = 60  # 60 bars on the chart base TF (~30 min on 1-min)


Direction = Literal["long", "short"]


def label_outcome(
    candidate_id: str,
    entry_price: float,
    direction: Direction,
    dynamic_stop_points: float,
    stop_logic: StopLogic,
    forward_ohlcv_1s: pd.DataFrame,
    max_hold_seconds: int,
    event_confounded: bool = False,
) -> OutcomeLabel:
    """Walk forward through OHLCV-1s data and emit an outcome label.

    Args:
        candidate_id: Stage 1.5 selection ID
        entry_price: simulated entry at close of bar T+1
        direction: long or short
        dynamic_stop_points: stop distance in NQ points (per spec §6.2)
        stop_logic: how the stop was derived (audit field)
        forward_ohlcv_1s: 1-second bars from entry forward; columns
            [ts_utc, open, high, low, close, volume]
        max_hold_seconds: time-stop in seconds (e.g., 60 bars × 60s = 3600 for 1-min base)
        event_confounded: True if entry is within ±30min of FOMC/CPI/NFP

    Returns:
        OutcomeLabel with primary outcome (W/L/BE/None) plus all R-bucket flags,
        max_r_achieved, MFE/MAE, time-to-bucket measurements.

        Returns OutcomeLabel with outcome=None if forward_ohlcv_1s ran out before
        the trade resolved (outcome lag insufficient — exclude from Stage 5).
    """
    if dynamic_stop_points <= 0:
        raise ValueError(f"dynamic_stop_points must be > 0, got {dynamic_stop_points}")

    if direction == "long":
        stop_price = entry_price - dynamic_stop_points
        target_2_5 = entry_price + R_BUCKET_2_5 * dynamic_stop_points
        target_3 = entry_price + R_BUCKET_3 * dynamic_stop_points
        target_4 = entry_price + R_BUCKET_4 * dynamic_stop_points
    else:
        stop_price = entry_price + dynamic_stop_points
        target_2_5 = entry_price - R_BUCKET_2_5 * dynamic_stop_points
        target_3 = entry_price - R_BUCKET_3 * dynamic_stop_points
        target_4 = entry_price - R_BUCKET_4 * dynamic_stop_points

    if forward_ohlcv_1s.empty:
        return OutcomeLabel(
            candidate_id=candidate_id,
            direction=direction,
            dynamic_stop_used=dynamic_stop_points,
            stop_logic=stop_logic,
            outcome=None,
            event_confounded=event_confounded,
        )

    # Walk forward
    ts_start = pd.Timestamp(forward_ohlcv_1s["ts_utc"].iloc[0])
    max_hold_end = ts_start + pd.Timedelta(seconds=max_hold_seconds)

    hit_2_5r = False
    hit_3r = False
    hit_4r = False
    time_to_2_5_seconds: int | None = None
    time_to_3_seconds: int | None = None
    time_to_4_seconds: int | None = None

    max_r_achieved = 0.0
    min_r_achieved = 0.0
    time_to_max_fe_seconds: int | None = None
    time_to_max_ae_seconds: int | None = None

    stop_hit = False
    stop_hit_seconds: int | None = None
    final_r = 0.0

    bars = forward_ohlcv_1s.itertuples(index=False)
    last_bar = None
    for bar in bars:
        last_bar = bar
        ts = pd.Timestamp(bar.ts_utc)
        elapsed = int((ts - ts_start).total_seconds())

        # Time-stop check
        if ts > max_hold_end:
            break

        bar_high = float(bar.high)
        bar_low = float(bar.low)

        # Compute R at high and at low
        if direction == "long":
            r_at_high = (bar_high - entry_price) / dynamic_stop_points
            r_at_low = (bar_low - entry_price) / dynamic_stop_points
        else:
            r_at_high = (entry_price - bar_low) / dynamic_stop_points  # short MFE = price drop
            r_at_low = (entry_price - bar_high) / dynamic_stop_points

        # Update max favorable / adverse
        if r_at_high > max_r_achieved:
            max_r_achieved = r_at_high
            time_to_max_fe_seconds = elapsed
        if r_at_low < min_r_achieved:
            min_r_achieved = r_at_low
            time_to_max_ae_seconds = elapsed

        # Stop hit check (use the bar's adverse extreme)
        if direction == "long":
            stop_touched = bar_low <= stop_price
        else:
            stop_touched = bar_high >= stop_price

        # Target ladder check (use the bar's favorable extreme)
        if not hit_2_5r:
            if (direction == "long" and bar_high >= target_2_5) or (direction == "short" and bar_low <= target_2_5):
                hit_2_5r = True
                time_to_2_5_seconds = elapsed
        if not hit_3r:
            if (direction == "long" and bar_high >= target_3) or (direction == "short" and bar_low <= target_3):
                hit_3r = True
                time_to_3_seconds = elapsed
        if not hit_4r:
            if (direction == "long" and bar_high >= target_4) or (direction == "short" and bar_low <= target_4):
                hit_4r = True
                time_to_4_seconds = elapsed

        # Stop has lower priority than the SAME-BAR target check above —
        # if the bar reached 2.5R AND stop in the same second, take the
        # favorable (matches reality of resting limit-orders that fill
        # before market-stops trigger). Note: this is a v1 simplification;
        # v2 may use sequence-of-ticks if Trades schema is added.
        if stop_touched and not hit_2_5r:
            stop_hit = True
            stop_hit_seconds = elapsed
            # Final R is exactly -1.0 at stop
            final_r = -1.0
            break
        if stop_touched and hit_2_5r:
            # Reached the W floor before stop — record final R as the highest
            # bucket actually hit during this bar
            stop_hit = True
            stop_hit_seconds = elapsed
            break

    # Resolve final R if we ran past max_hold without hitting either
    if not stop_hit and last_bar is not None:
        # Use the last bar's close as exit
        if direction == "long":
            final_r = (float(last_bar.close) - entry_price) / dynamic_stop_points
        else:
            final_r = (entry_price - float(last_bar.close)) / dynamic_stop_points

    # Outcome determination per spec §6.3:
    #   W  = r_to_2_5R hit (regardless of what happened after — once you've reached
    #        the discipline floor, the trade is a winner in this framework)
    #   L  = stop hit before 2.5R
    #   BE = max_hold reached without stop or 2.5R
    #   None = forward data exhausted before max_hold AND no resolution (lag insufficient)
    last_ts = pd.Timestamp(last_bar.ts_utc) if last_bar is not None else None
    reached_max_hold = last_ts is not None and last_ts >= max_hold_end

    outcome: Literal["W", "L", "BE"] | None
    if hit_2_5r:
        outcome = "W"
    elif stop_hit:
        outcome = "L"
    elif reached_max_hold:
        outcome = "BE"
    else:
        # Forward data ran out before resolution — genuinely unknowable
        return OutcomeLabel(
            candidate_id=candidate_id,
            direction=direction,
            dynamic_stop_used=dynamic_stop_points,
            stop_logic=stop_logic,
            outcome=None,
            r_to_2_5r=hit_2_5r,
            r_to_3r=hit_3r,
            r_to_4r=hit_4r,
            max_r_achieved=max_r_achieved,
            time_to_2_5r_seconds=time_to_2_5_seconds,
            time_to_3r_seconds=time_to_3_seconds,
            time_to_4r_seconds=time_to_4_seconds,
            mfe_pct=max_r_achieved,
            mae_pct=min_r_achieved,
            time_to_max_fe_seconds=time_to_max_fe_seconds,
            time_to_max_ae_seconds=time_to_max_ae_seconds,
            event_confounded=event_confounded,
        )

    hit_max_hold = outcome == "BE"

    return OutcomeLabel(
        candidate_id=candidate_id,
        direction=direction,
        dynamic_stop_used=dynamic_stop_points,
        stop_logic=stop_logic,
        outcome=outcome,
        r_multiple=final_r,
        max_r_achieved=max_r_achieved,
        r_to_2_5r=hit_2_5r,
        r_to_3r=hit_3r,
        r_to_4r=hit_4r,
        time_to_2_5r_seconds=time_to_2_5_seconds,
        time_to_3r_seconds=time_to_3_seconds,
        time_to_4r_seconds=time_to_4_seconds,
        mfe_pct=max_r_achieved,
        mae_pct=min_r_achieved,
        time_to_max_fe_seconds=time_to_max_fe_seconds,
        time_to_max_ae_seconds=time_to_max_ae_seconds,
        hit_max_hold=hit_max_hold,
        event_confounded=event_confounded,
    )
