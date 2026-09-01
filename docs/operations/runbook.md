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
| Browser upload fails instantly — console shows "blocked by CORS policy: Response to preflight" on the s3.amazonaws.com URL | The S3 bucket's CORS AllowedOrigins must list the EXACT origin the browser is on (scheme+host+port). Curl tests pass regardless — only browsers enforce CORS, so this only surfaces in real-browser testing (hit live 2026-09-01 from the LAN IP) | Add the origin to the bucket CORS (currently: localhost:3000, 192.168.154.213:3000, snotnoselegal.com apex+www). One-liner: PutBucketCorsCommand — see git 2026-09-01. If the customer domain ever changes, this list must change WITH the DNS cutover |
| ZIP uploaded but no documents appear | zip worker not running (Redis down at enqueue → customer saw the 503 retry message) or the archive tripped a cap (250MB compressed / 300 entries / 150MB per entry / 1.5GB total) | Check the `zip` queue in /admin/queues; the `zip.ingested` event on the case says exactly what was accepted vs skipped. adm-zip is in-memory — do NOT raise caps without a streaming unzip or a bigger instance (bulk_zip_upload.md §3) |
| Payment succeeded but no case created | `checkout.session.completed` webhook not landing — wrong/stale `STRIPE_WEBHOOK_SECRET` (dev: it changes per `stripe listen` session; prod: endpoint secret from the Stripe dashboard) | Check webhook delivery 200s in Stripe first. The hourly reconciliation sweep will fulfill eventually and MASKS the broken webhook — fix the secret, don't declare victory on the sweep. Test cards (`4242…`, decline/3DS variants — matrix in README §How to test) work only in test mode; prod is verified by the launch-day real-money smoke (go_live_readiness §6) |

## Server & process discipline (dev)

- **tsx watch does NOT reliably reload.** After ANY worker/service change: kill the PID on port 3001 (`ss -tlnp | grep 3001`) and restart `pnpm --filter api dev`. Never `pkill -f "tsx watch"` — the pattern self-matches the calling shell.
- **The gate is the law:** `./scripts/gate.sh` and branch on ITS exit code. Never pipe it (`| tail` eats the failure — this shipped two broken commits before the rule).
- **Every model call costs real money.** The prompt cache TTL is ~5 min; consecutive runs on the same case within it ride cache reads at 0.1×. Batch mode makes cache economics automatic.

## Blocked-on-external checklist (launch gates)

- Resend key → activates all transactional email (already fully wired).
- Attorney: **BOTH eval ledgers SIGNED (Aug 31)** — launch gate 1's attorney-sign-off requirement met; add reviewer name/bar no. to the ledgers, and transcribe any per-finding packet marks into `verdicts[]` to activate precision scoring. Still open: deadline-vector sign-off (flip `counselSigned: true` in tests/deadline-vectors.json), UPL/product review, privacy-policy review, and per-state disclosure review — /disclosures page is live in DRAFT with TX active and FL/CA staged for the §12 expansion (each state's section needs an attorney licensed in THAT state; the purchase-flow ack card set gets its own versioned counsel-gated update per state launch).
- E&O binding; TX sales-tax determination on the $299 review (Stripe Tax flag ready).
- Production secrets at deploy: `HG_APP_PASSWORD`, `SENTRY_DSN`, `POSTHOG_API_KEY`, `CLAMD_HOST` (compose ships a `scan` profile), cost-rate envs from the current price sheet.


## Production operations (learned provisioning night, 2026-08-31/09-01)

**Env vars:** the complete reference — every variable, which service, where its value comes from — is [environment_reference.md](environment_reference.md). The three dev env files and their traps are at the top of it.

### Production database access
- Access is IP-allowlisted: hg-postgres → Networking → add `<your public IP>/32` (`curl -4 ifconfig.me`). Home IPs rotate — if psql suddenly fails with "SSL connection closed unexpectedly", re-check the IP before suspecting anything deeper.
- No local psql needed: `docker compose exec -T postgres psql '<External Connection String>'` uses the compose container's client.
- Migrations/seed can run from the dev box against prod: prefix the command with `DATABASE_URL='<prod external URL>'` (e.g. `… npx prisma migrate deploy`, or the admin seed per environment_reference).

### Auto-delivery (AUTO_APPROVE) — PO decision 2026-09-01
- The founder spot-checks; a human is never the turnaround bottleneck. `AUTO_APPROVE=1` auto-approves each completed run to READY + report + customer email, THROUGH the identical FR-7 verification the human gate uses.
- Runtime quality gates route suspicious runs to human QA_REVIEW instead: incomplete screens, findings below `AUTO_APPROVE_MIN_FINDINGS`, grounding drop-ratio above `AUTO_APPROVE_MAX_DROP_RATIO` (0.5; the RED regression run measured 0.40 vs healthy 0.125).
- `AUTO_APPROVE_SPOTCHECK_PERCENT` (10) of auto-approved cases are flagged; review them AFTER delivery at `GET /qa/auto-approved` (flagged first).
- **GO-LIVE GATE: keep AUTO_APPROVE=0 in production until (a) validation testing passes and (b) counsel signs off on the founder's rewritten disclosures/policy copy** (the current pages still describe human review of every report — the founder owns that rewrite).

### Admin bootstrap & the Sentry drill
- Admin account: seeded as `admin@snotnoselegal.com` (ADMIN role — the seed sets it explicitly; the schema default is ATTORNEY and would be rejected by /ops).
- Alert drill: **"Fire Sentry alert drill"** button on the ops console (or GET `/ops/sentry-test` as ADMIN; script pattern in the session scratchpad). A 500 response proves the throw; **delivery additionally requires SENTRY_DSN on that instance** — dev without a DSN shows the same 500 and sends nothing. Verified end-to-end 2026-09-01 (2 events in Issues). Remaining: the Sentry alert RULE (Alerts → new issue → email) is what actually pages a human.

### Render deploy failure playbook (every entry hit for real)
| Error | Cause | Fix (all committed) |
|---|---|---|
| `EROFS … /usr/bin/pnpm` on `corepack enable` | Render's build image is read-only where corepack symlinks | Invoke via `corepack pnpm …`; version pinned by `packageManager` |
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 11 blocks postinstall scripts; dev stores masked it | `pnpm-workspace.yaml` `allowBuilds:` real booleans (placeholders = not approved) |
| `P1001 can't reach database` at pre-deploy | Internal hostnames are region-scoped; DB defaulted to Oregon vs api in Ohio | Every blueprint resource pins `region`; out-of-region resources must be deleted and re-applied |
| `Prisma.InputJsonValue` missing in web build | Web type-checks against @hg/database; no `prisma generate` in its build | generate step added to web buildCommand |
| `42501 row-level security` on first system write | FORCE RLS binds the owner; Render's owner isn't superuser (dev's is) | Migration 000012: ENABLE without FORCE — owner = system surface, hg_app stays fully bound (founder-approved Option A) |
| Sign-in `error=Configuration` / `NO_SECRET` (dev) | Next.js never reads the root .env | `apps/web/.env.local` with NEXTAUTH_SECRET/URL + API url |

### Local dev network testing
- Web/api bind all interfaces; from a phone/laptop on the LAN use `http://<dev-box-ip>:3000` with `NEXT_PUBLIC_API_URL` pointed at `http://<dev-box-ip>:3001` (root .env + apps/web/.env.local) — CORS dev default already allows the LAN origin.
- Dev servers do not survive reboots; restart per README ("Install & first run"), or ask the assistant — restart = kill the PID on the port, never `pkill -f`.
