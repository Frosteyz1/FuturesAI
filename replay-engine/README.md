# Replay Engine — Phase 1.5 Calibration Backtest

Python sidecar for the AI-Vision Trading Copilot's mass calibration backtest. Lives in this repo as a sibling directory to the Next.js production runtime, but ships independently to Modal.com.

## What this is

A 7-stage pipeline that produces a calibration report card the LARGE-tier sizing gate consumes:

1. Setup Candidate Detector (Databento → ~5,000 candidates)
2. Rule-Based Pre-Filter (port of NQ Trigger Tracker 6-factor scorer → 1,000 selected)
3. Chart Image Generator (TradingView Lightweight Charts via Playwright)
4. Forward Outcome Labeler (12pt stops, 1R/1.5R/2R/3R targets, MFE/MAE from Databento OHLCV-1s schema — second-level high/low, no full Trades data needed)
5. LLM Scoring (paced via Claude Code Max plan → 44-agent + Wave E)
6. Calibration Analysis (per-agent reliability, composite calibration plots, weights.json)
7. Walk-Forward Validation (70/30 split, holdout regression alarm)

Source of truth for design: `../trading-copilot-research/architecture/03-mass-calibration-backtest-pipeline.md`. Implementers do not invent stage shapes; they read the spec.

## Why a separate sidecar

- Production runtime is Next.js + Vercel + Supabase (TypeScript). User-facing PWA.
- Replay engine needs pandas/numpy/Playwright/Databento clients — Python ecosystem is the right tool.
- Replay engine runs offline (Modal scheduled jobs, on-demand triggers); never in the user's request path.
- Both connect to the same Supabase (Stage 6 writes corpus entries, Stage 5 writes `replay.runs`).

## Stack

- Python 3.11+
- pandas / numpy / pyarrow (parquet)
- databento (historical /NQ data)
- supabase-py (Supabase service-role client)
- playwright (headless Chromium for chart rendering)
- modal (deployment to Modal.com)
- pytest, ruff, pyright (test + lint + types)

## Local development

```bash
cd replay-engine
python -m venv .venv
.venv\Scripts\activate         # Windows
# .venv/bin/activate            # macOS/Linux
pip install -e ".[dev]"
playwright install chromium
```

Set environment variables in `replay-engine/.env` (gitignored):

```
DATABENTO_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...        # only needed for Stage 5 report-card generation
```

## Project structure

```
replay-engine/
├── README.md                  (this file)
├── pyproject.toml
├── modal_app.py               (Modal entrypoint, deferred until first deploy)
├── .env.example
├── .gitignore                 (Python-specific)
├── src/
│   └── replay_engine/
│       ├── __init__.py
│       ├── stage1_candidates.py
│       ├── stage1_5_filter.py
│       ├── stage2_renderer.py
│       ├── stage3_labeler.py
│       ├── stage5_calibration.py
│       ├── databento_client.py
│       ├── supabase_client.py
│       └── shared/
│           ├── __init__.py
│           ├── timeframe.py    (T_now discipline, single source of clock truth)
│           ├── indicators.py   (EMA per-frame, no full_df leaks)
│           ├── audit.py        (deterministic look-ahead linter)
│           └── types.py        (pydantic models matching architecture spec)
├── tests/
│   └── ...
└── scripts/
    ├── run_stage1.py
    ├── run_stage1_5.py
    ├── run_stage2.py
    ├── run_stage3.py
    └── run_calibration.py
```

## Status

Scaffold only. Implementation begins after:
1. ✓ Migration 0002 applied to Supabase (this PR)
2. User confirms Databento historical tier is active (12mo 1-min OHLC + 6mo OHLCV-1s schema)
3. Modal account provisioned (user-side)

## Reference materials

- Strategy spec: `../../trading-copilot-research/research/STRATEGY-SPEC.md`
- Wave E synthesis: `../../trading-copilot-research/architecture/02-wave-e-synthesis-spec.md`
- Pipeline spec: `../../trading-copilot-research/architecture/03-mass-calibration-backtest-pipeline.md`
- Agent 35 deliverable: `../../trading-copilot-research/research/agent-35-backtesting-replay.md`
- 6-factor scorer source (read-only): `C:/Users/Kevin/nq-trigger-tracker-source/nq-trigger-tracker-main/src/lib/confidence-scorer.ts`

## Halt conditions

The 7 halt conditions from the pipeline spec §16 apply unchanged. Notably:
- Stage 2 SSIM < 0.85 after 5 iterations → halt
- Stage 4 abstain rate > 35% on first 100 frames → halt
- Stage 5 contradicts §0.6 weight assumptions → halt
- Stage 7 holdout drops > 15pp → halt

Stop the pipeline; do not paper over.
