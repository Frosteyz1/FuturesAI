"""Dynamic stop computation per pipeline spec §6.2.

Per the 2026-05-03 outcome correction:
    - Stop is dynamic per setup (NOT fixed 12pt)
    - Long: below most recent swing low OR below deepest rejected cloud
            (whichever is more conservative — further from entry)
    - Short: inverse (above most recent swing high OR above deepest cloud)
    - Floor 8pt (anything tighter is noise)
    - Ceiling 18pt (anything wider violates $600 risk × 3 contracts)
    - Default fallback when no clean structural level: 12pt
    - Stop logic recorded for audit: 'swing_low' / 'swing_high' /
      'deepest_cloud' / 'default_12pt'

This module is pure: takes OHLC + cloud levels, returns stop + label.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd


# Constraints per spec §6.2
STOP_FLOOR_POINTS = 8.0
STOP_CEILING_POINTS = 18.0
STOP_DEFAULT_POINTS = 12.0
SWING_LOOKBACK_BARS = 20  # how far back to scan for the most recent swing pivot

Direction = Literal["long", "short"]
StopLogic = Literal["swing_low", "swing_high", "deepest_cloud", "default_12pt"]


@dataclass(frozen=True)
class DynamicStop:
    """Result of stop computation."""
    distance_points: float
    stop_price: float
    logic: StopLogic
    raw_swing_distance: float | None
    raw_cloud_distance: float | None


def find_recent_swing_low(highs: np.ndarray, lows: np.ndarray, lookback: int = SWING_LOOKBACK_BARS) -> float | None:
    """Find the most recent swing low — a bar whose low is the lowest in a
    window of ±2 bars around it.

    Returns the price of the swing low, or None if no clean pivot found in lookback.
    """
    if len(lows) < 5:
        return None

    # Look at last `lookback` bars; need 2 bars on each side for pivot test
    start = max(2, len(lows) - lookback)
    pivots: list[float] = []
    for i in range(start, len(lows) - 2):
        if lows[i] < lows[i - 1] and lows[i] < lows[i - 2] and lows[i] < lows[i + 1] and lows[i] < lows[i + 2]:
            pivots.append(float(lows[i]))

    return pivots[-1] if pivots else None


def find_recent_swing_high(highs: np.ndarray, lookback: int = SWING_LOOKBACK_BARS) -> float | None:
    """Mirror of find_recent_swing_low — most recent high pivot in window."""
    if len(highs) < 5:
        return None
    start = max(2, len(highs) - lookback)
    pivots: list[float] = []
    for i in range(start, len(highs) - 2):
        if highs[i] > highs[i - 1] and highs[i] > highs[i - 2] and highs[i] > highs[i + 1] and highs[i] > highs[i + 2]:
            pivots.append(float(highs[i]))
    return pivots[-1] if pivots else None


def deepest_cloud_edge(
    direction: Direction,
    entry_price: float,
    ema_72: float, ema_89: float,
    ema_216: float, ema_267: float,
    ema_720: float, ema_890: float,
    rejecting_layer: Literal["blue", "yellow", "white"] | None,
) -> float | None:
    """Return the far edge of the deepest cloud being rejected at, in
    the direction of the stop.

    For a long rejecting at a cloud, the relevant stop reference is the
    far (lower) edge of that cloud — below the slower EMA.

    If `rejecting_layer` is None we don't know which cloud is being tested,
    fall back to None.
    """
    if rejecting_layer is None:
        return None

    pairs = {
        "blue": (ema_72, ema_89),
        "yellow": (ema_216, ema_267),
        "white": (ema_720, ema_890),
    }
    fast, slow = pairs[rejecting_layer]

    # Far edge for a long is the LOWER of the two EMAs (price stops out below)
    # Far edge for a short is the HIGHER of the two EMAs
    if direction == "long":
        return min(fast, slow)
    return max(fast, slow)


def compute_dynamic_stop(
    direction: Direction,
    entry_price: float,
    recent_highs: np.ndarray,
    recent_lows: np.ndarray,
    ema_values: dict[str, float],
    rejecting_layer: Literal["blue", "yellow", "white"] | None,
) -> DynamicStop:
    """Compute the dynamic stop per spec §6.2.

    1. Compute structural reference (swing low/high)
    2. Compute cloud reference (deepest cloud edge in stop direction)
    3. Pick the more conservative (further from entry) of the two
    4. Apply 8pt floor / 18pt ceiling clamp
    5. Default 12pt fallback when neither structural reference is available
    """
    # 1. Structural reference
    if direction == "long":
        swing_price = find_recent_swing_low(recent_highs, recent_lows)
        # distance from entry to swing low
        swing_distance = (entry_price - swing_price) if swing_price is not None else None
    else:
        swing_price = find_recent_swing_high(recent_highs)
        swing_distance = (swing_price - entry_price) if swing_price is not None else None

    # 2. Cloud reference
    cloud_edge = deepest_cloud_edge(
        direction=direction,
        entry_price=entry_price,
        ema_72=ema_values["ema_72"], ema_89=ema_values["ema_89"],
        ema_216=ema_values["ema_216"], ema_267=ema_values["ema_267"],
        ema_720=ema_values["ema_720"], ema_890=ema_values["ema_890"],
        rejecting_layer=rejecting_layer,
    )
    if cloud_edge is not None:
        cloud_distance = (entry_price - cloud_edge) if direction == "long" else (cloud_edge - entry_price)
        # Negative means cloud is on wrong side — invalid; ignore
        if cloud_distance <= 0:
            cloud_distance = None
    else:
        cloud_distance = None

    # 3. Pick more conservative — bigger distance = further from entry
    candidates: list[tuple[float, StopLogic]] = []
    if swing_distance is not None and swing_distance > 0:
        candidates.append((swing_distance, "swing_low" if direction == "long" else "swing_high"))
    if cloud_distance is not None:
        candidates.append((cloud_distance, "deepest_cloud"))

    if not candidates:
        # No clean structural level — fallback
        distance = STOP_DEFAULT_POINTS
        logic: StopLogic = "default_12pt"
    else:
        distance, logic = max(candidates, key=lambda c: c[0])

    # 4. Apply floor/ceiling clamp
    distance = max(STOP_FLOOR_POINTS, min(STOP_CEILING_POINTS, distance))

    # 5. Compute the actual stop price
    stop_price = (entry_price - distance) if direction == "long" else (entry_price + distance)

    return DynamicStop(
        distance_points=distance,
        stop_price=stop_price,
        logic=logic,
        raw_swing_distance=swing_distance,
        raw_cloud_distance=cloud_distance,
    )
