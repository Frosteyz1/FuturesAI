# AI-Vision Trading Copilot

Vision-based discretionary trading copilot for /NQ futures. Upload a chart, get direction + probability + verdict.

V1 scope: Variant A (pullback rejection in established trend) only. Other variants short-circuit to `SKIP_OUT_OF_SCOPE`.

Positioning: **structured red-team for the user's discretionary read**, not an oracle.

## Stack

- Next.js 16 (App Router, Server Components by default)
- TypeScript strict mode
- Tailwind v4
- Supabase (Postgres + pgvector + storage)
- Anthropic API (Opus 4.7 / Sonnet 4.6 / Haiku 4.5 tiered fan-out)
- Vercel (deployment, paid plan required for 300s function timeout)

## Build status

Step 2 (Foundation) of the 9-step build plan. Orchestrator skeleton + types + Supabase migrations + ATR service stub. No agent prompts written yet — Step 3 onward.

## Project structure

```
src/
├── app/                          # Next.js App Router (UI in Step 7)
├── lib/
│   ├── orchestrator/             # Wave 0 → Wave E pipeline
│   │   ├── index.ts              # scoreChart() entry point
│   │   ├── synthesis.ts          # Wave E 10-step math
│   │   └── types.ts              # internal pipeline types
│   ├── pre-processing/
│   │   ├── atr.ts                # ATR extraction service (multi-source)
│   │   └── index.ts              # OCR + image norm + indicator detection
│   ├── supabase/
│   │   ├── server.ts             # service-role client (server-only)
│   │   └── client.ts             # anon client (browser-safe)
│   └── anthropic/
│       └── client.ts             # SDK wrapper + model tier constants
└── types/
    ├── taxonomy.ts               # PatternVariant, VerdictMode, etc. — LOCKED
    ├── agents.ts                 # per-agent output schemas (44 agents)
    ├── synthesis.ts              # Wave E pipeline types
    └── index.ts

supabase/
└── migrations/
    └── 0001_initial_schema.sql   # 12 tables (V1)
```

## Architecture references

The system was designed across 44 research deliverables and 2 architecture specs before any code was written. The architecture docs are the source of truth:

- `architecture/01-pattern-taxonomy.md` — variant + verdict enum lock
- `architecture/02-wave-e-synthesis-spec.md` — 10-step pipeline math (consumes 44 agent outputs)
- `research/agent-NN-*.md` — research deliverable per agent (44 files)

Located at `C:\Users\Kevin\trading-copilot-research\` (separate from this repo by design — research is reference, not runtime).

## Local development

### Prerequisites

1. Supabase project provisioned via dashboard, schema migration applied
2. `.env.local` populated from `.env.local.example`
3. Anthropic API key
4. Node 20+ (tested on 24)

### Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in env vars
npm run dev
```

### Apply schema

```bash
# Via Supabase CLI
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste `supabase/migrations/0001_initial_schema.sql` into the Supabase dashboard SQL editor.

## V1 invariants (do not violate)

- **Variant A only.** Non-A inputs short-circuit to `SKIP_OUT_OF_SCOPE` after Wave 0.
- **Score cap 85** until /NQ corpus reaches 30 reconciled trades.
- **Fixed sizing**: 3 contracts, $600 risk, 10–15 NQ point stops.
- **Devil's advocate Wave E pass is mandatory.** Do not skip to save cost.
- **No external indicators** (RSI/MACD/Bollinger). Volume only.
- **§0.6 weights are starting points, not negotiables.** 8 structural agents own 100% of base composite.
- **Disagreement banner is the most prominent card state.** Framing pivot is load-bearing.

## What's NOT here yet

- Agent prompts (Step 3+)
- API route handlers (Step 7)
- UI shell (Step 7)
- NinjaTrader CSV reconciliation cron (Step 8)
- Replay engine (Step 9, Phase 1.5)
- Backtest pipeline (Phase 1.5)

## Cost & latency

Per Wave E spec §13:

| Path | Cost | Latency |
|---|---|---|
| ABSTAIN_INPUT | $0.02 | 3–5s |
| SKIP_OUT_OF_SCOPE | $0.05 | 8–12s |
| Wave A short-circuit | $0.30 | 15–20s |
| Full Variant A scoring | $0.80–1.00 | 25–35s |

Monthly (60 charts): ~$47/mo Anthropic + $20/mo Vercel Pro = **$67/mo all-in**.
