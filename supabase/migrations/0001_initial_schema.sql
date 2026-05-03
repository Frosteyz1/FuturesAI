-- ============================================================================
-- AI-Vision Trading Copilot — Initial Schema (V1)
-- ============================================================================
-- Source: aggregated requirements from research deliverables 19, 23, 27, 34,
-- 37, 39 + architecture/01-pattern-taxonomy.md + architecture/02-wave-e-synthesis-spec.md
--
-- V1 single-tenant: Kevin is the only authorized account. RLS policies are
-- owner-based; multi-tenant audit deferred to v2 per Agent 37 privacy spec.
--
-- Apply via Supabase migration tool:
--   supabase db push
-- or paste into the Supabase SQL editor.
-- ============================================================================

-- pgvector for Agent 19 corpus embeddings (similarity match spine)
create extension if not exists vector;

-- ============================================================================
-- 1. chart_scoring_runs — every upload + verdict
-- ============================================================================
create table if not exists chart_scoring_runs (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid,                          -- supabase auth.users(id) when configured
  created_at                  timestamptz not null default now(),
  completed_at                timestamptz,
  duration_ms                 integer,

  -- Inputs
  image_path                  text not null,                 -- supabase storage ref
  image_mime                  text not null,
  htf_image_path              text,
  user_prior                  jsonb,                         -- {direction, note}
  pasted_event_context        text,

  -- Pre-processing snapshot
  pre_processing              jsonb,
  atr_at_score                numeric(8, 2),

  -- Verdict + content
  verdict                     text not null
                              check (verdict in (
                                'TAKE_NOW',
                                'WAIT_FOR_LEVEL',
                                'SETUP_FORMING',
                                'SKIP',
                                'SKIP_OUT_OF_SCOPE',
                                'ABSTAIN_INPUT'
                              )),
  direction                   text check (direction in ('long', 'short', 'either', 'none')),
  variant                     text not null
                              check (variant in (
                                'VARIANT_A',
                                'VARIANT_B',
                                'VARIANT_C',
                                'VARIANT_D',
                                'OTHER_PATTERNED',
                                'ABSTAIN_INPUT'
                              )),
  tier                        smallint check (tier between 1 and 3),
  tier_provisional            boolean default false,

  -- Scores
  base_composite              numeric(5, 2),
  capped_score                numeric(5, 2),
  modulated_score             numeric(5, 2),
  skepticism_adjusted_score   numeric(5, 2),
  final_score                 numeric(5, 2) not null,
  calibrated_p_win            numeric(5, 4),
  calibrated_p_win_ci_low     numeric(5, 4),
  calibrated_p_win_ci_high    numeric(5, 4),
  calibration_state           text check (calibration_state in (
                                'none', 'uncalibrated', 'rough', 'provisional', 'calibrated'
                              )),

  -- Action params
  entry                       numeric(10, 2),
  stop                        numeric(10, 2),
  target                      numeric(10, 2),
  contract_count              smallint,
  achievable_r                numeric(5, 2),
  proposed_entry              numeric(10, 2),                -- for delta detection per Agent 34
  proposed_stop               numeric(10, 2),
  proposed_sizing             smallint,

  -- Wait/forming params
  watch_level                 numeric(10, 2),
  watch_layer                 text check (watch_layer in ('blue', 'yellow', 'white')),
  trigger_to_wait_for         text,
  expected_window             text,

  -- Card content
  pattern_label               text,
  top_reasons                 text[],
  invalidating_concern        text,
  agreement_banner            text,
  disclaimer                  text,

  -- Synthesis traces (for explainability + audit)
  alignment_gate_fired        boolean default false,
  alignment_cap_value         smallint,
  context_multipliers         jsonb,                         -- {htf, timeOfDay, internals, volatility, compound}
  skepticism_multiplier       numeric(5, 4),
  veto_source                 text,
  veto_severity               text check (veto_severity in ('hard', 'soft', 'none')),
  devils_advocate             jsonb,                         -- {counterStrength, counterArg, modeAdjustment}

  -- Observability
  cost_usd                    numeric(8, 4),
  cache_hit_rate              numeric(5, 4),
  total_input_tokens          integer,
  total_output_tokens         integer,
  total_cached_tokens         integer,

  -- Provenance / audit
  prompt_versions             jsonb,                         -- {agentId: versionHash}
  calibration_epoch           text,                          -- pointer to calibration_active.id at scoring time
  nq_corpus_size_at_scoring   integer,
  scoring_engine_version      text                           -- semver of orchestrator at time of run
);

