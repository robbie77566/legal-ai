# Operations Runbook — Family Case Review

**Audience:** whoever is operating the service (today: the founder). Every entry here was learned operating the real pipeline on the reference cases (Aug 2026), not hypothesized.

## Daily surfaces

- **Ops queue:** `/ops` — days-in-stage, holds, stall chips. A case parked at DOCS_COMPLETE with no analysis run means the enqueue failed (Redis down at records-complete) — re-enqueue via the re-run script below.
- **Family account (what they see):** `/account` — reviews, payments with receipts, sharing, settings, export, deletion request (design/your_account.md). A family's deletion request lands in Overview approvals as ACCOUNT_DELETE.
- **From the dev box:** `pnpm prod:case <email|caseId>` — read-only production case inspection (documents read/unread, runs, events); `pnpm env:drift` — config drift vs the blueprint; Render CLI for logs/shell. Setup and rules: [dev_prod_switching.md](dev_prod_switching.md).
- **After any blueprint change:** `/ops/diagnostics` (did a sync drop a secret?) **and** `pnpm render:inventory` (did it leave an orphaned resource?). Both found real problems in September 2026.
- **Diagnostics:** `/ops/diagnostics` (ADMIN) — the first stop for "it works in dev, not in prod": live probes of Redis, S3, Textract, the Anthropic key + model, and clamd with the api's own credentials; running workers per queue; the pipeline env as the process sees it; and the last failed jobs **with their failure reasons**. The verdict box at the top lists what is wrong, most likely first. (2026-09-09)
- **Case file:** `/ops/cases/<id>` — everything the family can see (uploads with page counts and OCR confidence, analysis, every released report as PDF, share-link opens) plus the contact log and any requests. Support's home page; admins get the same plus Refund and request decisions.
- **Money:** `/ops/money` (ADMIN) — collected / refunded / net / refund rate vs the 5% reserve (cohort view: a refund counts against the week its payment was *sold*), open disputes and support requests, the refund dialog (full or partial, reason, note), the ledger with Stripe deep-links, and **Reconcile with Stripe now** (a healed count above zero means a webhook was missed — fix the secret). **Spend by week, as incurred** (2026-09-11): model / OCR / other per week, cases worked, cost per case; hover a row for the split by model. The By-week table above it is the cohort view (cost charged to the week the case was sold). The Cases list shows **Cost so far** per case for admins. **Stripe test-mode payments** (`cs_test_…`, the 4242 card) are hidden from every number on the page by default — a yellow bar says how many; *Show test-mode* reveals them; **Purge test-mode payments** (type `PURGE TEST`) deletes them and their refund rows, never live or promo rows, audit-logged. Run it once after the live keys go in so the ledger starts clean.
- **Your profile:** `/ops/profile` (the email chip in the ops header) — first, last, phone, email, role, change password, forgot-password link. Sign out is beside it.
- **Team:** `/dashboard/permissions` (ADMIN, linked from the ops nav) — create staff accounts (the invite email explains how to set a password and sign in; **Resend invite** rotates the 24-hour link), change roles. There is no last-admin guard yet: don't remove the only admin.
- **QA queue:** `/qa` (ATTORNEY role). Dev accounts: `qa@dev.local` / `DevQA2026!x`, customer view `family@dev.local` / `DevFamily2026!x`.
- **COGS:** `GET /ops/cases/:id/cogs` — tokens/pages are ground truth; dollars are env-rate estimates (`MODEL_USD_PER_MTOK_*`). Alert threshold: $54/case (NFR-4).
- **Retention:** `GET /ops/retention-candidates` — cases past the 12-month window. Deletion is ALWAYS a deliberate OPS-4 act per case; never bulk.

## Customer emails (what the family receives, and when)

