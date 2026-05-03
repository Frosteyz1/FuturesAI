"""Tests for Stage 3 outcome labeler — walk-forward simulation with R-buckets."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from replay_engine.stage3.outcome_labeler import (
    MAX_HOLD_BARS_DEFAULT,
    R_BUCKET_2_5,
    R_BUCKET_3,
    R_BUCKET_4,
    label_outcome,
)


# ── Synthetic forward data builder ──────────────────────────────────────────

def make_forward_ohlcv_1s(price_path: list[float], start_ts: str = "2024-01-02 14:30:00") -> pd.DataFrame:
    """Build a DataFrame of 1-second OHLCV bars from a price path.

    For simplicity each bar's high=low=close=open=price (no intra-second wick).
    Use add_bar_high/low_kwargs to inject explicit wicks where needed.
    """
    n = len(price_path)
    ts = pd.date_range(pd.Timestamp(start_ts, tz="UTC"), periods=n, freq="1s")
    return pd.DataFrame({
        "ts_utc": ts,
        "open": price_path,
        "high": price_path,
        "low": price_path,
        "close": price_path,
        "volume": [1.0] * n,
    })


def make_forward_with_wicks(rows: list[tuple[float, float, float]], start_ts: str = "2024-01-02 14:30:00") -> pd.DataFrame:
    """Build OHLCV-1s from list of (open, high, low) tuples; close=open."""
    n = len(rows)
    ts = pd.date_range(pd.Timestamp(start_ts, tz="UTC"), periods=n, freq="1s")
    return pd.DataFrame({
        "ts_utc": ts,
        "open":  [r[0] for r in rows],
        "high":  [r[1] for r in rows],
        "low":   [r[2] for r in rows],
        "close": [r[0] for r in rows],
        "volume": [1.0] * n,
    })


# ── Spec invariants ─────────────────────────────────────────────────────────

def test_r_bucket_constants():
    assert R_BUCKET_2_5 == 2.5
    assert R_BUCKET_3 == 3.0
    assert R_BUCKET_4 == 4.0


# ── Stop-hit before any target → L ──────────────────────────────────────────

def test_long_stop_hit_returns_loss():
    # Entry 100, stop at 88 (12pt). Price drops to 87 immediately.
    forward = make_forward_with_wicks([(99, 99, 87)] + [(95, 95, 95)] * 5)
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "L"
    assert label.r_multiple == -1.0
    assert not label.r_to_2_5r
    assert not label.r_to_3r
    assert label.hit_max_hold is False


# ── Target hit before stop → W ──────────────────────────────────────────────

def test_long_2_5r_hit_returns_win():
    # Entry 100, stop 88, 2.5R target = 130. Price runs to 132 by bar 3.
    forward = make_forward_ohlcv_1s([100, 110, 120, 130, 132, 131, 130])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "W"
    assert label.r_to_2_5r is True
    assert label.r_to_3r is False  # 3R = 136, not hit
    assert label.r_to_4r is False
    assert label.time_to_2_5r_seconds == 3
    assert label.max_r_achieved == pytest.approx(2.6666, rel=1e-3)


def test_long_3r_runner():
    # Price runs to 140 (3.33R)
    forward = make_forward_ohlcv_1s([100, 110, 120, 130, 140, 138])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "W"
    assert label.r_to_2_5r and label.r_to_3r
    assert label.r_to_4r is False  # 4R = 148, not hit


def test_long_4r_full_runner():
    forward = make_forward_ohlcv_1s([100, 110, 130, 150, 145])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "W"
    assert label.r_to_2_5r and label.r_to_3r and label.r_to_4r


# ── Time-stop with no resolution → BE ───────────────────────────────────────

def test_long_time_stop_be_when_neither_hit():
    # Price drifts but never hits stop or 2.5R within 60s
    n = 70
    forward = make_forward_ohlcv_1s([100 + i * 0.1 for i in range(n)])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "BE"
    assert label.hit_max_hold is True
    assert not label.r_to_2_5r


# ── Short direction inverse ─────────────────────────────────────────────────

def test_short_2_5r_hit():
    # Entry 100, stop 112 (12pt above), 2.5R target = 70
    forward = make_forward_ohlcv_1s([100, 90, 80, 70, 65])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="short",
        dynamic_stop_points=12.0, stop_logic="swing_high",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "W"
    assert label.r_to_2_5r


def test_short_stop_hit():
    forward = make_forward_with_wicks([(101, 113, 100)])  # high=113 hits stop=112
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="short",
        dynamic_stop_points=12.0, stop_logic="swing_high",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "L"


# ── Empty forward data → null outcome ───────────────────────────────────────

def test_empty_forward_returns_null():
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=pd.DataFrame(columns=["ts_utc", "open", "high", "low", "close", "volume"]),
        max_hold_seconds=60,
    )
    assert label.outcome is None


# ── Insufficient forward data → null outcome ───────────────────────────────

def test_insufficient_forward_data_null_outcome():
    # 30 seconds available but max_hold is 60 — ran out before resolution
    forward = make_forward_ohlcv_1s([100 + i * 0.05 for i in range(30)])  # tiny drift, no resolution
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome is None
    assert label.hit_max_hold is False


# ── MFE / MAE tracking ─────────────────────────────────────────────────────

def test_mfe_mae_recorded():
    # Path: peak +12 (1R MFE), trough -6 (-0.5R MAE), then drift near entry
    # for enough bars to reach max_hold without resolution
    excursion_bars = [
        (100, 112, 99),    # 1R favorable
        (110, 110, 94),    # -0.5R adverse
    ]
    drift_bars = [(100, 102, 99) for _ in range(70)]  # extends past max_hold=60s
    forward = make_forward_with_wicks(excursion_bars + drift_bars)
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
    )
    assert label.outcome == "BE"
    assert label.mfe_pct == pytest.approx(1.0, rel=1e-3)
    assert label.mae_pct == pytest.approx(-0.5, rel=1e-3)


# ── Validation ──────────────────────────────────────────────────────────────

def test_zero_stop_raises():
    forward = make_forward_ohlcv_1s([100, 100])
    with pytest.raises(ValueError, match="dynamic_stop_points must be > 0"):
        label_outcome(
            candidate_id="c1", entry_price=100, direction="long",
            dynamic_stop_points=0, stop_logic="default_12pt",
            forward_ohlcv_1s=forward, max_hold_seconds=60,
        )


# ── Event-confounded flag passthrough ──────────────────────────────────────

def test_event_confounded_passthrough():
    forward = make_forward_ohlcv_1s([100, 110, 120, 130, 132])
    label = label_outcome(
        candidate_id="c1", entry_price=100, direction="long",
        dynamic_stop_points=12.0, stop_logic="swing_low",
        forward_ohlcv_1s=forward, max_hold_seconds=60,
        event_confounded=True,
    )
    assert label.event_confounded is True
