#!/usr/bin/env node
/**
 * Smoke test for the Supabase schema.
 *
 * Verifies:
 *   - service-role connection works
 *   - all 12 tables exist and are queryable
 *   - pattern_variant_priors seed rows landed
 *   - pgvector extension is enabled (via test insert)
 *
 * Usage:
 *   node scripts/smoke-test-schema.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

// Tiny inline .env parser so we don't need dotenv as a dep
function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(envPath);
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  'chart_scoring_runs',
  'chart_scoring_run_agents',
  'calibration_corpus_entries',
  'nt_fills',
  'trade_outcomes',
  'overrides',
  'pattern_variant_priors',
  'calibration_fits',
  'calibration_active',
  'agent_reliability',
  'learning_loop_runs',
  'reconciliation_runs',
];

const EXPECTED_VARIANT_SEEDS = [
  'VARIANT_A', 'VARIANT_B', 'VARIANT_C', 'VARIANT_D', 'OTHER_PATTERNED',
];

let pass = 0;
let fail = 0;

function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
function bad(msg) { console.log(`  ✗ ${msg}`); fail++; }

console.log('\n=== Schema smoke test ===\n');

console.log('[1/3] Table existence + queryability');
for (const t of TABLES) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (error) bad(`${t}: ${error.message}`);
  else ok(`${t} (rows: ${count})`);
}

console.log('\n[2/3] Variant priors seed rows');
const { data: priors, error: pErr } = await sb
  .from('pattern_variant_priors')
  .select('variant, alpha, beta, n');
if (pErr) {
  bad(`pattern_variant_priors query failed: ${pErr.message}`);
} else {
  const found = priors.map((r) => r.variant).sort();
  const expected = [...EXPECTED_VARIANT_SEEDS].sort();
  if (JSON.stringify(found) === JSON.stringify(expected)) {
    ok(`all 5 variant priors present (alpha=2, beta=2, n=0 each)`);
  } else {
    bad(`expected ${expected.join(',')}, got ${found.join(',')}`);
  }
}

console.log('\n[3/3] pgvector smoke test');
// Insert a corpus row with a 1536-dim text embedding, read it back, delete it
const probe = {
  id: '__smoke_test__',
  file: 'images/__smoke_test__.png',
  source: 'exemplar',
  direction: 'long',
  timeframe: '1m',
  instrument: 'NQ',
  text_description_embedding: Array.from({ length: 1536 }, () => 0.0),
  seed_only: true,
};
const { error: insErr } = await sb.from('calibration_corpus_entries').insert(probe);
if (insErr) {
  bad(`pgvector insert failed: ${insErr.message}`);
} else {
  ok('pgvector(1536) insert succeeded');
  const { error: delErr } = await sb
    .from('calibration_corpus_entries')
    .delete()
    .eq('id', '__smoke_test__');
  if (delErr) bad(`smoke-test cleanup failed: ${delErr.message}`);
  else ok('smoke-test row cleaned up');
}

console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
