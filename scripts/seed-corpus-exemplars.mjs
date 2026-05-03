#!/usr/bin/env node
/**
 * Seed calibration_corpus_entries with the 11 chart-exemplars.
 *
 * Per Master Authorization Q1 decision (auth doc 2026-05-03):
 *   source: 'exemplar', seed_only: true (excluded from PSI baselines per Agent 39)
 *
 * Image files remain at:
 *   C:\Users\Kevin\trading-copilot-research\chart-exemplars\chart-exemplars\
 * Image upload to Supabase Storage is deferred to Step 7 (UI shell) / Agent 19
 * implementation. This seed inserts metadata only.
 *
 * Embeddings are deferred to Agent 19 implementation. NULL for now; the
 * embedding_version field stays NULL so re-indexing is detectable.
 *
 * Usage:
 *   node scripts/seed-corpus-exemplars.mjs
 *
 * Idempotent: uses upsert on (id) primary key.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(resolve(__dirname, '..', '.env.local'));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * 11 exemplars, metadata aggregated from:
 *   - chart-exemplars/INDEX.md
 *   - direct image inspection during Phase -1 discovery
 *   - 2026-05-03 corpus seed decision (Variant A only V1, /ES treated as
 *     transferable pattern reference per auth §3 disclaimer rules)
 */
const ENTRIES = [
  {
    id: '001',
    file: 'images/01-tos-mobile-long-bounce-ES.png',
    direction: 'long',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: null,
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'mid-day bounce, Tier 1 micro-only rejection in established uptrend',
    context: '/ES, mobile TOS, continuation to session highs',
    notes: 'TOS dual-cloud era (blue + yellow only)',
  },
  {
    id: '002',
    file: 'images/02-tos-mobile-short-rejection-ES.png',
    direction: 'short',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: null,
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'downtrend pullback up to micro cloud, ~8 bar consolidation, breakdown on volume expansion',
    context: '/ES, mobile TOS',
    notes: 'TOS dual-cloud era',
  },
  {
    id: '003',
    file: 'images/03-tos-mobile-multi-cloud-ES-U24-bounce.png',
    direction: 'long',
    grade: 'B',
    outcome: null,
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-09-01T12:02:00-04:00',
    cloud_state: 'TREND_ESTABLISHED_RUNNING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'all clouds parallel and aligned upward, mid-day rally after consolidation',
    context: '/ES U24, post-consolidation',
    notes: 'TOS 4-cloud-era (deprecated 4th layer present); reference for "all clouds aligned" geometry only',
  },
  {
    id: '004',
    file: 'images/04-tos-mobile-multi-cloud-ES-U24-trend-uptrend.png',
    direction: 'long',
    grade: 'B',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-09-01T19:20:00-04:00',
    cloud_state: 'TREND_FORMING',
    variant: 'VARIANT_B',
    tier: null,
    label: 'after-hours range/consolidation transitioning to uptrend',
    context: '/ES U24 ETH session, 19:20-20:30 ET',
    notes: 'Variant B (regime-establishment); V1 routes to SKIP_OUT_OF_SCOPE but seeded for v2 + Agent 19 reference. TOS 4-cloud-era.',
  },
  {
    id: '005',
    file: 'images/05-tos-mobile-multi-cloud-ES-U24-cascade-shorts.png',
    direction: 'short',
    grade: 'A+',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: null,
    cloud_state: 'POST_REJECTION_CONTINUATION',
    variant: 'VARIANT_A',
    tier: 3,
    label: 'cascade shorts: 10-min big white macro rejection, then 1/3 confluence, then 1-min momo',
    context: '/ES U24, the canonical cross-tier cascade exemplar (Pattern C)',
    notes: 'TOS 4-cloud-era. Tier 3 entry at macro is provisional — only verbally evidenced, not Agent 19 calibrated.',
  },
  {
    id: '006',
    file: 'images/06-tos-mobile-open-confluence-long-ES-U24.png',
    direction: 'long',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-09-01T09:10:00-04:00',
    cloud_state: 'TREND_FORMING',
    variant: 'VARIANT_B',
    tier: null,
    label: 'open 1-min long confluence: range to breakout to trend establishment',
    context: '/ES U24, 9:10-10:49 ET; canonical Variant B exemplar',
    notes: 'Variant B canonical reference; V1 routes to SKIP_OUT_OF_SCOPE. TOS 4-cloud-era.',
  },
  {
    id: '007',
    file: 'images/07-tos-mobile-short-ES-U24.png',
    direction: 'short',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-09-01T09:15:00-04:00',
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'downtrend with multiple short pullback entries',
    context: '/ES U24, 9:15-10:14 ET',
    notes: 'TOS 4-cloud-era. Multi-entry exemplar (Pattern B staggered re-entry).',
  },
  {
    id: '008',
    file: 'images/08-tos-mobile-older-template-ES-Z23.png',
    direction: 'short',
    grade: 'B',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: null,
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'downtrend with multiple cloud-zone rejections',
    context: '/ES Z23, before user added the 720/890 macro cloud',
    notes: 'Legacy 2-cloud template (blue + yellow only, no macro). Reference for charts missing macro layer.',
  },
  {
    id: '009',
    file: 'images/09-ninjatrader-20sec-blue-cloud-bounce-ES-MAR24.png',
    direction: 'long',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,  // R unknown without explicit stop
    timeframe: '20s',
    instrument: 'ES',
    chart_timestamp: '2024-03-15T14:32:00-04:00',
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'blue cloud bounce in strong uptrend; entry 2 @ 4727.25; targets 4731.25 + 4737.25',
    context: '/ES MAR24 NinjaTrader, 20-second base TF',
    notes: 'Timeframe-dependence exemplar (same 72/89 pair, different time semantics). NinjaTrader template displayed 72/80 but production canonical is 72/89.',
  },
  {
    id: '010',
    file: 'images/10-ninjatrader-1min-pyramid-entry-ES-MAR24.png',
    direction: 'long',
    grade: 'A+',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-03-15T13:35:00-04:00',
    cloud_state: 'REJECTION_FIRING',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'concentrated pyramid: 1+4 @ 4685.50; target 4-5 @ 4695.50 (~10pt move)',
    context: '/ES MAR24 NinjaTrader 1-min',
    notes: 'Pattern A (concentrated pyramid) canonical exemplar. NinjaTrader template displayed 72/80.',
  },
  {
    id: '011',
    file: 'images/11-ninjatrader-1min-staggered-reentry-ES-MAR24.png',
    direction: 'long',
    grade: 'A',
    outcome: 'W',
    r_multiple: null,
    timeframe: '1m',
    instrument: 'ES',
    chart_timestamp: '2024-03-15T13:08:00-04:00',
    cloud_state: 'POST_REJECTION_CONTINUATION',
    variant: 'VARIANT_A',
    tier: 1,
    label: 'staggered re-entry: 1@4883.50 + 1@4883.50 + 1@4884.50 across ~45 min; target 2+2 @ 4895.25',
    context: '/ES MAR24 NinjaTrader 1-min, 13:08-15:13 ET',
    notes: 'Pattern B (staggered re-entry) canonical exemplar. NinjaTrader template displayed 72/80.',
  },
];

