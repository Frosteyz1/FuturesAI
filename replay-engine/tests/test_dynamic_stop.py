"""Tests for Stage 3 dynamic stop computation per spec §6.2."""

from __future__ import annotations

import numpy as np
import pytest

from replay_engine.stage3.dynamic_stop import (
    STOP_CEILING_POINTS,
    STOP_DEFAULT_POINTS,
    STOP_FLOOR_POINTS,
    compute_dynamic_stop,
    deepest_cloud_edge,
    find_recent_swing_high,
    find_recent_swing_low,
)


# ── Spec invariants ─────────────────────────────────────────────────────────

def test_stop_constants():
    assert STOP_FLOOR_POINTS == 8.0
    assert STOP_CEILING_POINTS == 18.0
    assert STOP_DEFAULT_POINTS == 12.0


# ── find_recent_swing_low ───────────────────────────────────────────────────

def test_swing_low_finds_clear_pivot():
    # Bar 4 has low=95, bars 2,3,5,6 have higher lows
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  95,  97,  98,  99])
    swing = find_recent_swing_low(highs, lows)
    assert swing == 95.0


def test_swing_low_returns_none_when_no_pivot():
    # Monotonic decreasing — no pivot
    highs = np.array([105.0] * 10)
    lows  = np.linspace(100, 91, 10)
    assert find_recent_swing_low(highs, lows) is None


def test_swing_low_short_data_returns_none():
    highs = np.array([100, 101, 99])
    lows = np.array([99, 100, 98])
    assert find_recent_swing_low(highs, lows) is None


def test_swing_low_picks_most_recent():
    # Two pivots; should pick the most recent
    highs = np.array([105, 104, 103, 102, 100, 102, 105, 104, 103, 102, 100, 102, 105])
    lows  = np.array([100, 99,  98,  97,  95,  97,  100, 99,  98,  97,  93,  97,  100])
    swing = find_recent_swing_low(highs, lows)
    assert swing == 93.0


# ── find_recent_swing_high ──────────────────────────────────────────────────

def test_swing_high_finds_clear_pivot():
    highs = np.array([100, 101, 102, 103, 105, 103, 102, 101])
    swing = find_recent_swing_high(highs)
    assert swing == 105.0


def test_swing_high_returns_none_when_no_pivot():
    # Monotonic — no pivot
    highs = np.linspace(100, 110, 10)
    assert find_recent_swing_high(highs) is None


# ── deepest_cloud_edge ──────────────────────────────────────────────────────

def test_cloud_edge_long_uses_lower_ema():
    edge = deepest_cloud_edge(
        direction="long", entry_price=100,
        ema_72=99, ema_89=98, ema_216=95, ema_267=94, ema_720=90, ema_890=89,
        rejecting_layer="white",
    )
    assert edge == 89.0  # lower of 720/890


def test_cloud_edge_short_uses_upper_ema():
    edge = deepest_cloud_edge(
        direction="short", entry_price=80,
        ema_72=82, ema_89=83, ema_216=85, ema_267=86, ema_720=90, ema_890=91,
        rejecting_layer="white",
    )
    assert edge == 91.0  # upper of 720/890


def test_cloud_edge_returns_none_without_rejecting_layer():
    edge = deepest_cloud_edge(
        direction="long", entry_price=100,
        ema_72=99, ema_89=98, ema_216=95, ema_267=94, ema_720=90, ema_890=89,
        rejecting_layer=None,
    )
    assert edge is None


# ── compute_dynamic_stop ────────────────────────────────────────────────────

def _emas(blue=99, blue_far=98, yellow=95, yellow_far=94, white=90, white_far=89):
    return {
        "ema_72": blue, "ema_89": blue_far,
        "ema_216": yellow, "ema_267": yellow_far,
        "ema_720": white, "ema_890": white_far,
    }


def test_long_picks_swing_low_when_more_conservative():
    # Entry 100, swing low at 88 (12pt below) — wider than blue cloud distance
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  88,  97,  98,  99])
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(),
        rejecting_layer="blue",  # blue far edge=98, distance=2pt — well below floor
    )
    assert stop.logic == "swing_low"
    assert stop.distance_points == 12.0  # exact swing distance, within 8-18 range
    assert stop.stop_price == 88.0


def test_long_picks_cloud_when_more_conservative():
    # Tight swing low (3pt) but wider cloud edge (15pt)
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  97,  97,  98,  99])
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(white=85, white_far=85),
        rejecting_layer="white",  # white edge=85, distance=15pt
    )
    assert stop.logic == "deepest_cloud"
    assert stop.distance_points == 15.0


def test_floor_clamp_at_8pt():
    # Both swing and cloud are tight (3pt) — clamps to 8
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  97,  97,  98,  99])
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(white=98, white_far=98),
        rejecting_layer="white",
    )
    assert stop.distance_points == 8.0


def test_ceiling_clamp_at_18pt():
    # Swing low 25pt away — clamps to 18
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  75,  97,  98,  99])
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(),
        rejecting_layer=None,
    )
    assert stop.distance_points == 18.0
    assert stop.logic == "swing_low"  # logic identifier still records the source


def test_default_12pt_when_no_structural_signal():
    # No swing pivot found, no cloud reference
    highs = np.linspace(105, 110, 8)
    lows  = np.linspace(100, 105, 8)
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(),
        rejecting_layer=None,
    )
    assert stop.logic == "default_12pt"
    assert stop.distance_points == 12.0


def test_short_inverse():
    # Entry 100, swing high 113 (13pt above — within 8-18 range)
    highs = np.array([95, 96, 97, 98, 100, 113, 100, 98, 97])
    stop = compute_dynamic_stop(
        direction="short", entry_price=100,
        recent_highs=highs, recent_lows=highs - 1,  # synthetic
        ema_values=_emas(blue=101, blue_far=102, yellow=105, yellow_far=106, white=110, white_far=111),
        rejecting_layer="blue",
    )
    assert stop.logic == "swing_high"
    assert stop.distance_points == 13.0
    assert stop.stop_price == 113.0


def test_cloud_on_wrong_side_ignored():
    # Long entry 100, but white cloud is ABOVE entry — invalid stop reference
    # Should fall back to swing low or default
    highs = np.array([105, 104, 103, 102, 100, 102, 103, 104])
    lows  = np.array([100, 99,  98,  97,  90,  97,  98,  99])
    stop = compute_dynamic_stop(
        direction="long", entry_price=100,
        recent_highs=highs, recent_lows=lows,
        ema_values=_emas(white=120, white_far=119),
        rejecting_layer="white",
    )
    # Swing low at 90, distance 10 — falls within 8-18, used
    assert stop.logic == "swing_low"
    assert stop.distance_points == 10.0
