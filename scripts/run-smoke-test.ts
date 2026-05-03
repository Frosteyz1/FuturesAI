/**
 * Smoke test runner — drives scoreChart() against chart-exemplar 09 using
 * the FileQueueDispatcher. Claude Code (in a session) fulfills the queued
 * Task dispatches by reading request files and writing response files.
 *
 * Usage (from a Claude Code session):
 *   npx tsx scripts/run-smoke-test.ts [--exemplar=09] [--queue-dir=.queue]
 *
 * What this script does:
 *   1. Reads the chart-exemplar PNG from disk → base64.
 *   2. Constructs scoreChart() input + a FileQueueDispatcher.
 *   3. Calls scoreChart() — this kicks off the full pipeline:
 *      - Wave 0 input quality (1 dispatch)
 *      - Wave 0 routing (3 dispatches, parallel: 00a, then 00b+00c)
 *      - Wave A/B/C/D fan-out (~24 dispatches in parallel)
 *      - Devil's advocate (1 dispatch)
 *   4. Each dispatch writes a request file to .queue/requests/.
 *   5. Claude Code reads the request, uses Task tool, writes response file.
 *   6. Once the full ScoringRun completes, this script prints metrics
 *      and saves the result to .queue/runs/{runId}.json.
 *
 * Environment variables:
 *   AGENT_DISPATCHER   — set to "file-queue" by this script
 *   AGENT_QUEUE_DIR    — defaults to .queue
 *   ANTHROPIC_API_KEY  — IGNORED in file-queue mode (no SDK calls)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { scoreChart } from '../src/lib/orchestrator/index.js';
import {
  FileQueueDispatcher,
  _resetDispatcherCache,
} from '../src/lib/agents/shared/dispatchers/index.js';

interface CliArgs {
  exemplarId: string;
  queueDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = { exemplarId: '09', queueDir: '.queue' };
  for (const arg of args) {
    if (arg.startsWith('--exemplar=')) out.exemplarId = arg.split('=', 2)[1] ?? '09';
    else if (arg.startsWith('--queue-dir=')) out.queueDir = arg.split('=', 2)[1] ?? '.queue';
  }
  return out;
}

function findExemplar(exemplarId: string): { path: string; mimeType: 'image/png' | 'image/jpeg' } {
  const exemplarsRoot = resolve(
    'C:/Users/Kevin/trading-copilot-research/chart-exemplars/chart-exemplars',
  );
  if (!existsSync(exemplarsRoot)) {
    throw new Error(
      `Exemplars dir not found at ${exemplarsRoot}. ` +
      `Provide an alternative or update the path in this script.`,
    );
  }

  // Find the file by prefix (e.g., "09-...")
  const filePrefix = exemplarId.padStart(2, '0');
  const fs = require('node:fs') as typeof import('node:fs');
  const files = fs.readdirSync(exemplarsRoot);
  const match = files.find((f) => f.startsWith(`${filePrefix}-`) && f.endsWith('.png'));
  if (!match) {
    throw new Error(`No exemplar matching prefix ${filePrefix}- in ${exemplarsRoot}`);
  }

  return {
    path: resolve(exemplarsRoot, match),
    mimeType: 'image/png',
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startedAt = Date.now();

  // ── 1. Load chart exemplar ───────────────────────────────────────────
  const exemplar = findExemplar(args.exemplarId);
  console.log(`▶ Loading chart-exemplar ${args.exemplarId}: ${exemplar.path}`);
  const imageBuffer = readFileSync(exemplar.path);
  const imageBase64 = imageBuffer.toString('base64');
  console.log(`  → ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // ── 2. Configure FileQueue dispatcher ───────────────────────────────
  const queueDir = resolve(args.queueDir);
  console.log(`▶ Queue dir: ${queueDir}`);
  console.log(`  Claude Code: poll ${queueDir}/requests/, fulfill via Task tool, write to ${queueDir}/responses/`);

  // Force file-queue mode + reset any cached dispatcher
  process.env.AGENT_DISPATCHER = 'file-queue';
  process.env.AGENT_QUEUE_DIR = queueDir;
  _resetDispatcherCache();

  // Pass the dispatcher explicitly so we keep a handle for metrics
  const dispatcher = new FileQueueDispatcher({
    queueDir,
    pollIntervalMs: 1000,        // 1s — Claude Code session time matters more than CPU
    timeoutMs: 30 * 60 * 1000,   // 30 min per dispatch — generous for paced sessions
    cleanupAfterDispatch: false, // Keep request/response files for audit
  });

  // ── 3. Track dispatch metrics ───────────────────────────────────────
  // Wrap dispatch() to capture timing per request
  const dispatchTimings: Array<{ requestId: string; agentId: string; ms: number }> = [];
  const originalDispatch = dispatcher.dispatch.bind(dispatcher);
  dispatcher.dispatch = async (req) => {
    const start = Date.now();
    const result = await originalDispatch(req);
    const ms = Date.now() - start;
    dispatchTimings.push({ requestId: req.requestId, agentId: req.agentId, ms });
    console.log(`  ✓ ${req.agentId.padEnd(6)} (${(ms / 1000).toFixed(1)}s)  → ${req.requestId.slice(0, 8)}`);
    return result;
  };

  // ── 4. Run scoreChart() ──────────────────────────────────────────────
  console.log('\n▶ Calling scoreChart() — Claude Code will start seeing request files now\n');

  // Note: scoreChart pulls its dispatcher from getDefaultDispatcher() based
  // on AGENT_DISPATCHER env var. The local `dispatcher` we built is for
  // metrics tracking — we install it as the cached default by clearing
  // the cache and letting getDefaultDispatcher rebuild from env. Actually
  // simpler: monkey-patch the cache by ensuring the same FileQueueDispatcher
  // is what env-selection produces. Since both use the same queueDir, it
  // works either way — request files end up in the same place.
  const result = await scoreChart(
    {
      imageBase64,
      imageMimeType: exemplar.mimeType,
    },
    {
      // Smoke test runs without optional contexts. Production would supply
      // candidatesContext (Agent 19), eventContext (Agent 22),
      // behavioralContext (Agent 23), cellSampleCount (Agent 27 calibration).
      labeledNqCorpusCount: 0, // /NQ disclaimer + score-cap-85 active
    },
  );

  const wallClockMs = Date.now() - startedAt;

  // ── 5. Persist + report ─────────────────────────────────────────────
  const runsDir = resolve(queueDir, 'runs');
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const runFilePath = resolve(runsDir, `${result.scoringRunId}.json`);
  writeFileSync(
    runFilePath,
    JSON.stringify(
      {
        ...result,
        smokeTest: {
          exemplarId: args.exemplarId,
          exemplarPath: exemplar.path,
          wallClockMs,
          dispatchTimings,
          totalDispatches: dispatchTimings.length,
        },
      },
      null,
      2,
    ),
  );

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SMOKE TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Verdict          : ${result.card.verdict}`);
  console.log(`  Direction        : ${result.card.direction}`);
  console.log(`  Variant          : ${result.card.variant}`);
  console.log(`  Tier             : ${result.card.tier ?? '—'}`);
  console.log(`  Final score      : ${result.card.finalScore.toFixed(1)}`);
  console.log(`  Pattern label    : ${result.card.patternLabel}`);
  if (result.card.entry !== undefined) {
    console.log(`  Entry            : ${result.card.entry}`);
    console.log(`  Stop             : ${result.card.stop}`);
    console.log(`  Target           : ${result.card.target}`);
    console.log(`  Achievable R     : ${result.card.achievableR}x`);
  }
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Total dispatches : ${dispatchTimings.length}`);
  console.log(`  Wall clock       : ${(wallClockMs / 1000).toFixed(1)}s`);
  console.log(`  Avg per dispatch : ${(dispatchTimings.reduce((a, b) => a + b.ms, 0) / dispatchTimings.length / 1000).toFixed(1)}s`);
  console.log(`  Run JSON         : ${runFilePath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