create index if not exists idx_csr_created_at      on chart_scoring_runs(created_at desc);
create index if not exists idx_csr_verdict         on chart_scoring_runs(verdict);
create index if not exists idx_csr_variant_tier    on chart_scoring_runs(variant, tier);
create index if not exists idx_csr_owner           on chart_scoring_runs(owner_id);

-- ============================================================================
-- 2. chart_scoring_run_agents — per-agent output (Show Me Why panel)
-- ============================================================================
create table if not exists chart_scoring_run_agents (
  id                  uuid primary key default gen_random_uuid(),
  scoring_run_id      uuid not null references chart_scoring_runs(id) on delete cascade,
  agent_id            text not null,
  agent_version       text,                                  -- prompt+model version hash
  model_tier          text check (model_tier in ('haiku', 'sonnet', 'opus')),

  score               numeric(5, 2),
  confidence          smallint,
  abstain             boolean not null default false,
  abstain_reason      text,
  evidence            text[],
  concerns            text[],

  -- Full agent response for replay / re-analysis
  raw_output          jsonb not null,

  -- Observability
  latency_ms          integer,
  cost_usd            numeric(8, 6),
  input_tokens        integer,
  output_tokens       integer,
  cached_tokens       integer,

  created_at          timestamptz not null default now()
);

create index if not exists idx_csra_run_agent      on chart_scoring_run_agents(scoring_run_id, agent_id);

