"""EMA computation per-frame (no full_df leaks).

Per Agent 35 §3 critical mitigation: pandas DataFrame.ewm() with
adjust=True uses the entire series. Computing EMAs on full_df and slicing
is a silent look-ahead leak. We MUST recompute per frame_df.

This module exposes the EMA helpers the production stack uses:
    - 72/89 (blue micro)
    - 216/267 (yellow short-structural)
    - 720/890 (white macro)

EMA periods are LOCKED constants per STRATEGY-SPEC.md §2. Do not adjust.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .timeframe import assert_no_future


# Locked EMA pairs per STRATEGY-SPEC.md §2. Production canonical = 72/89.
EMA_BLUE = (72, 89)
EMA_YELLOW = (216, 267)
EMA_WHITE = (720, 890)

# Warmup budget: longest EMA × 4 = 890 × 4 = 3560 bars
# (Per Agent 35 §2 — refusing to render a frame that fails this is cleaner
# than rendering a misleading frame.)
WARMUP_BARS = 3560


@dataclass(frozen=True)
class CloudSnapshot:
    """EMA values at a single bar, locked-period across the three layers."""
    ema_72: float
    ema_89: float
    ema_216: float
    ema_267: float
    ema_720: float
    ema_890: float


def compute_emas(frame_df: pd.DataFrame, t_now: pd.Timestamp, price_col: str = "close") -> pd.DataFrame:
    """Compute all six EMAs on a frame_df. Returns the frame with EMA columns added.

    Inputs:
        frame_df: must NOT contain rows at or after t_now (asserted)
        t_now: simulated "now" — for assertion only
        price_col: which OHLC column to compute EMAs against (default: close)

    Returns:
        Copy of frame_df with columns ['ema_72', 'ema_89', 'ema_216', 'ema_267',
        'ema_720', 'ema_890'] appended.

    Raises:
        LookAheadViolation: if frame_df has any row >= t_now
        ValueError: if frame_df has fewer than WARMUP_BARS rows (EMAs not converged)
    """
    assert_no_future(frame_df, t_now)

    if len(frame_df) < WARMUP_BARS:
        raise ValueError(
            f"frame_df has {len(frame_df)} bars; need >= {WARMUP_BARS} for EMA-890 convergence"
        )

    out = frame_df.copy()
    for period in (72, 89, 216, 267, 720, 890):
        out[f"ema_{period}"] = out[price_col].ewm(span=period, adjust=False).mean()

    return out


def latest_snapshot(emas_df: pd.DataFrame) -> CloudSnapshot:
    """Extract the right-edge bar's EMA values. Use this on the rendered frame's
    last visible bar to build the structural feature vector for Agent 19."""
    last = emas_df.iloc[-1]
    return CloudSnapshot(
        ema_72=float(last["ema_72"]),
        ema_89=float(last["ema_89"]),
        ema_216=float(last["ema_216"]),
        ema_267=float(last["ema_267"]),
        ema_720=float(last["ema_720"]),
        ema_890=float(last["ema_890"]),
    )


def cloud_widths(snapshot: CloudSnapshot) -> dict[str, float]:
    """Per-cloud width (NQ points). Used by 6-factor scorer's compression metric."""
    return {
        "blue": abs(snapshot.ema_72 - snapshot.ema_89),
        "yellow": abs(snapshot.ema_216 - snapshot.ema_267),
        "white": abs(snapshot.ema_720 - snapshot.ema_890),
    }
