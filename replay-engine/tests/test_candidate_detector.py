"""Tests for Stage 1 candidate detector.

Uses synthetic OHLC data — no Databento dependency. Verifies the detection
rules behave correctly without requiring the live data pipeline.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from replay_engine.stage1.candidate_detector import (
    CANDIDATE_TYPES,
    STRATA,
    RawCandidate,
    add_random_samples,
    assign_stratum,
    compute_atr,
    detect_candidates_at,
    is_failed_bounce_candidate,
    is_macro_break_retest_candidate,
    is_pullback_candidate,
    is_regime_establishment_candidate,
)
from replay_engine.shared.indicators import WARMUP_BARS


# ── Synthetic data builders ─────────────────────────────────────────────────

def make_synthetic_ohlc(n_bars: int = WARMUP_BARS + 100, seed: int = 1337) -> pd.DataFrame:
    """Generate synthetic 1-min OHLC data with a UTC timestamp index.

    Random walk with controlled volatility — sufficient for warmup convergence
    and detection-rule testing.
    """
    rng = np.random.default_rng(seed)
    ts_start = pd.Timestamp("2024-01-02 14:30:00", tz="UTC")  # 9:30 ET
    ts = pd.date_range(ts_start, periods=n_bars, freq="1min")

    # Random walk with drift
    drift = 0.05
    vol = 1.0
    increments = rng.normal(drift, vol, size=n_bars)
    closes = 100.0 + np.cumsum(increments)

    # Spread bars around close
    high = closes + np.abs(rng.normal(0, 0.5, n_bars))
    low = closes - np.abs(rng.normal(0, 0.5, n_bars))
    open_ = np.concatenate([[closes[0]], closes[:-1]])
    volume = rng.integers(100, 1000, n_bars).astype(float)

    return pd.DataFrame({
        "ts_utc": ts,
        "open": open_,
        "high": high,
        "low": low,
        "close": closes,
        "volume": volume,
    })


def make_emas_frame_with_close(close: float, ema_72: float, ema_89: float,
                                ema_216: float, ema_267: float,
                                ema_720: float, ema_890: float, n: int = 20):
    """Build a minimal emas-style DataFrame for rule testing."""
    return pd.DataFrame({
        "ts_utc": pd.date_range("2024-01-02 14:30:00", periods=n, freq="1min", tz="UTC"),
        "close": np.linspace(close - 1, close, n),
        "ema_72": np.full(n, ema_72),
        "ema_89": np.full(n, ema_89),
        "ema_216": np.full(n, ema_216),
        "ema_267": np.full(n, ema_267),
        "ema_720": np.linspace(ema_720 - 0.5, ema_720, n),  # slight slope
        "ema_890": np.full(n, ema_890),
    })


# ── Constants ───────────────────────────────────────────────────────────────

def test_candidate_types_complete():
    assert set(CANDIDATE_TYPES) == {
        "pullback", "regime_establishment", "macro_break_retest", "failed_bounce", "random",
    }


def test_strata_complete():
    assert set(STRATA) == {
        "trending", "chop", "opening_drive", "midday", "power_hour", "overnight", "post_fomc",
    }


# ── ATR ─────────────────────────────────────────────────────────────────────

def test_atr_returns_none_below_period():
    df = pd.DataFrame({"high": [1, 2], "low": [0, 1], "close": [1, 1.5]})
    assert compute_atr(df, period=14) is None


def test_atr_computes_when_sufficient_data():
    df = pd.DataFrame({
        "high": np.full(20, 102.0),
        "low":  np.full(20, 100.0),
        "close": np.full(20, 101.0),
    })
    atr = compute_atr(df, period=14)
    assert atr is not None and 1.0 <= atr <= 2.5


# ── Stratum assignment ──────────────────────────────────────────────────────

def _et_to_utc(month: int, day: int, hour: int, minute: int) -> pd.Timestamp:
    """Convert ET wall-clock to UTC tz-aware timestamp (handles DST)."""
    return (
        pd.Timestamp(f"2024-{month:02d}-{day:02d} {hour:02d}:{minute:02d}", tz="America/New_York")
        .tz_convert("UTC")
    )


def test_post_fomc_stratum_takes_priority():
    fomc = _et_to_utc(1, 31, 14, 0)  # 14:00 ET
    candidate = fomc + pd.Timedelta(hours=12)  # 12h after
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    s = assign_stratum(candidate, emas, atr_value=1.0, fomc_dates_utc={fomc})
    assert s == "post_fomc"


def test_opening_drive_session():
    ts = _et_to_utc(1, 2, 9, 45)
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    assert assign_stratum(ts, emas, atr_value=1.0) == "opening_drive"


def test_midday_session():
    ts = _et_to_utc(1, 2, 12, 0)
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    assert assign_stratum(ts, emas, atr_value=1.0) == "midday"


def test_power_hour():
    ts = _et_to_utc(1, 2, 15, 30)
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    assert assign_stratum(ts, emas, atr_value=1.0) == "power_hour"


def test_overnight_session():
    ts = _et_to_utc(1, 2, 22, 0)
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    assert assign_stratum(ts, emas, atr_value=1.0) == "overnight"


def test_trending_when_macro_slope_strong():
    ts = _et_to_utc(1, 2, 10, 45)  # 10:45 ET = mid-morning between sessions
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    # macro_slope = ema_720[-1] - ema_720[-11] = 0.5 (per make_emas_frame)
    # > atr_value (0.1) * 0.5 = 0.05 -> trending
    s = assign_stratum(ts, emas, atr_value=0.1)
    assert s == "trending"


def test_chop_when_macro_slope_flat():
    ts = _et_to_utc(1, 2, 10, 45)
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99)
    # high atr forces slope < threshold
    s = assign_stratum(ts, emas, atr_value=10.0)
    assert s == "chop"


# ── Pullback detection ──────────────────────────────────────────────────────

def test_pullback_fires_when_close_near_cloud_with_trend():
    # Close very near blue cloud mid, macro has slope
    emas = make_emas_frame_with_close(
        close=99.5, ema_72=100, ema_89=99,
        ema_216=110, ema_267=109, ema_720=99, ema_890=98,
    )
    assert is_pullback_candidate(emas, atr_value=1.0)


def test_pullback_does_not_fire_when_far_from_all_clouds():
    emas = make_emas_frame_with_close(
        close=200, ema_72=100, ema_89=99,
        ema_216=110, ema_267=109, ema_720=99, ema_890=98,
    )
    assert not is_pullback_candidate(emas, atr_value=1.0)


def test_pullback_short_data_returns_false():
    emas = make_emas_frame_with_close(100, 100, 99, 100, 99, 100, 99, n=5)
    assert not is_pullback_candidate(emas, atr_value=1.0)


# ── Regime establishment ────────────────────────────────────────────────────

def test_regime_fires_when_clouds_align_after_divergence():
    # Build emas where macro and yellow ended same-sign with slope
    n = 20
    emas = pd.DataFrame({
        "close": np.full(n, 100.0),
        "ema_72": np.full(n, 100.0),
        "ema_89": np.full(n, 99.0),
        "ema_216": np.linspace(99.0, 100.0, n),  # rising
        "ema_267": np.linspace(98.5, 99.5, n),
        "ema_720": np.linspace(98.0, 100.0, n),  # rising
        "ema_890": np.linspace(97.5, 99.0, n),
    })
    assert is_regime_establishment_candidate(emas)


# ── Macro break + retest ───────────────────────────────────────────────────

def test_macro_break_retest_fires_on_sign_flip():
    n = 15
    closes = np.array([105, 105, 105, 105, 105, 105, 105, 95, 95, 95, 95, 95, 95, 95, 95])
    emas = pd.DataFrame({
        "close": closes,
        "ema_72": np.full(n, 100.0),
        "ema_89": np.full(n, 99.0),
        "ema_216": np.full(n, 100.0),
        "ema_267": np.full(n, 99.0),
        "ema_720": np.full(n, 100.0),
        "ema_890": np.full(n, 99.0),
    })
    assert is_macro_break_retest_candidate(emas)


def test_macro_break_retest_does_not_fire_when_stable():
    n = 15
    emas = pd.DataFrame({
        "close": np.full(n, 105.0),
        "ema_72": np.full(n, 100.0),
        "ema_89": np.full(n, 99.0),
        "ema_216": np.full(n, 100.0),
        "ema_267": np.full(n, 99.0),
        "ema_720": np.full(n, 100.0),
        "ema_890": np.full(n, 99.0),
    })
    assert not is_macro_break_retest_candidate(emas)


# ── Failed bounce ──────────────────────────────────────────────────────────

def test_failed_bounce_fires_on_bear_signature():
    # 6 bars (function requires len>=6); price was above blue, came back below
    n = 6
    emas = pd.DataFrame({
        "close": np.array([110.0, 105.0, 102, 101, 100, 99]),  # was above, now below blue (mid 99.5)
        "ema_72": np.full(n, 100.0),
        "ema_89": np.full(n, 99.0),
        "ema_216": np.full(n, 100.0),
        "ema_267": np.full(n, 99.0),
        "ema_720": np.full(n, 100.0),
        "ema_890": np.full(n, 99.0),
    })
    assert is_failed_bounce_candidate(emas)


def test_failed_bounce_does_not_fire_short_data():
    # 5 bars (function requires len>=6) -> returns False
    n = 5
    emas = pd.DataFrame({
        "close": np.array([105.0, 102, 101, 100, 99]),
        "ema_72": np.full(n, 100.0),
        "ema_89": np.full(n, 99.0),
        "ema_216": np.full(n, 100.0),
        "ema_267": np.full(n, 99.0),
        "ema_720": np.full(n, 100.0),
        "ema_890": np.full(n, 99.0),
    })
    assert not is_failed_bounce_candidate(emas)


# ── End-to-end detector ─────────────────────────────────────────────────────

def test_detect_candidates_at_warmup_underflow_returns_empty():
    df = make_synthetic_ohlc(n_bars=100)
    t_now = df["ts_utc"].iloc[-1] + pd.Timedelta(minutes=1)
    candidates = detect_candidates_at(df, t_now)
    assert candidates == []


def test_detect_candidates_at_with_warmup_data():
    df = make_synthetic_ohlc(n_bars=WARMUP_BARS + 50)
    t_now = df["ts_utc"].iloc[-1] + pd.Timedelta(minutes=1)
    candidates = detect_candidates_at(df, t_now)
    # Random walk may or may not fire candidates — assert structure not count
    for c in candidates:
        assert isinstance(c, RawCandidate)
        assert c.candidate_type in CANDIDATE_TYPES
        assert c.stratum in STRATA
        assert c.atr_at_candidate > 0


def test_random_samples_emit_at_intervals():
    df = make_synthetic_ohlc(n_bars=WARMUP_BARS + 500)
    samples = list(add_random_samples(df, every_n_bars=100))
    # Expect 5 samples at indices WARMUP_BARS, WARMUP_BARS+100, ..., +400
    assert len(samples) >= 4
    for s in samples:
        assert s.candidate_type == "random"


def test_random_samples_short_data_returns_empty():
    df = make_synthetic_ohlc(n_bars=100)
    samples = list(add_random_samples(df, every_n_bars=100))
    assert samples == []
