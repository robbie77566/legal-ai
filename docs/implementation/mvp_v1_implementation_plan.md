# MVP v1.0 Implementation Plan — Family Case Review

**Status:** Approved for execution · **Owners:** Engineering + Product · **Last updated:** 2026-08-29
**Companions:** `../architecture/mvp_v1_system_design.md` (the architecture this plan builds — §ref'd throughout) · `../specifications/mvp_v1_prd.md` (US-x/FR-x/NFR-x/launch gates) · `../specifications/mvp_workflow_design.md` (S0–S7) · `../specifications/mvp_v1_engineering_notes.md` (ENG-1..11) · `../specifications/internal_operations_spec.md` (OPS/SRE) · `../specifications/product_roadmap.md` (v1.1–v4 — the post-MVP lens for every deprecation call)

---

## 1. Purpose and method

This plan turns the approved system design into a sequenced, estimated build with explicit acceptance criteria, and it settles the fate of every piece of legacy code in the repo. Two rules govern it:

1. **The system design's dependency order is the schedule's skeleton.** Nothing public ships before the security foundation (M0); the case-event spine (M1) precedes every feature that reads or writes case state.
2. **Deprecation decisions are made against the roadmap, not just against v1.0.** Code is deleted only when v1.1–v4 would rebuild it anyway (or when git history is a sufficient archive); code with a live future (ModelRouter/Ollama, MCP stdio servers, side-by-side viewer components, pgvector schema) is kept, parked, or config-gated — never casually removed. Section 5 is the full register.

## 2. Delivery approach and assumptions

- **Team:** 2 senior full-stack engineers + 1 product owner/founder; **a frontend contractor for the ~6 ew Daybreak track** (the two-track schedule in §4 does not close without one — see the capacity risk in §6); retained TX post-conviction counsel for the launch-gate review (~$2–5k budgeted); 1 trained QA reviewer onboarded during M5.
- **Cadence:** two-week sprints; trunk-based development on `main` with short-lived feature branches; **branch protection + required review + CODEOWNERS on `main` from M0** (direct pushes end); CI (already landed) grows the gates in §7 per milestone.
- **Environments:** local Docker Compose (Postgres+pgvector, Redis; Neo4j moves to an optional profile — §5); staging with Stripe test mode + **test clocks** and a seeded reference-case fixture; **production exists (dark) from M2** — deploys are rolling with health checks and worker drain, migrations follow the expand/contract convention (backward-compatible one release, SRE-5).
- **Walking skeleton (integration de-risker):** by the end of S3, a $0 test-mode purchase flows a 10-page fixture through one real Tier-2 screen, a stub QA approve, and a rendered PDF, **deployed on staging end-to-end** — exercising every risky seam (webhook → case creation → events/SSE → batch polling → render) months before the milestones formally meet. This is an M2 exit criterion.
- **Language standard:** TypeScript strict everywhere — all workspaces extend the shared `@hg/tsconfig` base and `pnpm typecheck` gates CI (**landed Aug 2026**, ahead of M0: strict enabled across web/api/packages, phantom deps declared, LangChain v1 API drift fixed, two dead non-compiling files from the §5 register deleted early).
- **Definition of done (every story):** code + tests (integration tests hit real Postgres/Redis via testcontainers — the current mock-everything pattern is retired), typecheck clean, audit events written where the spec requires, analytics events per the `snl.*` taxonomy, doc-diff landed in the owning spec, a11y/reading-level lint green on Daybreak surfaces.
- **Estimate discipline:** figures below are engineering-weeks (ew) of focused work, ranges honest. Total ≈ 36–42 ew **plus a 15% buffer** → **15–17 calendar weeks with two engineers + the Daybreak contractor** → launch-ready around **late December 2026**, with the attorney review and eval gate as the long poles to start early. A mid-point re-estimate checkpoint lands at S4.
- **Pre-agreed scope-shed order** (cut in this order if S6 slips; the QA gate and disclosure archive are never on this list): share-link access log → re-run diff (US-6 ships "re-run", diff view follows) → Ops canned responses (OPS-6) → E8 stall-nudge emails → weekly-report automation (PMX-1 runs manually first).

## 3. Milestones

Each milestone lists scope → key tasks → acceptance criteria (AC). System-design section references in parentheses.

### M0 — Security foundation & repo hygiene (3 ew) — *blocks everything public*

Scope: eliminate the P0 defects (design §1) and clear the legacy underbrush (§5 register, "delete now" column).

> **Progress (Aug 2026):** API JWT auth landed — global verified-session hook (`plugins/auth.ts` + `@hg/auth` session-token helpers), all `x-tenant-id`/`x-user-id` header trust removed, previously-unauthenticated upload and case-access-grant routes now enforce CaseAccess, SSE gated + heartbeat, CORS pinned with credentials, Bull Board ADMIN-gated, typed web client on `NEXT_PUBLIC_API_URL`, `withTenant` on formerly-bare queries, AuditLog FK dropped per §11a.2 (case delete no longer throws; audit wired on access grant/revoke), empty migration removed, tests rewritten against signed tokens incl. a forged-header regression test. **RLS hardening landed:** baseline init migration created (the schema had only ever been `db push`ed — `migrate deploy` could not work on a fresh DB), `WITH CHECK` added to every policy, RLS extended to the previously-unprotected `CaseAccess` table, and a non-superuser `hg_app` role created — the audit found the app connects as a superuser, which **bypasses RLS entirely**, so the policies were inert until now; live-Postgres integration tests (8, replacing the mock suite) prove isolation both directions, the append-only trigger, and carry a superuser-bypass canary. CI switched from `db push` to `migrate deploy` (push skipped all RLS SQL) and from `turbo test` (which matched nothing and silently ran zero tests) to the real vitest workspace. Backend delete-now register executed: export/webhooks routes, duplicate export/storage services, media worker + queue, mock Clio OAuth callback, `socket.io`/`docx` deps. **Connection-role split landed:** `withTenant` now runs on a dedicated `hg_app` (non-superuser) Prisma client — RLS is live in the application path, proven by integration tests against the exported helper; the owner connection remains only for migrations, auth bootstrap, and admin ops. **Observability/limits landed:** Sentry (DSN-gated) + pino redaction of auth/cookie headers; Redis-backed global rate limiting (fail-open when Redis is down) with a tighter presign limit. **CI scanning landed:** gitleaks, `pnpm audit --audit-level critical` gate, Dependabot; the first audit run surfaced and fixed three real criticals — the Next.js middleware **authorization-bypass** CVE (directly hit our `withAuth` protection; → 14.2.35), next-auth email-normalization bypass (→ 4.24.15), vitest (→ 3.x). **Remaining for M0:** eval-corpus bucket move (blocked on bucket provisioning); production secrets (`HG_APP_PASSWORD`, `SENTRY_DSN`) at deploy.

- API JWT auth preHandler; remove all `x-tenant-id`/`x-user-id` header trust (§10.1). Typed web API client on `NEXT_PUBLIC_API_URL` (kills 14 hardcoded localhost sites).
- RLS: add `WITH CHECK` to every policy; route all tenant queries through `withTenant`; replace the mocked `rls.test.ts` with integration tests against real Postgres; fix the empty `20260607` migration.
- CORS pinned; Redis-backed rate limiting on auth/eligibility/presign/webhooks; Bull Board behind ADMIN.
- Audit service rewritten against real exports and wired into permissions/case mutations (first real `AuditLog` rows).
- Env cleanup (`GEMINI_API_KEY` unification); execute the "delete now" register entries; remove `socket.io` deps.
- **Observability baseline moves here, not M6:** Sentry (web/API/workers) **with a beforeSend scrub enforcing zero case-content/PII in error payloads** (data class C1/C2 — design §11a.1), structured logging under the same rule, and basic OTel tracing land in M0 (~a day of setup) — M2–M5 are never built blind. M6 keeps dashboards, alert routing, and runbooks.
- **CI hardening:** secret scanning (gitleaks), dependency audit + Renovate/Dependabot, CODEOWNERS + branch protection on `main`.
- **Backups & DR (first pass):** Postgres automated backups with PITR, S3 versioning + lifecycle rules (SSE-KMS per env, TLS-only bucket policies), and stated RPO/RTO targets. Backups expire ≤35 days so OPS-4 deletions propagate fully within that window — the bound named in the privacy policy (design §11a.2).
- ENG-10: move remaining `Test Case Files/` content to the encrypted eval bucket, land the manifest, decide the history rewrite (recommended: `git filter-repo` now, while clone count is low).

**AC:** an unauthenticated request to any tenant route is a 401; a forged-tenant JWT cannot read or **insert** cross-tenant rows (proven by integration test); repo contains no mocked route reachable in production; errors from any service appear in Sentry; CI green including secret/dependency scans.

### M1 — Case spine (3 ew)

> **Progress (Aug 2026):** first slice landed. `packages/case-lifecycle` ships the ENG-1 machine (states, holds, legal transitions incl. refund/deletion reachability, `IllegalTransitionError`), the customer-visible stage mapping (internal loops hidden; hold overlays; copy keys not strings), and the versioned event registry — every payload schema strict/PII-minimal with a structural test that smuggled keys throw. Schema migration `case_spine`: `CaseStatus`/`Lane` + projection/hold/SLA columns on Case, append-only `CaseEvent` (denormalized tenantId, no FK — survives deletion per §11a.2; trigger allows only the outbox `publishedAt` stamp), `EligibilityDraft`, `ChecklistItem`, `UploadSession`, RLS with `WITH CHECK` on all new tenant tables. `appendCaseEvent` updates the projection (status/holds/one-time SLA stamp) in the same transaction; `publishCaseEventOutbox` tails with FOR UPDATE SKIP LOCKED and publishes the customer view (at-least-once), wired as a loop in the API with graceful shutdown. 20 new tests (10 domain, 10 live-Postgres incl. forged-tenant WITH CHECK rejection and outbox retry). **M1 COMPLETE (Aug 31, e71488c):** the outbox is the ONLY publisher on the SSE channel (ingestion's ad-hoc publish removed; legacy entity.worker deleted per the deprecation register); eligibility-draft endpoints landed in M2.

- `packages/case-lifecycle`: state enum, transition map, customer-visible mapping, event-type constants (§4) — **event payloads defined as versioned JSON Schemas, validated in CI, PII-minimal by construction** (IDs/enums/counts only — never document text; ENG-12, design §11a.5).
- Schema migration set 1: `CaseStatus`/lane/vehicle/holds on Case, `CaseEvent` (append-only trigger), `EligibilityDraft`, checklist + upload-session tables (§5).
- Event append + projection helper (status column updated transactionally); SSE projector publishing the customer mapping; SSE route auth + case-access check (§9).
- **Transactional outbox for event publishing:** `CaseEvent` append and the Redis publish are a classic dual-write — a crash between DB commit and publish would silently desync the tracker. Events are published from an outbox tail (or re-published from the DB on gap detection), never fire-and-forget alongside the commit.
- **Job robustness conventions (set here, followed everywhere):** idempotent handlers keyed by event/job id; dead-letter queues with an Ops-visible surface; per-queue concurrency limits sized to provider quotas; graceful drain on deploy.
- **Minimal `packages/config` flags land here** (moved up from M6): server-side flags gate risky merges throughout the build; the audited admin UI (PMX-2) still arrives in M6.

**AC:** illegal transitions throw; tracker stage for any case is derivable from events alone; killing the process between commit and publish loses no tracker update (outbox proven by test); a poisoned job lands in the DLQ, not a retry loop; SSE stream requires auth and never crosses cases; `docs.stalled_7d` derives from the stream.

### M2 — Commerce & identity (4 ew)

> **Progress (Aug 2026):** core landed. `CLIENT` role + Payment ledger (no-FK, RLS'd, 7y class) + `PaymentEvent` idempotency ledger in schema; `/buy/account` as the sole self-registration surface (CLIENT + single-member tenant, one transaction, enumeration-safe); CLIENT-only `/checkout/session` (env-priced, 503 unconfigured); signature-verified Stripe webhook with **two-level idempotency** (event-id ledger + unique session id) whose fulfillment creates Case + access + lifecycle events (`→ AWAITING_DOCS`) + subsequent-writ hold and promotes-then-deletes the S0 draft in one `withTenant` transaction; hourly reconciliation interval; dispute webhook logged pending the M6 E-6 console. Eligibility-draft endpoints closed out M1's remainder. 6 live-Postgres tests cover replay/re-drive/refund/safety paths. **Remaining for M2:** `packages/email` (receipts, transitions, password reset — Resend key needed), disclosure-ack capture + archive, web `/buy` flow + middleware role matrix (Daybreak track), Stripe test clocks in CI, walking-skeleton exit criterion.

- `CLIENT` role migration + middleware role matrix + API enforcement (§10.2; auth design §12).
- `/buy` flow API: disclosure-ack capture (archived per case — E-6), account+tenant creation, Stripe Checkout session; `payment.succeeded` webhook with `PaymentEvent` idempotency ledger; hourly reconciliation job (§7).
- `packages/email` (Resend + React Email): receipts, stage transitions, bounce/complaint webhooks → Ops queue. Password reset flow shipped (pulled into v1.0 per ENG-7).
- Eligibility draft endpoints (anon token, 30-day TTL, promote-and-delete).
- **Stripe completeness:** integration tests use Stripe test clocks; `charge.dispute.created` webhooks trigger the E-6 evidence flow (not just an archive that Ops remembers to export); Radar defaults reviewed. **PO flag: Texas taxes data-processing services (80% of the charge) — whether the $299 review is taxable needs an accountant's answer before launch; Stripe Tax is the cheap insurance.** Tracked as an M7 gate item.
- **Walking skeleton is this milestone's exit criterion** (§2): test-mode purchase → fixture doc → one real screen → stub QA → rendered PDF, on staging.

**AC:** a purchase in Stripe test mode yields exactly one Case with disclosures archived, receipt sent, and events written — including when the webhook is dropped (reconciliation heals it); a dispute webhook produces the evidence packet trigger; a CLIENT token cannot reach any staff surface; reset flow works end-to-end; the walking skeleton runs on staging.

### M3 — Intake pipeline (5–6 ew)

> **Progress (Aug 2026):** interview→checklist landed (lane templates + subsequent-writ items in `@hg/case-lifecycle`, idempotent interview route seeding county/statute-at-date year), checklist home endpoint with the customer-visible stage, `doc.uploaded` events on upload completion, and the once-only records-complete transition stamping the SLA clock and enqueueing analysis (race-proof jobId). **Real digitization landed (AWS provisioned, Aug 2026):** S3 buckets live (documents + eval-corpus: SSE, versioning, TLS-only policy, public-access block, ≤35-day noncurrent-version expiry — the §11a.2 bound — CORS for browser PUTs; presigned round-trip verified). The mocked ingestion worker is RETIRED: the real worker fetches bytes from S3 and digitizes via pdf-parse (born-digital, per-page) with Textract fallback for scans/images (per-page confidence = the NFR-6 signal); `DocumentPage` billable ledger with exact-hash dedup (§11a.3: duplicates leave billing AND analysis; proven by test), real chunks with page provenance, `doc.ocr_done` events, the E-1 low-confidence halt (>30% pages under 0.6 → OCR_HALT before Tier-2 spend), the `/cases/:id/pages` meter, real counts in `docs.complete`, and OPS-4 now deletes S3 objects incl. versions. **ENG-10 complete:** reference corpus (101 files, 2.19 GB) uploaded to the encrypted eval bucket with a committed checksum manifest. **M3 polish landed:** echo-back classification (deterministic kind patterns → checklist item UPLOADED → customer confirm/correct endpoints with orphan-item reset; the Tier-1 model classifier replaces the heuristics in M4), malware-scan seam (clamd INSTREAM over TCP when `CLAMD_HOST` set — quarantine flow: doc.quarantined event + S3 object removed + never digitized; unscanned dev uploads logged loudly), the ENG-3 overage gate at records-complete (402 with blocksNeeded; a purchased block raises the allowance), and the fulfillment kind fix — overage/re-run purchases now attach to their existing case (rerun.purchased with run number) instead of wrongly creating a new one. **Aug 31:** HEIC→JPEG conversion landed (wasm libheif, no native deps; e71488c); clamav in compose behind the `scan` profile. **Deferred by scope decision:** multipart/resumable uploads and perceptual near-dup hashing — exact-hash dedup + 5,000-page cap suffice at launch volumes; revisit at NFR-5 scale.

- Presign hardening (allowlist, size caps), multipart/resume sessions, HEIC conversion, ClamAV scan worker with quarantine messaging (ENG-4).
- Page normalization + perceptual/content-hash dedup; `DocumentPage` as the billable authority; meter endpoint with `duplicatesIgnored` (ENG-3). **Dedup semantics per the data review:** exact-hash duplicates leave billing and analysis; perceptual near-duplicates leave billing but **stay in the analysis set** — dedup must never drop potential evidence. Page-count reconciliation (uploaded = normalized = billable + excluded) runs at `DOCS_COMPLETE` and blocks the run on mismatch (§11a.3). In-flow overage Checkout.
- OCR provider bake-off (Textract vs Document AI on the corpus's worst scans — design §12.3) then integration; per-page confidence; E-1 halt with customer options (re-upload / partial / refund).
- Interview → checklist generation; Tier-1 classification → echo-back events; `docs.complete` written once, SLA clock stamped via the business-day calendar service (ENG-9).

**AC:** a duplicate/shoebox re-upload never increments the meter; a near-duplicate page excluded from billing still appears in the analysis chunk set (proven by test); page-count reconciliation catches an injected mismatch; an infected file quarantines with plain-language messaging and never reaches ingestion; a low-OCR case halts **before** Tier-2 spend; records-complete fires exactly once per run.

### M4 — Analysis pipeline (7–8 ew) — *start immediately after M1; runs parallel to M2/M3 against fixtures*

> **Progress (Aug 2026):** the orchestration spine landed. ENG-2 schema (AnalysisRun/Finding/FindingCitation, RLS'd), `runAnalysis` driving the machine through events with lane-selected screens, zod-validated model output with bounded retry, **FR-6 grounding as a hard filter** (ungrounded quotes dropped and counted, proven by test), citation anchors (chunkId + excerptHash), `verifyFindings` (FR-7) at approval and every render, injectable `AnalysisModel` seam (Gemini wired; no-key = honest DOCS_COMPLETE parking, never fake findings), analysis queue/worker with race-proof job ids. **Remaining:** MCP statute/registry tools; deadline-engine intake/report integration. **Batch API LANDED (Aug 31, 78f4793):** invokeMany seam on AnalysisModel — one Message Batch per engine per run (50% price, shared record prefix for best-effort in-batch cache hits), ANALYSIS_BATCH_BUDGET_MS stage budget cancels and falls back live per request; parse/ground/persist shared with the live loop (parseFindingsText + groundUnion extracted). **Validated live on Gary (Aug 31):** 5-screen batch ended in 6.7 min; in-batch cache hits were PERFECT (1 write of 282k, 4 reads of 282k); 5/5 parsed, 31 findings grounded; est. $1.75/run at batch prices (~47% below the live-cached ~$3.30) — enabled in dev (ANALYSIS_BATCH=1). **Multi-engine union LANDED (Aug 31, 44423d8):** runAnalysis accepts AnalysisModel[] (ANALYSIS_ENGINES comma list), findings carry Finding.engine, cross-engine duplicates count as adjudication AGREEMENTS in adjudication.completed (coverage-union model per the measured comparisons) — the Advanced-tier engine capability; default stays single-engine. **Deadline engine LANDED (Aug 31, 02643c5):** pure civil-date FR-5 module in @hg/case-lifecycle (finality per 2244(d)(1)(A) incl. the 90-day cert window; AEDPA tolling with the month-11 trap encoded; laches urgency past 5y) + an 11-scenario vector table independently re-computed before pinning — `counselSigned=false` is recorded in the table and CI warns until an attorney flips it (the §7.2 sign-off act). Report/interview integration (capturing judgment/appeal dates, rendering the posture) remains. **CostRecord LANDED (Aug 31, 6272532):** RLS'd ledger, model+OCR wiring fire-and-forget, env-configured rates, `/ops/cases/:id/cogs` rollup. **Eval harness LANDED (Aug 31):** deterministic scorer (`eval.service.ts`, CI-tested) + `eval-run.ts` CLI gate + canary ledgers for both reference cases (`docs/evaluation/ledgers/`) — recall 100% (9/9 must-finds incl. the Willetts seated juror) on the current engine; **ATTORNEY SIGN-OFF RECEIVED (Aug 31) for BOTH reference-case ledgers** — launch gate 1 (eval green + attorney sign-off) is met on the current engine (EVAL GREEN 9/9); the precision/severity-calibration half activates when per-finding verdicts are transcribed. **Per-screen transactions** — DONE (abb71c9): one short transaction per screen; model calls outside any transaction. **Live-run hardening ledger (Aug 30, both reference cases)** — all landed, each from a real failure: (1) category enum voided whole screens → bounded free-text category + per-finding salvage (d1c7090); (2) 16k max_tokens truncation → 32k + truncated-array recovery (65f29d1); (3) verbatim quotes carry raw transcript control chars → string-aware escape pass (c153d12); (4) line-broken/tabbed transcripts defeated exact grounding, silently dropping TRUE findings → whitespace-normalized grounding in FR-6 + FR-7, hash anchors unchanged (e2511ae); (5) **voir_dire screen** added to the TRIAL lane after a cross-model check caught a seated juror married to the victim's supervisor that no screen covered (e2511ae); (6) **case-context pre-pass** (cea8deb): one cached-read call derives defendant/victim/witnesses and prepends to every screen — required for cross-referencing findings (the Willetts juror surfaced ONLY with it, then at dispositive severity). **New remaining item — multi-engine union ('Advanced' tier candidate):** run 2+ engines through the executeScreen seam and union findings into QA; the Opus-vs-Fable comparisons (docs/evaluation/) show engines complement (~+50–77% coverage) rather than contradict — reframes cross-model adjudication as coverage union first, arbitration later.

- Chunk-freeze per `AnalysisRun` (immutable, hashed, page-provenanced) (§6.1).
- `ModelRouter` tiers wired to real providers; batch submit + delayed-job polling + stage-budget watchdog with standard-API fallback (`BatchJob`, ENG-6); prompt-cache prefix stability verified via `usage.cache_read_input_tokens`.
- Screen set per lane (FR-1..5, FR-5a, FR-11); subsequent-writ §4-exception tagging; deadline engine on the shared calendar.
- **Deadline engine gets its own verification artifact** (FR-5 is "launch-blocking precision," not an ordinary task): a **counsel-signed table of dated test vectors** — finality incl. the 90-day cert window, pre-filing elapsed time, tolling start/stop, the untolled post-CCA-denial gap, laches scenarios — run as golden tests in CI, with the rule set versioned. That table *is* the gate-2 review input for this component; counsel reviews behavior, not prose.
- **Model-output engineering discipline:** every screen's output is zod-validated structured data with bounded retries on invalid responses; prompts are versioned with a cheap golden-fixture regression suite in CI (a ~20-page fixture per screen — the full eval corpus is too heavy for CI); every `AnalysisRun` records model/prompt/router-config versions so a QA'd report is **reproducible**.
- **Provider data controls:** an explicit task to enable zero-data-retention / no-training options with Anthropic and Google and verify them — "never used to train AI" (NFR-3) is currently a marketing promise with no engineering task behind it.
- Tier-3 synthesis + Gemini adjudication; `Finding`/`FindingCitation` writes per ENG-2; grounding hard filter with excerpt-hash re-verification (FR-6/7).
- LangGraph rebuild: supervisor graph, real ToolNode loop, checkpointer registered; invoked only from the analysis worker.
- Cost telemetry: `CostRecord` on every model/OCR call incl. batch metadata; COGS query + $54 alert (NFR-4).
- Eval harness integration: replayable per-screen outputs; both reference cases runnable from the bucket manifest.

**AC:** full pipeline run on the Gary reference case completes within stage budgets on batch pricing; every rendered finding's citations re-verify; adjudication disagreements carry the QA flag; the deadline-engine vector table passes in CI and carries counsel sign-off; an invalid model response never crashes a run or produces an unvalidated finding; per-case COGS is a single query returning a number within budget.

### M5 — QA console & report (5 ew)

> **Progress (Aug 2026):** the human loop closes in-browser. `/qa` API + Industrial Authority web console (queue with §4-mode chips, citation excerpt + hash view, inline Part A edits → `ai_human_edited` + audit, approve → FR-7 gate → findings snapshot `Report` → READY, reject → QA_REJECTED; all audit-logged). Customer report: `GET /cases/:id/report` (404 pre-READY, per-render FR-7 re-verification — chunk tampering after approval provably drops the finding) + the Daybreak report page (interstitial by choice, TL;DR, semantic grouping with neutral nothing-found, complete-inventory framing, no-advice/no-privilege footer). **M5 COMPLETE except email activation (Aug 31):** PDF rendering landed (packages/reports, b29a07b + deadline section 236fe39); share-with-a-lawyer links were S7; re-run diff (`/qa/cases/:id/run-diff`) + Flesch-Kincaid reading-level lint on every QA finding (c2532e7); delivery email fully wired — BLOCKED only on the Resend key.
> **Daybreak track progress:** landing (§2 canon), S0 wizard on the unit-tested pure routing module, buy flow (disclosures → account → ack → Checkout), buy/success, interview, checklist/documents home with shoebox + how-to expanders + celebrated records-complete, five-stage tracker on the outbox channel. **Remaining:** echo-back cards + page meter (needs M3 ledger), next-steps/consent surfaces, i18n externalization pass, a11y CI.

- `/qa` queue (adjudication-flagged first), side-by-side verify with click-through to frozen page images, edit (provenance → `ai_human_edited`, audit-logged), approve/reject; approve writes the findings snapshot + template version (ENG-8/ENG-11).
- `packages/reports`: Part A/B React templates (i18n-keyed, `es` stubbed), Chromium tagged-PDF render, reading-level lint on Part A strings; deadline/tolling copy exactly per PRD FR-5 language rules.
- Cited-page image pre-render at approval; share-with-a-lawyer links (hashed token, expiry, revocation, access log); delivery flow with `DELIVERED`-on-confirmation and bounce → Ops (§8, §9).
- Re-run diff on `Finding.stableKey` (US-6).

**AC:** a QA reviewer completes a reference case in ~30 min; nothing customer-visible exists pre-approval; a template change after approval does not alter an in-flight report; a bounced delivery email leaves the case `READY` and opens an Ops item.

### M6 — Ops console, observability, analytics (5 ew)

> **Progress (Aug 2026):** the Ops console core landed — `/ops` API + Industrial Authority UI: OPS-1 queue (days-in-stage, stall/hold/§4 chips), per-case event timeline, OPS-3 disclosure-archive export (audited), OPS-7 delay-ours (hold + visible date extension, clearable), OPS-2 Stripe-linked refund (honest 503 unconfigured; REFUNDED transition + audit), and **OPS-4 scoped deletion enforced by test**: content hard-deleted, payment ledger/ack archive/event-audit skeleton retained by design, deletion certificate written into the surviving stream. Building it surfaced and fixed a real design gap — AuditLog RLS scoped through Case broke post-deletion audit writes; fixed via denormalized `AuditLog.tenantId` (migration w/ one-time trigger-disabled backfill), matching the CaseEvent design. **S7 also landed** (US-5/ENG-8): ConsentGrant (default off, evented, revocable), hashed-token ShareLink with access log, anonymous `/shared/:token` Part B view with the R-7 notice, and the Daybreak next-steps + shared pages. **Aug 31:** operations runbook landed (docs/operations/runbook.md — every entry from live operation); snl.* PostHog capture wired env-gated at the four funnel points (7801b5c); retention candidates endpoint (`/ops/retention-candidates` — listing only, deletion stays a deliberate OPS-4 act). **Deferred to deploy/scale:** observability dashboards + alert routing (need the deployed environment), reporting-schema ELT (PostHog covers launch analytics), reviewer-management UI (single reviewer at launch).

- `/ops` per OPS-1..7: case queue with stall/deadline flags, audited Stripe-linked refunds computed from the page authority, disclosure-archive export, **scoped** retention/deletion workflow (hard-delete of case content incl. S3 versions + entity rows + report artifacts; payment ledger / disclosure archive / pseudonymized audit-event skeleton retained per the §11a.2 matrix, with the console showing the operator exactly what is deleted vs. retained), delay-ours with honest tracker copy, reviewer management on existing RBAC.
- **Reporting data path:** nightly ELT into a PII-stripped reporting schema (read replica at this scale); PM/UX dashboards read it, never the production OLTP; finance marts built from server-side mirrors + the payment ledger (§11a.6).
- Observability build-out on the M0 baseline: dashboards, pipeline-health board, SRE-2 alert routing; SRE-4 runbooks written (stall, provider outage/batch fallback, S3, webhook loss, low-OCR cohort).
- Self-hosted PostHog + `snl.*` events wired everywhere; server-side mirrors for money/pipeline facts; `packages/config` flags with audited admin UI (PMX-2); weekly funnel report automated (PMX-1).

**AC:** every promise in the customer specs (refund, deletion, delay honesty, SLA authority) is executable from `/ops` with an audit row — zero manual SQL paths remain; a simulated provider outage produces the truthful tracker state, never fake progress.

### M7 — Launch hardening & gates (3–4 ew, overlaps M5/M6)

- End-to-end dry runs on both reference cases: purchase → upload → report → refund path (gate 4).
- Eval green per NFR-1 on both cases (gate 1); attorney review package delivered (templates, copy, T&C, US-0 routing, deadline rules, §4 handling, R-6 structure — gate 2); E&O bound (gate 3).
- Load check at NFR-5 (10 cases/day); a11y (WCAG 2.1 AA) + reading-level CI on all Daybreak routes; pentest of the tenant boundary (SRE-6).
- **Backup restore drill:** restore staging from production backups against the stated RPO/RTO; verify the deletion-propagation window (M0 backup design) holds.
- **Game day:** simulate a provider outage + Stripe webhook loss on staging and run the SRE-4 runbooks as written — runbooks that have never been executed are fiction.
- Open product/compliance decisions **closed (PO, Aug 2026)**: SLA **10 business days** · plea lane **$299 uniform** · payment plans **Stripe-native installments only** · R-6 **LRIS-only** · brand **"Family Case Review" sub-brand** · OCR stack **AWS S3 + Textract** · Stripe Tax **enabled at checkout** (flag) — remaining for M7: **Texas sales-tax treatment of the $299 review** (M2 flag), TDPSA items (privacy policy **stating the §11a.2 retention matrix — what deletion removes and what survives, and the ≤35-day backup propagation bound**, subprocessor list, cookie/consent counsel confirmation per ENG-11), accessibility statement.

**AC:** all five PRD §7 launch gates checked; restore drill and game day completed with findings closed; go/no-go review documented.

### Daybreak UX build (runs M2→M5 as a parallel track)

The UI is spec-complete (`mvp_ui_design_spec.md`, `landing_page_spec.md`); this plan deliberately sequences its build **after the contracts it consumes exist**: landing + S0 wizard on M1's draft API; buy flow on M2; checklist/upload/echo-back/meter on M3; tracker on M1's SSE mapping; interstitial/report/next-steps on M5's report data. Token package (`db-*`/`hg-*`), externalized copy canon, and a11y CI (UXG-1..5) land with the first Daybreak screen. UX estimate: ~6 ew inside the M2–M5 window, **staffed by the frontend contractor (§2)** — as originally drafted this lane collided with Track B's ownership of M4, which was the schedule's hidden third engineer.

## 4. Sequencing at a glance

| Sprint (2 wks) | Track A | Track B |
|---|---|---|
| S1 | M0 security foundation | M0 hygiene/deletions + eval-bucket move |
| S2 | M1 case spine | M4 start: chunk-freeze + router on fixtures |
| S3 | M2 commerce/identity | M4: screens + batch orchestration |
| S4 | M3 intake (upload/scan/dedup) | M4: synthesis + adjudication + grounding |
| S5 | M3 intake (OCR/checklist/clock) + Daybreak S0–S3 UI | M4 finish + eval harness runs |
| S6 | M5 QA console + report | M6 ops console start; Daybreak tracker/report UI |
| S7 | M6 observability/analytics | M7 dry runs, eval, counsel package |
| S8 | M7 gates, pentest, buffer | Launch go/no-go |

Counsel review (gate 2) is commissioned at S5 so findings land before S8. The eval ledger (attorney-signed ground truth) is commissioned at S1 — it gates M4's exit and takes calendar time we don't control.

## 5. Legacy code disposition register (the deprecation plan)

Decisions reflect the post-MVP roadmap: **v1.1** Spanish/AV/records-concierge/attorney-signed add-on · **v2** clinic tier (multi-seat, triage dashboard) · **v3** professional workspace (chat, graph UI, drafting, DOCX export, Clio/PACER, subscriptions) · **v4** Sovereign self-host (Ollama-primary). "Delete" means removed from the tree in M0 — git history is the archive; nothing of production value is lost.

### 5.1 Delete now (mocked, broken, or duplicative — v-next would rebuild anyway)

| Asset | State | Rationale / post-MVP reflection |
|---|---|---|
| `apps/api/src/routes/chat.ts` | Unregistered; mocked; targets wrong Fastify/WS API | v3 chat is SSE/LangGraph-based per design — zero salvage value |
| `apps/api/src/routes/export.ts` + duplicate `export.ts`/`export.service.ts` | Hardcoded mock claims → real docx | v1.0 reports are PDF; v3 DOCX master-sheets will be regenerated from the **Finding** schema, not this route. Drop `docx` dep until v3 |
| `apps/api/src/routes/webhooks.ts` (PACER) | Zod + `console.log` | v3 integration; stub misleads |
| `apps/api/src/services/document-processor.worker.ts` | Orphan; doesn't compile | Superseded by M3/M4 workers |
| `apps/api/src/services/storage.service.ts` | Unused duplicate of upload route | Consolidated into one storage module in M3 |
| `apps/api/src/workers/media.worker.ts` + `media` queue | Never enqueued; latent 1536→768-dim crash | v1.1 A/V add-on rebuilds on the Phase-5 Whisper/FFmpeg design with metering — this mock isn't the seed of it |
| Mocked chunking/extraction in `ingestion.worker.ts` / `entity.worker.ts` | Hardcoded 2-chunk array; `.includes()` "extraction" | Replaced wholesale by M3 intake + M4 analysis workers |
| `apps/web` workspace **chat** mock + `/workspace/[caseId]/graph` page + hardcoded `KnowledgeGraph` data | `setTimeout` fake; fixture nodes | v3 surfaces; fake data on real routes is a trust liability. **Component exceptions kept — see 5.2** |
| `/api/auth/clio/callback` | Returns a fake token, redirects to a nonexistent route | v3 `mcp-clio-sync` does OAuth properly |
| `packages/ai` LangChain tool wrappers (`mcp-tx-case-law`, `bluebook`, `clio`, `axon`, `statutes-pro`) | Canned JSON ("Ex parte Smith") | The **real** stdio MCP servers are kept (5.2); canned wrappers actively poison eval work |
| `socket.io` + `fastify-socket.io` deps | Declared, never imported | Real-time is SSE-only (design §12.5) |

### 5.2 Keep — parked, config-gated, or repurposed (a live post-MVP future)

| Asset | v1.0 role | Post-MVP future |
|---|---|---|
| `packages/auth` (all of it) | Production auth, extended per §12 addendum | Every tier |
| `ModelRouter` (`packages/ai/router.ts`) | Active, Ollama **config-off** | Ollama returns at ≳150 cases/mo (v1.1 ops) and is the v4 Sovereign engine |
| Real stdio MCP servers (`tx-statutes`, `tdcj-policy-expert`, `tx-appellate-rules`, `tx-jury-charges`, `dev-tools`) | Pipeline tools where the eval shows benefit | v3 drafting + v4 local MCP stack |
| `PostgresCheckpointSaver` + `GraphState` table | **Fixed and registered** in M4 (not deleted) | Long-running professional workflows v3 |
| `ParchmentViewer`, `react-resizable-panels` side-by-side shell | QA console source pane (M5) | The v3 attorney workspace — v1.0 dogfoods it daily |
| `ViabilityScorecard` component | Dormant | v2 clinic triage dashboard; shares the `FindingCard` data contract |
| pgvector schema (`DocumentChunk.embedding`) | **Embedding generation paused** (written-never-read costs money); column kept | v3 semantic search/chat revives it with an HNSW index |
| Neo4j (`neo4j.ts`, docker service) | Out of the v1.0 runtime; compose moves it to an optional `graph` profile; entity index lives in Postgres (design §12.1) | v2/v3 graph surfaces re-adopt with tenant-scoped labels |
| Staff pages (`/dashboard`, `/dashboard/permissions`, `/dashboard/account`, `(auth)` group) | Live staff/QA administration | v2 multi-seat tenancy builds on them |
| `dev-cli.ts`, `index-codebase.ts`, LanceDB dev-RAG | Developer tooling | Unchanged |
| `mcp-bluebook-sanitizer` (regex placeholder) | Dormant | v3 drafting; not worth deleting, not worth improving yet |

### 5.3 Docs deprecation

`website_architecture.md` already carries the supersession banner (platform/v3 reference). `full_implementation_plan.md` + `execution_roadmap.md` + `ux_buildout_plan.md` remain the historical engineering-build record — **this document supersedes them for all forward work**; a status note is added to each. `mcp_integration_strategy.md`'s "Ollama as orchestrator" framing is superseded by the routing revision (already noted there via `cost_optimization_ollama.md`).

## 6. Risks and mitigations

| Risk | Likelihood/Impact | Mitigation |
|---|---|---|
| Eval ledger (attorney-signed ground truth) arrives late — gates M4 exit | Med / High | Commission at S1; treat as external dependency with weekly check-ins; harness runs against draft ledger meanwhile |
| Batch-API worst case (24h) breaks SLA arithmetic | Med / Med | ENG-6 watchdog + standard-API fallback built in M4, not bolted on; SLA `N` set **after** measuring reference-case runs |
| OCR quality on aged scans below viability | Med / High | S1 bake-off on the corpus's worst pages; E-1 halt protects refund economics either way |
| Prompt-cache misses silently triple Tier-2 cost | Med / Med | Cache-hit telemetry is an SRE-2 alert from day one; prefix byte-stability is a unit test |
| Counsel review forces copy/flow rework late | Med / Med | Deadline-engine rules, US-0 routing, and disclosure copy sent at S5, not S8 |
| Two-engineer team: M4 complexity concentrates in one head | High / Med | Design doc §6 is the shared contract; pipeline PRs reviewed cross-track; eval harness is the objective referee |
| Daybreak UX lane competes with M4 for the same engineer | High / Med | Frontend contractor staffs the Daybreak track (§2); if unstaffed, the launch date moves — the plan does not absorb it silently |
| Restore/deletion promises untested until an incident | Med / High | M0 backup design with deletion-propagation window; M7 restore drill + game day are launch AC, not aspirations |
| Tax treatment of the $299 charge unknown (TX taxes data-processing services) | Med / Med | Accountant's determination before launch (M7 gate item); Stripe Tax if taxable |
| Chargeback wave from unmet expectations | Low / High | W-2 disclosure archive + OPS-3 export ship **with** commerce (M2), not later; 5% reserve budgeted |
| History still contains real case records | Certain / Med | M0 filter-repo decision — do it before more clones exist |

## 7. Launch-gate traceability

| PRD §7 gate | Delivered by |
|---|---|
| 1. Eval harness green (both reference cases) | M4 + M7 (ledger from S1) |
| 2. Attorney review (copy, T&C, routing, deadlines, §4, R-6) | Commissioned S5, closed M7 |
| 3. E&O insurance bound | PO track, M7 |
| 4. QA console + trained reviewer + E2E dry run | M5 + M7 |
| 4a. Ops console, Sentry/OTel, rate limiting live | M0 (limits) + M6 |
| 5. Billing spec implemented (Checkout, cap, overage, refunds) | M2 + M3 + M6 |

Story-level traceability: US-0/US-1 → M2 · US-2 → M3 · US-3 → M1+M3 (tracker/SSE + clock) · US-4 → M4+M5 · US-5/US-6 → M5 · US-7 → M3+M6 (halt + refund console) · US-8 → M5 · US-9 → M6 · FR-1..5a/FR-11 → M4 · FR-6/7/8/9/10 → M4+M5. Sprint reviews check stories against this map, not against milestone titles.

## 8. Governance

- **Eval-gated model changes:** no router/model/prompt change ships without the `model_evaluation.md` decision rules (per-category recall + citation fidelity, no regression).
- **Doc-diff discipline:** every shipped behavior change lands a diff in its owning spec in the same PR (analytics plan §6); this plan is updated at each milestone review.
- **Red lines:** disclosures, not-legal-advice language, interstitial honesty, and urgency mechanics are never A/B tested (analytics plan §4.3); all consumer-visible copy passes R-5 tone review; anything legal-adjacent passes counsel.
- **Scope guard:** the PRD §2 non-goals are enforced in review — no chat, no customer graph, no research claims, no subscriptions, no pro se pathways. Feature pressure routes to the roadmap, not the sprint.