| Email | Sent when | Links to |
|---|---|---|
| Payment received | review purchase fulfilled | case home |
| Your documents are complete | records-complete | progress page |
| We need your help with some pages | OCR halt (E-1) set on the case | documents page |
| Your review is delayed on our side | ops marks "delay ours" | progress page |
| A specialist is giving your review a closer look | auto-QA hold | progress page |
| Your report is ready | QA approval (manual or auto) | report |
| Refund issued | any console refund | case home |
| Confirm your new email address | family starts an email change (sent to the NEW address) | /account/confirm-email |
| Your account email is changing | same moment, to the OLD address | — (says: change your password if this wasn't you) |
| Your re-run is paid for | RERUN purchase fulfilled | documents page |
| One quick question about your report | +7 days after the report | report (share survey) |
| We'll check back when the appeal is decided | a pending-appeal family leaves an email on /check | /check |
| Has the appeal been decided? | ~3 months later, once (daily sweep) | /check |

All are fire-and-forget through the guarded sender; a failed send is logged, never a failed request. A deleted account is never emailed.

## Pipeline operations

- **Re-run a case's analysis** (QA_REVIEW → reject → re-enqueue):
  `pnpm --filter api tsx scripts/rerun-analysis.ts <caseId>`
- **Seed a reference case:** `pnpm --filter api seed:dev -- --corpus "<folder>"` (copies that eval-bucket folder's top-level PDFs and runs the real pipeline).
- **Eval gate:** `pnpm --filter api tsx scripts/eval-run.ts <caseId> docs/evaluation/ledgers/<case>.json` — exits 1 below 100% recall. Run after ANY prompt/model/engine change.
- **Model comparison:** `pnpm --filter api tsx scripts/compare-models.ts <caseId> [model]`.
- **Batch mode:** `ANALYSIS_BATCH=1` (50% price). Budget `ANALYSIS_BATCH_BUDGET_MS` (default 4h) cancels and falls back live per request — a stuck batch cannot break the SLA. **Economics (measured):** parallel batch items used to race the prompt cache (7/10 items re-wrote a 696k record; writes were 88% of a $17 Opus run). **Since 2026-09-11 every batch is preceded by a cache pre-warm** (`ANALYSIS_CACHE_PREWARM=1`): one 1-token live request writes the record to a 1-hour cache, and the batch items read it — look for `cache_read` ≫ `cache_write` on the batch-item log lines, and a `<model>#prewarm` CostRecord row. Records over `ANALYSIS_BATCH_MAX_RECORD_TOKENS` (400k) still run live-sequential; that gate can rise once a warmed run proves reads on every item.
- **Model choice evidence:** evaluation/model_landscape_2026-09.md — measured cost is dominated by cache writes in batch (Fable $40/case as measured vs $15 cache-efficient); free tiers are disqualified by their data terms; Sonnet 5 is the one candidate worth a real comparison.
- **Engine:** production `ANALYSIS_MODEL=claude-fable-5-1` (render.yaml; $10/$50 per MTok, ~3× Opus's output tokens — measured ~$40/case as the batch path runs today, ~$15 cache-efficient). **Dev/CI/tests run `claude-opus-5`** (PO 2026-09-11: close in quality, half the price for testing). Consequence: **the eval gate must be run once with `ANALYSIS_MODEL=claude-fable-5-1` overridden on the command line before real customers**, because a dev run validates Opus, not Fable. **Engines:** `ANALYSIS_ENGINES=claude-fable-5-1[,claude-opus-5]` — union model; cross-engine agreement is recorded, never used as a veto. `ANALYSIS_SAMPLES=2` is the recall-tuned default.

## Known failure modes (all encountered live, all now handled)

| Symptom | Cause | Handling |
|---|---|---|
| Screen returns 0 findings but run "succeeds" | Historically: category enum / truncation / control chars / whitespace grounding | All four have salvage layers + regression tests; a persistent 0-findings screen now logs the parse reason — read the API log before rerunning |
| Findings dropped as "ungrounded" in bulk | Quote wording drift beyond whitespace | FR-6 is meant to drop these; QA never sees them. Check `droppedUngrounded` vs. persisted ratio; > ~50% suggests prompt drift — run the eval gate |
| **Case "in limbo"**: status says DIGITIZING / DOCS_COMPLETE / ANALYZING / ADJUDICATING but the timeline's newest event is hours old and the status page's "Still working — N hours ago" line never moves | The job died and BullMQ gave up (analysis: 2 attempts; an **api restart mid-run** — deploy, plan change, OOM — counts as a death). Nothing marks the case, and the fixed job id `analysis-<caseId>` makes a plain re-enqueue a silent no-op while the dead job is still in Redis | `/ops/cases/<id>` shows a **pipeline card** while the case runs: green "Running · analysis job active · last activity N min ago" or red "Stuck — no live job", refreshed every 20s (2026-09-09). Its **Resume stuck pipeline** button reports right there. It removes the dead job, re-queues documents that never produced text, and re-queues the analysis once every document has text (press again after re-digitizing finishes). It refuses with 409 if the job is genuinely live — then it's slow, not stuck. Timeline gets a `pipeline.resumed` event. (2026-09-07) |
| Analysis job fails within minutes, no usage line, reason `Cannot read properties of undefined (reading 'signal')` | The SDK's stream helper combined with server-side refusal fallbacks (`fallbacks:'default'`): a refused-and-rerouted response comes back in a shape the helper cannot handle. Trips only on records whose content the classifiers flag — so dev runs on clean records never hit it (nine dead prod runs, 2026-09-11) | Fixed: the live path streams without server fallbacks; a refusal is retried once on `ANALYSIS_FALLBACK_MODEL` (default `claude-opus-5` when the engine is Fable), then an empty sample. Any thrown sample error is retried once and then logged WITH its stack — a run can no longer die on one sample |
| Case parked at DOCS_COMPLETE | No ANTHROPIC key, or Redis down at enqueue | Loud in logs by design (SRE-2); re-enqueue via rerun script |
| Documents stay "NOT READ YET" forever; ingestion jobs fail 3× with `clamd … ECONNREFUSED` / `clamd timeout` | **Prod-only path**: `CLAMD_HOST` is set, so every upload is scanned — and the scanner *rejects* (does not quarantine) when clamd is unreachable or slow, so digitizing throws, retries, dies. Dev never exercises this (no `CLAMD_HOST`) | `/ops/diagnostics` → ClamAV row. Render → clamav private service: is it live, on Standard (2 GB), same region, and is the api's `CLAMD_HOST` its hostname? Fix, then **Resume stuck pipeline** on each affected case (re-queues unread documents). (2026-09-09) |
| A queue shows **0 workers** on Diagnostics | Workers start only if Redis answered when the api booted; a Redis blip at boot leaves the api serving HTTP with no workers | Restart the api service; verify workers ≥ 1 on Diagnostics |
| Textract AccessDenied/Throttling mid-poll | IAM propagation or rate | Poll grace window absorbs 12 attempts; persistent = check IAM policy attach |
| OCR_HALT hold | >30% pages under 0.6 confidence (E-1) | Deliberate money-saver: inspect pages via `/cases/:id/pages`, decide re-scan vs. proceed with customer |
| Sign-in shows "The service is temporarily unavailable" for EVERY account | The web service is missing `DATABASE_URL` — NextAuth's authorize() queries Prisma from the Next.js server, not via the api (lost in a blueprint re-apply 2026-09-01; found 09-02). The api's /healthz stays 200, which hides it | Render → web → Environment must have `DATABASE_URL` (blueprint wires it `fromDatabase`; paste hg-postgres Internal Connection String if absent). Verify from outside: a wrong-password POST to /api/auth/callback/credentials must return `error=CredentialsSignin`, not `error=ServiceUnavailable` |
| No emails arrive AND the Resend dashboard shows no attempts, while DNS has the DKIM + `send.` records | The api IS calling Resend and Resend is refusing before it records anything: `[email] send failed: Resend: The snotnoselegal.com domain is not verified` — either the domain sits in **Pending** in Resend (DNS records present but "Verify DNS Records" never clicked / not yet re-checked), or `RESEND_API_KEY` was created in a **different Resend team** than the one holding the verified domain (keys are team-scoped) | Resend → Domains → snotnoselegal.com must read *Verified* in the SAME team that issued the api's key; click Verify DNS Records if pending. Then /ops → Email tile → **Send test email to me** returns the provider verdict verbatim (delivered + id, or the exact error) — use that instead of log spelunking (2026-09-02) |
| Signed in on www, but every ops page is EMPTY (0 accounts, no queue) and /buy says "Your session expired" | The API is rejecting the browser's session: either `COOKIE_DOMAIN=.snotnoselegal.com` is not applied on the **web** service (cookie host-only to www, never sent to api.*) or `NEXTAUTH_SECRET` differs between web and api. Pages used to render empty on a 401 — the ops shell now shows a red banner (2026-09-02) | DevTools → Application → Cookies → `__Secure-next-auth.session-token` **Domain** column: `www.snotnoselegal.com` = fix COOKIE_DOMAIN on web; `.snotnoselegal.com` = fix the secret to be IDENTICAL on both services. Redeploy, sign out and back in |
| Browser upload fails instantly — console shows "blocked by CORS policy: Response to preflight" on the s3.amazonaws.com URL | The S3 bucket's CORS AllowedOrigins must list the EXACT origin the browser is on (scheme+host+port). Curl tests pass regardless — only browsers enforce CORS, so this only surfaces in real-browser testing (hit live 2026-09-01 from the LAN IP) | Add the origin to the bucket CORS (currently: localhost:3000, 192.168.154.213:3000, snotnoselegal.com apex+www). One-liner: PutBucketCorsCommand — see git 2026-09-01. If the customer domain ever changes, this list must change WITH the DNS cutover |
| ZIP uploaded but no documents appear | zip worker not running (Redis down at enqueue → customer saw the 503 retry message) or the archive tripped a cap (250MB compressed / 300 entries / 150MB per entry / 1.5GB total) | Check the `zip` queue in /admin/queues; the `zip.ingested` event on the case says exactly what was accepted vs skipped. adm-zip is in-memory — do NOT raise caps without a streaming unzip or a bigger instance (bulk_zip_upload.md §3) |
| Stripe dashboard shows a refund but the case still says paid | Pre-2026-09-07 the `charge.refunded` webhook matched a payment-intent id against the checkout-session id column and updated nothing | Fixed: refunds and disputes match on `Payment.paymentIntentId` (backfilled on first refund). Refund from the console (`/ops/money` → Refund…), never from the Stripe dashboard, so the ledger, case event, and audit row are written together |
| A family disputed a charge | Stripe holds the funds for 7–21 days; the console blocks refunds on a disputed payment | `/ops/money` → Needs a decision → **Assemble evidence** (the E-6 disclosure archive). A lost dispute is recorded as a chargeback refund automatically |
| Support needs a refund or deletion done | Support cannot refund or delete — by design | They raise a request from the case file; it lands in your Overview **Approvals** (and Money → Needs a decision) with the reason. Approve runs it under your name; Decline needs a line they will read |
| New staff member never got the invite | `RESEND_API_KEY` unset or Resend refusing (see the email row above) | The permissions page shows the setup link when delivery fails — send it another way. **Resend invite** issues a fresh 24-hour link |
| Payment succeeded but no case created | `checkout.session.completed` webhook not landing — wrong/stale `STRIPE_WEBHOOK_SECRET` (dev: it changes per `stripe listen` session; prod: endpoint secret from the Stripe dashboard) | Check webhook delivery 200s in Stripe first. The hourly reconciliation sweep will fulfill eventually and MASKS the broken webhook — fix the secret, don't declare victory on the sweep. Test cards (`4242…`, decline/3DS variants — matrix in README §How to test) work only in test mode; prod is verified by the launch-day real-money smoke (go_live_readiness §6) |

## Server & process discipline (dev)

- **tsx watch does NOT reliably reload.** After ANY worker/service change: kill the PID on port 3001 (`ss -tlnp | grep 3001`) and restart `pnpm --filter api dev`. Never `pkill -f "tsx watch"` — the pattern self-matches the calling shell.
- **pnpm on this dev box (snap VS Code):** the snap's pnpm store path changes with every VS Code snap revision (`~/snap/code/<rev>/.local/share/pnpm/store`), after which any install fails with `ERR_PNPM_UNEXPECTED_STORE`. Fix: pass `--store-dir <the path printed in the error's "currently linked from" line>` to that install, or `pnpm install` once to relink. Also: never run `corepack pnpm lint/typecheck` at the root — turbo's child processes inherit corepack and refuse the `packageManager` pin ("configured to use 11.1.0, current is 11.5.2"); plain `pnpm` from PATH is what the gate uses and it works. pnpm 11 also auto-writes `<pkg>: set this to true or false` placeholders into `pnpm-workspace.yaml` `allowBuilds` — replace with `true` (this exact placeholder broke a Render build on Aug 31 and a local install on Sep 2).
- **Gate fails with `too many clients already` / `remaining connection slots are reserved`:** the api suites run one worker per test file, each with two Prisma clients whose default pool is 2×CPUs+1 — on a many-core box that overruns Postgres's 100-connection cap once the suite is large enough (hit 2026-09-08 at 18 api files on 20 cores). Fixed structurally: `packages/database/index.ts` caps `connection_limit=3` per client when `NODE_ENV=test`, and `apps/api/vitest.config.ts` caps api workers at 6. If it recurs, lower those before touching Postgres.
- **The gate is the law:** `./scripts/gate.sh` and branch on ITS exit code. Never pipe it (`| tail` eats the failure — this shipped two broken commits before the rule).
- **Every model call costs real money.** The prompt cache TTL is ~5 min; consecutive runs on the same case within it ride cache reads at 0.1×. Batch mode makes cache economics automatic.

## Blocked-on-external checklist (launch gates)

- Resend key → activates all transactional email (already fully wired).
- Attorney: **BOTH eval ledgers SIGNED (Aug 31)** — launch gate 1's attorney-sign-off requirement met; add reviewer name/bar no. to the ledgers, and transcribe any per-finding packet marks into `verdicts[]` to activate precision scoring. Still open: deadline-vector sign-off (flip `counselSigned: true` in tests/deadline-vectors.json), UPL/product review, privacy-policy review, per-state disclosure review, AND the brand-site counsel batch (2026-09-02: the four /learn articles, /how-it-works, /about, /pricing claims — all characterize legal processes or output; /sample-report is BUILT (PO decision 2026-09-02: proceed, counsel reviews everything in one batch) — fictional-case banner leads the page) — /disclosures page is live in DRAFT with TX active and FL/CA staged for the §12 expansion (each state's section needs an attorney licensed in THAT state; the purchase-flow ack card set gets its own versioned counsel-gated update per state launch).
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
