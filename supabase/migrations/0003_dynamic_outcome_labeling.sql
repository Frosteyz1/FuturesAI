-- ============================================================================
-- Phase 1.5 — Dynamic outcome labeling columns
-- ============================================================================
-- Source: 2026-05-03 user correction (autonomous build authorization).
--   Targets are dynamic, not fixed. Min target 2.5R (the W floor).
--   Stop is computed per-setup with floor 8pt / ceiling 18pt / default 12pt.
--
-- Per the correction memo: "Add these to the schema as additive migration
-- `0002_dynamic_outcome_labeling.sql`." Renumbered to 0003 because 0002 is
-- already taken by replay_runs (committed and applied separately). Additive
-- only — no DROP, no ALTER COLUMN that changes type/nullable on existing data.
--
-- Apply via Supabase Dashboard SQL Editor AFTER 0002_replay_runs.sql.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. trade_outcomes — production outcome capture (NinjaTrader CSV reconcile)
-- ────────────────────────────────────────────────────────────────────────────

alter table trade_outcomes
  add column if not exists dynamic_stop_used   numeric(6, 2),
  add column if not exists stop_logic          text
                                                check (stop_logic in (
                                                  'swing_low',
                                                  'swing_high',
                                                  'deepest_cloud',
                                                  'default_12pt'
                                                )),
  add column if not exists r_to_2_5r           boolean,
  add column if not exists r_to_3r             boolean,
  add column if not exists r_to_4r             boolean,
  add column if not exists max_r_achieved      numeric(6, 2),
  add column if not exists time_to_2_5r_seconds integer,
  add column if not exists time_to_3r_seconds  integer,
  add column if not exists time_to_4r_seconds  integer;

-- Existing `outcome` column semantics tighten per §6.3:
--   'W'  = r_to_2_5r == true    (reached the 2.5R discipline floor)
--   'L'  = stop hit before 2.5R
--   'BE' = neither stop nor 2.5R hit within 60-bar horizon
-- We do NOT alter the existing column — the application layer enforces this
-- semantics going forward; legacy rows (none yet) retain old semantics.

create index if not exists idx_to_r_to_2_5r on trade_outcomes(r_to_2_5r) where r_to_2_5r is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. replay.frames — backtest outcome capture (Stage 3 output)
-- ────────────────────────────────────────────────────────────────────────────

alter table replay.frames
  add column if not exists dynamic_stop_used    numeric(6, 2),
  add column if not exists stop_logic           text
                                                 check (stop_logic in (
                                                   'swing_low',
                                                   'swing_high',
                                                   'deepest_cloud',
                                                   'default_12pt'
                                                 )),
  add column if not exists r_to_2_5r            boolean,
  add column if not exists r_to_3r              boolean,
  add column if not exists r_to_4r              boolean,
  add column if not exists max_r_achieved       numeric(6, 2),
  add column if not exists time_to_2_5r_seconds integer,
  add column if not exists time_to_3r_seconds   integer,
  add column if not exists time_to_4r_seconds   integer;

-- Drop the now-superseded fixed-R hit_* columns? NO — preserve for audit
-- compatibility with any pre-correction Stage 4 runs (none expected yet).
-- The new r_to_*R columns are the ones Stage 5 reads.

create index if not exists idx_replay_frames_r_to_2_5r on replay.frames(r_to_2_5r) where r_to_2_5r is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- RLS unchanged — additive columns inherit existing policies on parent tables
-- ────────────────────────────────────────────────────────────────────────────
