"""Single source of clock truth.

Per Agent 35 §2 + pipeline spec §3.3: every dataframe filter, every EMA window,
every screenshot crop, every news-event lookup, and every Databento query
derives its time bound from `T_now` and passes through the helpers in this
module. No bare `df['ts'] <= some_var` calls scattered across modules.

This is the architectural defense against look-ahead leakage.
"""

from __future__ import annotations

import pandas as pd


class LookAheadViolation(Exception):
    """Raised when an assertion finds a row at or after T_now in a frame_df.

    This exception is fatal — never catch it broadly. If you see this, fix
    the call site that materialized the frame_df, do not silently filter.
    """


def materialize_frame(full_df: pd.DataFrame, t_now: pd.Timestamp, ts_col: str = "ts_utc") -> pd.DataFrame:
    """Materialize an immutable historical-only slice up to (but not including) t_now.

    The returned frame is the ONLY data downstream code should see for this
    decision moment. Never expose `full_df` or its filtered descendants past
    this boundary.

    Args:
        full_df: full historical dataset (1-min OHLC, 1-second ticks, etc.)
        t_now: simulated "now" timestamp; bars at this time or later are excluded
        ts_col: name of the timestamp column

    Returns:
        Copy of full_df with only rows where ts < t_now. Caller owns the copy
        and may mutate it; mutations do not leak back to full_df.

    Raises:
        ValueError: if t_now is naive (no timezone) — every internal timestamp
                    must be tz-aware UTC per Agent 35 §3 datetime tz hell.
    """
    if t_now.tz is None:
        raise ValueError(f"t_now must be tz-aware UTC, got naive: {t_now}")

    frame = full_df[full_df[ts_col] < t_now].copy()
    return frame


def assert_no_future(df: pd.DataFrame, t_now: pd.Timestamp, ts_col: str = "ts_utc") -> None:
    """Runtime invariant: this dataframe contains no future data.

    Call this at the entry of any function that consumes a frame_df. Cheap
    enough to run unconditionally in production replay; do not gate behind
    a debug flag — the cost of a silent leak is much higher than the cost
    of an O(1) max-comparison.

    Raises:
        LookAheadViolation: if any row's ts >= t_now
        ValueError: if t_now is naive
    """
    if t_now.tz is None:
        raise ValueError(f"t_now must be tz-aware UTC, got naive: {t_now}")

    if len(df) == 0:
        return

    max_ts = df[ts_col].max()
    if max_ts >= t_now:
        raise LookAheadViolation(
            f"frame_df contains future data: max(ts)={max_ts}, t_now={t_now}, "
            f"diff={max_ts - t_now}"
        )


def to_utc(ts: pd.Timestamp | str, source_tz: str | None = None) -> pd.Timestamp:
    """Boundary helper: convert any timestamp to tz-aware UTC.

    Use at every ingress (Databento → UTC, NinjaTrader CSV local-tz → UTC,
    news calendar Eastern → UTC). Never let a naive timestamp persist past
    this boundary.
    """
    if isinstance(ts, str):
        ts = pd.Timestamp(ts)

    if ts.tz is None:
        if source_tz is None:
            raise ValueError(f"Naive timestamp requires source_tz: {ts}")
        ts = ts.tz_localize(source_tz)

    return ts.tz_convert("UTC")
