# Operations Runbook — Family Case Review

**Audience:** whoever is operating the service (today: the founder). Every entry here was learned operating the real pipeline on the reference cases (Aug 2026), not hypothesized.

## Daily surfaces

- **Ops queue:** `/ops` — days-in-stage, holds, stall chips. A case parked at DOCS_COMPLETE with no analysis run means the enqueue failed (Redis down at records-complete) — re-enqueue via the re-run script below.
- **QA queue:** `/qa` (ATTORNEY role). Dev accounts: `qa@dev.local` / `DevQA2026!x`, customer view `family@dev.local` / `DevFamily2026!x`.
- **COGS:** `GET /ops/cases/:id/cogs` — tokens/pages are ground truth; dollars are env-rate estimates (`MODEL_USD_PER_MTOK_*`). Alert threshold: $54/case (NFR-4).
- **Retention:** `GET /ops/retention-candidates` — cases past the 12-month window. Deletion is ALWAYS a deliberate OPS-4 act per case; never bulk.

## Pipeline operations

- **Re-run a case's analysis** (QA_REVIEW → reject → re-enqueue):
  `pnpm --filter api tsx scripts/rerun-analysis.ts <caseId>`
- **Seed a reference case:** `pnpm --filter api seed:dev -- --corpus "<folder>"` (copies that eval-bucket folder's top-level PDFs and runs the real pipeline).
- **Eval gate:** `pnpm --filter api tsx scripts/eval-run.ts <caseId> docs/evaluation/ledgers/<case>.json` — exits 1 below 100% recall. Run after ANY prompt/model/engine change.
- **Model comparison:** `pnpm --filter api tsx scripts/compare-models.ts <caseId> [model]`.
- **Batch mode:** `ANALYSIS_BATCH=1` (50% price). Budget `ANALYSIS_BATCH_BUDGET_MS` (default 4h) cancels and falls back live per request — a stuck batch cannot break the SLA. **Economics caveat (measured):** parallel batch items race the prompt cache — records over `ANALYSIS_BATCH_MAX_RECORD_TOKENS` (~400k, ≈1,600 pages) automatically run live-sequential instead, where caching is certain (a 695k-token batch run cost ~2× live before this gate).
- **Engines:** `ANALYSIS_ENGINES=claude-opus-5[,claude-fable-5]` — union model; cross-engine agreement is recorded, never used as a veto. `ANALYSIS_SAMPLES=2` is the recall-tuned default.

## Known failure modes (all encountered live, all now handled)

| Symptom | Cause | Handling |
|---|---|---|
| Screen returns 0 findings but run "succeeds" | Historically: category enum / truncation / control chars / whitespace grounding | All four have salvage layers + regression tests; a persistent 0-findings screen now logs the parse reason — read the API log before rerunning |
| Findings dropped as "ungrounded" in bulk | Quote wording drift beyond whitespace | FR-6 is meant to drop these; QA never sees them. Check `droppedUngrounded` vs. persisted ratio; > ~50% suggests prompt drift — run the eval gate |
| Case parked at DOCS_COMPLETE | No ANTHROPIC key, or Redis down at enqueue | Loud in logs by design (SRE-2); re-enqueue via rerun script |
| Textract AccessDenied/Throttling mid-poll | IAM propagation or rate | Poll grace window absorbs 12 attempts; persistent = check IAM policy attach |
| OCR_HALT hold | >30% pages under 0.6 confidence (E-1) | Deliberate money-saver: inspect pages via `/cases/:id/pages`, decide re-scan vs. proceed with customer |

## Server & process discipline (dev)

- **tsx watch does NOT reliably reload.** After ANY worker/service change: kill the PID on port 3001 (`ss -tlnp | grep 3001`) and restart `pnpm --filter api dev`. Never `pkill -f "tsx watch"` — the pattern self-matches the calling shell.
- **The gate is the law:** `./scripts/gate.sh` and branch on ITS exit code. Never pipe it (`| tail` eats the failure — this shipped two broken commits before the rule).
- **Every model call costs real money.** The prompt cache TTL is ~5 min; consecutive runs on the same case within it ride cache reads at 0.1×. Batch mode makes cache economics automatic.

## Blocked-on-external checklist (launch gates)

- Resend key → activates all transactional email (already fully wired).
- Attorney: **BOTH eval ledgers SIGNED (Aug 31)** — launch gate 1's attorney-sign-off requirement met; add reviewer name/bar no. to the ledgers, and transcribe any per-finding packet marks into `verdicts[]` to activate precision scoring. Still open: deadline-vector sign-off (flip `counselSigned: true` in tests/deadline-vectors.json), UPL/product review, privacy-policy review (page is live in DRAFT).
- E&O binding; TX sales-tax determination on the $299 review (Stripe Tax flag ready).
- Production secrets at deploy: `HG_APP_PASSWORD`, `SENTRY_DSN`, `POSTHOG_API_KEY`, `CLAMD_HOST` (compose ships a `scan` profile), cost-rate envs from the current price sheet.
