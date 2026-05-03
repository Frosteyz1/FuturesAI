"""Pydantic models matching architecture/03-mass-calibration-backtest-pipeline.md schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Stage 1 — Setup Candidate Detector ────────────────────────────────────────

CandidateType = Literal[
    "pullback",
    "regime_establishment",
    "macro_break_retest",
    "failed_bounce",
    "random",
]

Stratum = Literal[
    "trending",
    "chop",
    "opening_drive",
    "midday",
    "power_hour",
    "overnight",
    "post_fomc",
]


class Candidate(BaseModel):
    """One row of Stage 1 output."""
    candidate_id: str
    ts_utc: str  # ISO 8601 with tz
    candidate_type: CandidateType
    stratum: Stratum
    atr_at_candidate: float
    raw_features: dict[str, float] = Field(default_factory=dict)


# ── Stage 1.5 — Rule-Based Pre-Filter ────────────────────────────────────────

SelectionBucket = Literal["high_confidence", "borderline", "random"]


class FilteredCandidate(Candidate):
    """Candidate with 6-factor rule score and selection-bucket assignment."""
    rule_score: float
    selection_bucket: SelectionBucket
    factor_breakdown: dict[str, float] = Field(default_factory=dict)
    alignment_cap: int | None = None


# ── Stage 2 — Chart Image Generator ──────────────────────────────────────────

RendererProfile = Literal["ninjatrader_1min_dark", "tos_mobile_dark"]


class RenderedFrame(BaseModel):
    candidate_id: str
    frame_path: str  # local path or supabase storage ref
    renderer_profile: RendererProfile
    renderer_version: str
    renderer_golden_hash: str
    last_visible_bar_index: int
    atr_at_render: float


# ── Stage 3 — Forward Outcome Labeler ────────────────────────────────────────

Outcome = Literal["W", "L", "BE"]
Direction = Literal["long", "short"]
StopLogic = Literal["swing_low", "swing_high", "deepest_cloud", "default_12pt"]


class OutcomeLabel(BaseModel):
    """Stage 3 outcome label per pipeline spec §6.3 (post-2026-05-03 correction).

    Outcome is the primary binary label consumed by Stage 5 calibration:
        'W'  = r_to_2_5r == true (reached 2.5R discipline floor before stop)
        'L'  = stop hit before reaching 2.5R
        'BE' = neither stop nor 2.5R hit within max_hold (60 bars)
        None = outcome lag insufficient (within last 60 bars of dataset)

    Secondary labels (r_to_3r, r_to_4r, max_r_achieved) preserve scenario richness
    for the three-bucket calibration analysis in Stage 5.
    """
    candidate_id: str
    direction: Direction

    # Dynamic stop computed per §6.2 (NQ points)
    dynamic_stop_used: float
    stop_logic: StopLogic

    # Primary outcome (W/L/BE)
    outcome: Outcome | None = None
    r_multiple: float | None = None  # final R at exit
    max_r_achieved: float | None = None  # peak R at any point before exit

    # Three R-buckets — primary calibration targets
    r_to_2_5r: bool = False  # the W floor
    r_to_3r: bool = False    # typical target
    r_to_4r: bool = False    # runner

    # Time-to-bucket (seconds from entry to bucket-hit, null if not hit)
    time_to_2_5r_seconds: int | None = None
    time_to_3r_seconds: int | None = None
    time_to_4r_seconds: int | None = None

    # MFE/MAE (R-relative against dynamic_stop_used)
    mfe_pct: float | None = None
    mae_pct: float | None = None
    time_to_max_fe_seconds: int | None = None
    time_to_max_ae_seconds: int | None = None

    # Edge cases
    hit_max_hold: bool = False
    event_confounded: bool = False


# ── Stage 5 — Calibration Analysis (per Agent 35 §6) ────────────────────────

class ReplayConfig(BaseModel):
    databento_snapshot: str
    contract_symbol: str
    roll_method: str
    frame_count: int
    sampler: str
    sampler_seed: int
    renderer_profile: RendererProfile
    renderer_version: str
    renderer_golden_hash: str
    indicator_config_hash: str
    agent_prompt_hashes: dict[str, str]
    agent_model_versions: dict[str, str]
    warmup_bars: int


class ReplayAudit(BaseModel):
    look_ahead_findings: list[str] = Field(default_factory=list)
    tz_findings: list[str] = Field(default_factory=list)
    renderer_drift_findings: list[str] = Field(default_factory=list)


class CompositeScores(BaseModel):
    replay_health_score: float
    calibration_brier: float
    top_decile_win_rate: float
    verdict_distribution: dict[str, float]
    holdout_agreement_delta: float


class PerAgentCalibration(BaseModel):
    agent_id: str
    abstain_rate: float
    brier: float
    auc: float | None
    decile_curve: list[tuple[float, float]]
    weight_recommendation_delta: str  # e.g. "+0.5"


class PatternWinRate(BaseModel):
    n: int
    win_rate: float
    avg_r: float


class LargeTierGate(BaseModel):
    unlocked: bool
    reason: str
    expires_at: str | None = None  # ISO 8601, 7-day expiry per Agent 35 §6


class ReplayRunArtifacts(BaseModel):
    calibration_plot_png: str | None = None
    score_distribution_png: str | None = None
    per_pattern_table_csv: str | None = None
    frame_level_jsonl: str | None = None


class ReplayRun(BaseModel):
    """Top-level Stage 5 output, written to replay.runs Supabase table."""
    run_id: str
    started_at: str
    completed_at: str | None = None
    config: ReplayConfig
    audit: ReplayAudit
    composite: CompositeScores
    per_agent_calibration: list[PerAgentCalibration]
    per_pattern_winrate: dict[str, PatternWinRate]
    large_tier_gate: LargeTierGate
    artifacts: ReplayRunArtifacts
