-- ============================================================================
-- Phase 1.5 — Replay engine schema
-- ============================================================================
-- Source: architecture/03-mass-calibration-backtest-pipeline.md §11
-- Adds the replay schema for Stage 5 calibration analysis output.
-- Applied AFTER 0001_initial_schema.sql.
-- ============================================================================

create schema if not exists replay;

create table if not exists replay.runs (
  id              text primary key,                  -- "rpl_{ISO_TS}_{HASH}"
  started_at      timestamptz not null,
  completed_at    timestamptz,
  status          text not null
                  check (status in ('running', 'completed', 'failed', 'aborted')),

  -- Per Agent 35 §6 schema
  config          jsonb not null,                    -- databento_snapshot, contract_symbol, roll_method, frame_count, sampler_seed, renderer_profile + version + golden_hash, indicator_config_hash, agent_prompt_hashes, agent_model_versions, warmup_bars
  audit           jsonb,                             -- look_ahead_findings, tz_findings, renderer_drift_findings
  composite       jsonb,                             -- replay_health_score, calibration_brier, top_decile_win_rate, verdict_distribution, holdout_agreement_delta
  per_agent       jsonb,                             -- array of {agent_id, abstain_rate, brier, auc, decile_curve, weight_recommendation_delta}
  per_pattern     jsonb,                             -- per-variant win rates and avg R
  large_tier_gate jsonb,                             -- {unlocked, reason, expires_at}
  artifacts       jsonb,                             -- pointers to plots, frame jsonl, csv tables

  -- Run-level metadata
  pipeline_version  text,                            -- semver of the replay engine at this run
  notes             text
);

create index if not exists idx_replay_runs_started on replay.runs(started_at desc);
create index if not exists idx_replay_runs_status  on replay.runs(status);
create index if not exists idx_replay_runs_gate    on replay.runs((large_tier_gate->>'unlocked'));

-- ============================================================================
-- replay.frames — per-frame raw record (optional, for fine-grained debug)
-- ============================================================================
create table if not exists replay.frames (
  id                  uuid primary key default gen_random_uuid(),
  run_id              text not null references replay.runs(id) on delete cascade,
  candidate_id        text not null,                 -- stage1 output id
  ts_close_of_bar     timestamptz not null,
  selection_bucket    text not null
                      check (selection_bucket in ('high_confidence', 'borderline', 'random')),

  -- Stage 1.5 output
  rule_score          smallint,
  candidate_type      text,
  stratum             text,

  -- Stage 2 output
  frame_path          text not null,                 -- supabase storage ref
  renderer_profile    text not null,
  renderer_golden_hash text not null,

  -- Stage 3 output (outcome labels — withheld from agents during stage 4)
  direction           text check (direction in ('long', 'short')),
  outcome             text check (outcome in ('W', 'L', 'BE')),
  r_multiple          numeric(5, 2),
  hit_1r              boolean,
  hit_1_5r            boolean,
  hit_2r              boolean,
  hit_3r              boolean,
  time_to_1r_seconds  integer,
  mfe_pct             numeric(6, 4),
  mae_pct             numeric(6, 4),
  hit_max_hold        boolean,
  event_confounded    boolean default false,

  -- Stage 4 output (full agent + Wave E response)
  scoring_run_id      uuid references chart_scoring_runs(id),  -- if Stage 4 inserted into chart_scoring_runs
  raw_agent_outputs   jsonb,
  wave_e_verdict      text,
  wave_e_score        numeric(5, 2),
  wave_e_direction    text,
  wave_e_variant      text,

  -- Holdout discipline (Stage 7)
  is_holdout          boolean not null default false,

  created_at          timestamptz not null default now()
);

create index if not exists idx_replay_frames_run     on replay.frames(run_id);
create index if not exists idx_replay_frames_outcome on replay.frames(outcome);
create index if not exists idx_replay_frames_holdout on replay.frames(is_holdout);
create index if not exists idx_replay_frames_ts      on replay.frames(ts_close_of_bar);

-- ============================================================================
-- RLS
-- ============================================================================
alter table replay.runs   enable row level security;
alter table replay.frames enable row level security;

create policy "service_role_all" on replay.runs   for all to service_role using (true) with check (true);
create policy "service_role_all" on replay.frames for all to service_role using (true) with check (true);
