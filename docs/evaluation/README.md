# Evaluation — the eval gate

**Updated:** 2026-10-19 · persona_rollout_plan.md §5 J, §7 "What runs on staging" item 2, §8 "Eval gate: weekly on all ledgers with cost per bucket", §9 "eval not re-run (hard gate)".

The eval gate is the only approval for an engine change (plan §8). It runs the **production model and prompt set** against every attorney ledger in `ledgers/`, scores the run against the ledger's canaries, writes down the cost per record bucket, and says green or red. **A red gate blocks promotion** of `main` to production (plan §7 release checklist); it never blocks a merge.

## What runs, and where

| | |
|---|---|
| **When** | Every Monday 09:15 UTC from `.github/workflows/eval-gate.yml`, and on demand: the workflow's *Run workflow* button (optional comma-separated ledger filter) or **Run now** on the staff console at `/ops/eval`. |
| **Where** | **Staging only.** The workflow calls `https://api.staging.snotnoselegal.com` with the `EVAL_GATE_TOKEN` bearer; staging's own Anthropic key and `EVAL_CORPUS_BUCKET` do the work. Agents never hold production secrets; production never runs the gate. |
| **What each run does** | For each ledger: a fresh case in the dedicated eval tenant (`Organisation` "Eval gate — reference records", `isTest = true`, so Money and the Today page's professional numbers exclude it like every test organisation) → the ledger's reference record copied from `corpus/<folder>/` in the eval-corpus bucket (top-level PDFs; `apps/api/src/services/eval-corpus.service.ts` maps `gary` → `Gary`, `brian` → `Brian Spinks`) → the real digitizer (born-digital text is read with pdf-parse, never re-OCR'd; scans go to Textract) → `DOCS_COMPLETE` and the volume meter (the bucket) → the analysis queue on whatever `ANALYSIS_MODEL` / `ANALYSIS_PROMPT_SET` the service runs, **no override** → the same scorer the console's *Score latest run* button uses (`eval.service.ts scoreRun`) → `gateVerdict` → one `EvalRun` row. |
| **Gate rules** | `packages/case-lifecycle/eval-gate.ts` — pure, tested in `tests/eval-gate.test.ts`. (1) **Must-find:** every canary found (`MUST_FIND_RECALL_FLOOR = 1`; a ledger may relax it with `thresholds.minRecall`). (2) **Verdicts:** once a ledger carries transcribed attorney verdicts, precision (agree + partly) ≥ `VERDICT_PRECISION_FLOOR` (0.7, or the ledger's `thresholds.minPrecision`). (3) **Cost:** an EXTENDED record must keep a gross margin ≥ `EXTENDED_MARGIN_FLOOR` (0.7) on the Extended rung price — plan §7 "cost per bucket measured and Extended above the 70% floor". Reasons are machine-readable (`recall_below_floor…`, `missed:<canary>`, `precision_below_floor…`, `cost_margin_below_floor…`). |

## Where to read the results

- **GitHub:** the workflow run's job summary — one row per ledger (verdict, must-find hit rate, dropped-at-verification ratio, bucket, cost, margin, engine + prompt set + hash, start time), the reasons for every red row, and the cost-per-bucket table. The raw `eval-gate.json` is kept as an artifact for 90 days. The job **fails** when any ledger is red, any run failed, or a run is still unfinished after 90 minutes.
- **Staff console:** the Today page's Professional group shows "Eval gate: green/red (date)"; `/ops/eval` has the runs newest first, the latest scorecard per ledger, the cost-per-bucket table, and Run now (ADMIN). Each run links to its case file.
- **API:** `POST /ops/eval/runs { ledgers?: string[] }` → 202 `{ runs }` (409 while a run for that ledger is queued or running, 404 for an unknown ledger); `GET /ops/eval/runs?since=<ISO>` → `{ runs, costPerBucket, ledgers }`; `GET /ops/eval/runs/:id` → the full scorecard. ADMIN session or the `EVAL_GATE_TOKEN` bearer (those two routes only); `GET /ops/status` → `professional.evalGate`.

### Reading a row

| Column | Meaning |
|---|---|
| Must-find | canaries found / canaries in the ledger (recall). The gate needs all of them. |
| Dropped at verification | share of the findings the screens returned that the verbatim grounding filter refused (`screen.completed` v2 `dropped / findingCount`). Not a gate rule; a rising ratio means the engine is quoting loosely. |
| Bucket | `classifyRecord` on the metered reporter's-record pages (plan §4: SHORT < 100, STANDARD 100–500, EXTENDED 501–1,500, LONG > 1,500). Corpus volumes are labelled from their filenames; if none is recognised the unlabelled pages count as reporter pages and the row says so. |
| Cost | the case's `CostRecord` total (model calls at the env-configured `MODEL_USD_*` rates, Textract pages) in dollars — an estimate; tokens are the truth. |
| Margin | `(rung price − cost) / rung price` for the bucket's counsel rung (`DEFAULT_PRICE_BOOK`, ATTORNEY audience); gated for EXTENDED. |

### The cost-per-bucket table

One row per bucket over the scored runs the api listed: **Runs** (scored runs with a cost), **Mean cost**, **Total**, **Unpriced** (runs that landed in the bucket but have no cost yet — queued, running, or failed before any telemetry). It is the number plan §6 asks for before professional prices are published ("cost measured per bucket") and §7's go-live gate reads. Until a SHORT or STANDARD reference record exists, those rows stay empty — add a ledger to fill them.

## How to add a ledger

1. Put the reference record's top-level PDFs under `corpus/<Folder>/` in the eval-corpus bucket (`docs/architecture/eval_corpus_manifest.json` lists what is there; `apps/api/scripts/fetch-test-cases.ts --list`).
2. Write `ledgers/<name>.json` (`ledgers/README.md` has the format: `mustFind[]` with `allOf` / `anyOf` / `pageWindow` / `minSeverity` / `minPreserved`, `verdicts[]`, `provenance`). Optional `thresholds: { minRecall, minPrecision }` override the gate's constants.
3. If `<Folder>` is not `<name>` capitalised, add the pair to `CORPUS_FOLDER_FOR_LEDGER` in `apps/api/src/services/eval-corpus.service.ts`.
4. Merge. The next Monday run (or Run now) picks it up; `GET /ops/eval/ledgers` lists it.

Changing a prompt or the model is an engine change: it is not promotable until the gate is green on every ledger (plan §8 "eval gate is the only approval for an engine change"). The by-hand history is in `manual_vs_engine_gary_2026-09-27.md` and `model_comparison_gary.md`; the CLI `apps/api/scripts/eval-run.ts` still scores a single case for developers.

## Setup (founder, once)

`openssl rand -base64 32` → paste as `EVAL_GATE_TOKEN` on **api-staging** in Render and as the repository secret `EVAL_GATE_TOKEN` in GitHub (Settings → Secrets and variables → Actions). Until the secret exists the scheduled job skips with a notice and pages nobody. `environment_reference.md` has the row.