-- ============================================================================
-- 3. calibration_corpus_entries — labeled examples (Agent 19 spine)
-- ============================================================================
create table if not exists calibration_corpus_entries (
  id                          text primary key,                  -- "001", "002", ... or uuid for backtest entries
  file                        text not null,                     -- relative path images/...
  source                      text not null
                              check (source in (
                                'exemplar',          -- 11 /ES seed images
                                'real_trade',        -- captured live
                                'backtest',          -- Phase 1.5 generated
                                'retro_labeled'      -- Kevin manually backfilled losers
                              )),

  -- Labels
  direction                   text not null check (direction in ('long', 'short', 'skip')),
  grade                       text check (grade in ('A+', 'A', 'B', 'C', 'skip')),
  outcome                     text check (outcome in ('W', 'L', 'BE', 'no_trade')),
  r_multiple                  numeric(5, 2),

  -- Chart context
  timeframe                   text not null,
  instrument                  text not null,
  chart_timestamp             timestamptz,
  cloud_state                 text,                              -- kNN filter
  variant                     text check (variant in ('VARIANT_A', 'VARIANT_B', 'VARIANT_C', 'VARIANT_D', 'OTHER_PATTERNED')),
  tier                        smallint,

  -- Notes & flags
  label                       text,                              -- Kevin's gut take, one clause
  context                     text,                              -- non-chart info (news, P&L, fatigue)
  algo_score                  smallint,                          -- 6-factor scorer if known
  notes                       text,
  seed_only                   boolean default false,             -- excluded from PSI baselines per Agent 39
  retro_labeled               boolean default false,
  memory_only                 boolean default false,             -- Kevin's-memory-derived, looser confidence

  -- Embeddings (Agent 19's hybrid approach)
  structural_features         jsonb,                             -- 32-D from Wave A agents
  visual_embedding            vector(512),                       -- CLIP ViT-B/32 (deferred to v2 per auth doc Q5)
  text_description_embedding  vector(1536),                      -- OpenAI text-embedding-3-small via Claude description
  embedding_version           text,                              -- so re-indexing is detectable

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_cce_filter        on calibration_corpus_entries(timeframe, cloud_state, variant);
create index if not exists idx_cce_source        on calibration_corpus_entries(source);
create index if not exists idx_cce_outcome       on calibration_corpus_entries(outcome);
-- IVFFlat indexes on vector columns added once corpus has 50+ entries (per Agent 19 §)
-- create index on calibration_corpus_entries using ivfflat (visual_embedding vector_cosine_ops);
-- create index on calibration_corpus_entries using ivfflat (text_description_embedding vector_cosine_ops);

-- ============================================================================
-- 4. nt_fills — raw NinjaTrader CSV import
-- ============================================================================
create table if not exists nt_fills (
  id                  uuid primary key default gen_random_uuid(),
  instrument          text not null,
  executed_at         timestamptz not null,
  price               numeric(10, 4) not null,
  quantity            integer not null,
  side                text not null check (side in ('buy', 'sell')),
  position_after      integer,
  account_id          text,
  sim_or_live         text check (sim_or_live in ('sim', 'live')),
  csv_import_batch_id text,
  fill_external_id    text,                                    -- broker's fill ID for dedupe
  created_at          timestamptz not null default now(),
  unique (csv_import_batch_id, fill_external_id)
);

create index if not exists idx_nt_fills_executed on nt_fills(executed_at desc);
create index if not exists idx_nt_fills_inst    on nt_fills(instrument, executed_at desc);

-- ============================================================================
-- 5. trade_outcomes — joined scoring + fills (the actual learning corpus)
-- ============================================================================
create table if not exists trade_outcomes (
  id                      uuid primary key default gen_random_uuid(),
  scoring_run_id          uuid references chart_scoring_runs(id) on delete cascade,

  -- Trade boundaries
  entered_at              timestamptz,
  entered_price           numeric(10, 4),
  entered_quantity        integer,
  exited_at               timestamptz,
  exited_price            numeric(10, 4),
  hold_minutes            integer,

  -- Outcome
  outcome                 text check (outcome in ('W', 'L', 'BE', 'no_trade')),
  r_multiple              numeric(5, 2),
  -- pnl_usd is intentionally redacted from LLM context per Agent 37; stored
  -- here for the user's own bookkeeping but never sent to model prompts.
  pnl_usd                 numeric(10, 2),

  reconciled_at           timestamptz,
  reconciliation_method   text check (reconciliation_method in (
                            'auto', 'manual', 'manual_correction', 'pending'
                          )),
  reconciliation_notes    text,
  match_confidence        numeric(5, 4),                       -- per Agent 34 tolerance check

  created_at              timestamptz not null default now()
);

create index if not exists idx_to_scoring_run    on trade_outcomes(scoring_run_id);
create index if not exists idx_to_outcome        on trade_outcomes(outcome);

-- ============================================================================
-- 6. overrides — user override taps (Agent 34)
-- ============================================================================
create table if not exists overrides (
  id                      uuid primary key default gen_random_uuid(),
  scoring_run_id          uuid not null references chart_scoring_runs(id) on delete cascade,
  override_type           text not null
                          check (override_type in (
                            'skip_to_take',          -- system said SKIP, user took
                            'take_to_skip',          -- system said TAKE, user skipped
                            'take_with_adjustment'   -- v1.1 only, deferred
                          )),
  user_action             text,
  voice_note_audio_path   text,
  voice_note_transcript   text,
  paper_track_15min       boolean default false,
  provisional             boolean not null default true,        -- 30s undo window
  confirmed_at            timestamptz,
  created_at              timestamptz not null default now()
);

create index if not exists idx_or_run            on overrides(scoring_run_id);

-- ============================================================================
-- 7. pattern_variant_priors — Beta-Binomial per variant (Agent 27)
-- ============================================================================
create table if not exists pattern_variant_priors (
  variant                 text primary key
                          check (variant in (
                            'VARIANT_A', 'VARIANT_B', 'VARIANT_C', 'VARIANT_D', 'OTHER_PATTERNED'
                          )),
  alpha                   numeric not null default 2.0,        -- Beta(2, 2) start per Agent 39 shrinkage
  beta                    numeric not null default 2.0,
  n                       integer not null default 0,
  posterior_mean          numeric(5, 4),
  posterior_variance      numeric(8, 6),
  last_updated            timestamptz not null default now()
);

insert into pattern_variant_priors (variant) values
  ('VARIANT_A'), ('VARIANT_B'), ('VARIANT_C'), ('VARIANT_D'), ('OTHER_PATTERNED')
on conflict (variant) do nothing;

-- ============================================================================
-- 8. calibration_fits — immutable fit history (Agent 27)
-- ============================================================================
create table if not exists calibration_fits (
  id                      uuid primary key default gen_random_uuid(),
  fit_at                  timestamptz not null default now(),
  method                  text not null
                          check (method in ('isotonic', 'platt', 'beta_binomial', 'cold_start_prior')),

  -- Cell identity
  cell_pattern            text,
  cell_tier               smallint,
  cell_instrument         text,

  -- Fit state
  n_train                 integer,
  n_holdout               integer,
  brier_train             numeric(6, 4),
  brier_holdout           numeric(6, 4),
  log_loss_train          numeric(6, 4),
  log_loss_holdout        numeric(6, 4),
  reliability_diagram     jsonb,
  calibration_function    jsonb not null,                       -- mapping table or coefficients

  -- Audit
  prompt_versions_at_fit  jsonb,
  upstream_data_size      integer,
  notes                   text
);

create index if not exists idx_cf_cell           on calibration_fits(cell_pattern, cell_tier, cell_instrument, fit_at desc);

-- ============================================================================
-- 9. calibration_active — pointer to current active fit per cell
-- ============================================================================
create table if not exists calibration_active (
  cell_pattern            text not null,
  cell_tier               smallint,
  cell_instrument         text not null,
  active_fit_id           uuid not null references calibration_fits(id),
  activated_at            timestamptz not null default now(),
  primary key (cell_pattern, cell_tier, cell_instrument)
);

-- ============================================================================
-- 10. agent_reliability — per-agent rolling Brier (Agent 39)
-- ============================================================================
create table if not exists agent_reliability (
  agent_id                text primary key,
  rolling_brier_30        numeric(6, 4),
  rolling_brier_180       numeric(6, 4),
  shrinkage_n             integer,
  last_30_outcomes        jsonb,
  last_updated            timestamptz not null default now()
);

-- ============================================================================
-- 11. learning_loop_runs — Agent 27 batch audit
-- ============================================================================
create table if not exists learning_loop_runs (
  id                      uuid primary key default gen_random_uuid(),
  triggered_at            timestamptz not null default now(),
  trigger_reason          text not null
                          check (trigger_reason in (
                            'weekly_cron', 'trade_count_milestone', 'regime_alert', 'manual'
                          )),
  n_processed             integer,
  fits_produced           integer,
  fits_activated          integer,
  alarms_raised           text[],
  notes                   text,
  completed_at            timestamptz,
  status                  text not null default 'running'
                          check (status in ('running', 'completed', 'failed', 'rolled_back'))
);

-- ============================================================================
-- 12. reconciliation_runs — nightly NT CSV → outcomes (Agent 34)
-- ============================================================================
create table if not exists reconciliation_runs (
  id                      uuid primary key default gen_random_uuid(),
  ran_at                  timestamptz not null default now(),
  csv_file_path           text,
  fills_imported          integer,
  scorings_in_window      integer,
  matches_made            integer,
  ambiguous_queue_size    integer,
  match_rate              numeric(5, 4),
  alarms                  text[],
  status                  text not null default 'running'
                          check (status in ('running', 'completed', 'failed'))
);

-- ============================================================================
-- RLS — V1 single-tenant (Kevin only)
-- ============================================================================
-- Enable RLS on each table; allow service-role full access.
-- Production single-user uses service-role from server only — Auth wiring
-- comes in Step 7 (UI shell). Until then, service-role bypasses RLS implicitly.

alter table chart_scoring_runs        enable row level security;
alter table chart_scoring_run_agents  enable row level security;
alter table calibration_corpus_entries enable row level security;
alter table nt_fills                  enable row level security;
alter table trade_outcomes            enable row level security;
alter table overrides                 enable row level security;
alter table pattern_variant_priors    enable row level security;
alter table calibration_fits          enable row level security;
alter table calibration_active        enable row level security;
alter table agent_reliability         enable row level security;
alter table learning_loop_runs        enable row level security;
alter table reconciliation_runs       enable row level security;

-- Service-role bypass policy (V1 single-tenant). Replace with auth.uid()-based
-- policies when multi-tenant is introduced.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename in (
    'chart_scoring_runs', 'chart_scoring_run_agents', 'calibration_corpus_entries',
    'nt_fills', 'trade_outcomes', 'overrides', 'pattern_variant_priors',
    'calibration_fits', 'calibration_active', 'agent_reliability',
    'learning_loop_runs', 'reconciliation_runs'
  )
  loop
    execute format('create policy "service_role_all" on %I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