const COMMON_FLAGS = {
  source: 'exemplar',
  seed_only: true,        // excluded from PSI baselines per Agent 39
  retro_labeled: false,
  memory_only: false,
  algo_score: null,
  structural_features: null,
  visual_embedding: null,           // CLIP embedding deferred to v2
  text_description_embedding: null, // generated when Agent 19 wires up
  embedding_version: null,
};

const rows = ENTRIES.map((e) => ({ ...COMMON_FLAGS, ...e }));

console.log(`\n=== Seeding ${rows.length} chart exemplars ===\n`);

const { data, error } = await sb
  .from('calibration_corpus_entries')
  .upsert(rows, { onConflict: 'id' })
  .select('id, variant, direction, tier');

if (error) {
  console.error('FAILED:', error.message);
  process.exit(1);
}

for (const r of data) {
  console.log(`  ✓ ${r.id} — ${r.variant} ${r.direction}${r.tier ? ` T${r.tier}` : ''}`);
}

const { count } = await sb
  .from('calibration_corpus_entries')
  .select('*', { count: 'exact', head: true });
console.log(`\nTotal corpus entries now: ${count}`);

// Distribution check
const { data: byVariant } = await sb
  .from('calibration_corpus_entries')
  .select('variant')
  .then(({ data }) => {
    const counts = {};
    for (const r of data ?? []) counts[r.variant] = (counts[r.variant] ?? 0) + 1;
    return { data: counts };
  });
console.log('Distribution by variant:', byVariant);
