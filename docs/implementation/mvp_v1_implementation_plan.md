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
- **Definition of done (every story):** code + tests (integration tests hit real Postgres/Redis via testcontainers — the current mock-everything pattern is retired), audit events written where the spec requires, analytics events per the `snl.*` taxonomy, doc-diff landed in the owning spec, a11y/reading-level lint green on Daybreak surfaces.
- **Estimate discipline:** figures below are engineering-weeks (ew) of focused work, ranges honest. Total ≈ 36–42 ew **plus a 15% buffer** → **15–17 calendar weeks with two engineers + the Daybreak contractor** → launch-ready around **late December 2026**, with the attorney review and eval gate as the long poles to start early. A mid-point re-estimate checkpoint lands at S4.
- **Pre-agreed scope-shed order** (cut in this order if S6 slips; the QA gate and disclosure archive are never on this list): share-link access log → re-run diff (US-6 ships "re-run", diff view follows) → Ops canned responses (OPS-6) → E8 stall-nudge emails → weekly-report automation (PMX-1 runs manually first).

## 3. Milestones

Each milestone lists scope → key tasks → acceptance criteria (AC). System-design section references in parentheses.

### M0 — Security foundation & repo hygiene (3 ew) — *blocks everything public*

Scope: eliminate the P0 defects (design §1) and clear the legacy underbrush (§5 register, "delete now" column).

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

- `packages/case-lifecycle`: state enum, transition map, customer-visible mapping, event-type constants (§4) — **event payloads defined as versioned JSON Schemas, validated in CI, PII-minimal by construction** (IDs/enums/counts only — never document text; ENG-12, design §11a.5).
- Schema migration set 1: `CaseStatus`/lane/vehicle/holds on Case, `CaseEvent` (append-only trigger), `EligibilityDraft`, checklist + upload-session tables (§5).
- Event append + projection helper (status column updated transactionally); SSE projector publishing the customer mapping; SSE route auth + case-access check (§9).
- **Transactional outbox for event publishing:** `CaseEvent` append and the Redis publish are a classic dual-write — a crash between DB commit and publish would silently desync the tracker. Events are published from an outbox tail (or re-published from the DB on gap detection), never fire-and-forget alongside the commit.
- **Job robustness conventions (set here, followed everywhere):** idempotent handlers keyed by event/job id; dead-letter queues with an Ops-visible surface; per-queue concurrency limits sized to provider quotas; graceful drain on deploy.
- **Minimal `packages/config` flags land here** (moved up from M6): server-side flags gate risky merges throughout the build; the audited admin UI (PMX-2) still arrives in M6.

**AC:** illegal transitions throw; tracker stage for any case is derivable from events alone; killing the process between commit and publish loses no tracker update (outbox proven by test); a poisoned job lands in the DLQ, not a retry loop; SSE stream requires auth and never crosses cases; `docs.stalled_7d` derives from the stream.

### M2 — Commerce & identity (4 ew)

- `CLIENT` role migration + middleware role matrix + API enforcement (§10.2; auth design §12).
- `/buy` flow API: disclosure-ack capture (archived per case — E-6), account+tenant creation, Stripe Checkout session; `payment.succeeded` webhook with `PaymentEvent` idempotency ledger; hourly reconciliation job (§7).
- `packages/email` (Resend + React Email): receipts, stage transitions, bounce/complaint webhooks → Ops queue. Password reset flow shipped (pulled into v1.0 per ENG-7).
- Eligibility draft endpoints (anon token, 30-day TTL, promote-and-delete).
- **Stripe completeness:** integration tests use Stripe test clocks; `charge.dispute.created` webhooks trigger the E-6 evidence flow (not just an archive that Ops remembers to export); Radar defaults reviewed. **PO flag: Texas taxes data-processing services (80% of the charge) — whether the $299 review is taxable needs an accountant's answer before launch; Stripe Tax is the cheap insurance.** Tracked as an M7 gate item.
- **Walking skeleton is this milestone's exit criterion** (§2): test-mode purchase → fixture doc → one real screen → stub QA → rendered PDF, on staging.

**AC:** a purchase in Stripe test mode yields exactly one Case with disclosures archived, receipt sent, and events written — including when the webhook is dropped (reconciliation heals it); a dispute webhook produces the evidence packet trigger; a CLIENT token cannot reach any staff surface; reset flow works end-to-end; the walking skeleton runs on staging.

### M3 — Intake pipeline (5–6 ew)

- Presign hardening (allowlist, size caps), multipart/resume sessions, HEIC conversion, ClamAV scan worker with quarantine messaging (ENG-4).
- Page normalization + perceptual/content-hash dedup; `DocumentPage` as the billable authority; meter endpoint with `duplicatesIgnored` (ENG-3). **Dedup semantics per the data review:** exact-hash duplicates leave billing and analysis; perceptual near-duplicates leave billing but **stay in the analysis set** — dedup must never drop potential evidence. Page-count reconciliation (uploaded = normalized = billable + excluded) runs at `DOCS_COMPLETE` and blocks the run on mismatch (§11a.3). In-flow overage Checkout.
- OCR provider bake-off (Textract vs Document AI on the corpus's worst scans — design §12.3) then integration; per-page confidence; E-1 halt with customer options (re-upload / partial / refund).
- Interview → checklist generation; Tier-1 classification → echo-back events; `docs.complete` written once, SLA clock stamped via the business-day calendar service (ENG-9).

**AC:** a duplicate/shoebox re-upload never increments the meter; a near-duplicate page excluded from billing still appears in the analysis chunk set (proven by test); page-count reconciliation catches an injected mismatch; an infected file quarantines with plain-language messaging and never reaches ingestion; a low-OCR case halts **before** Tier-2 spend; records-complete fires exactly once per run.

### M4 — Analysis pipeline (7–8 ew) — *start immediately after M1; runs parallel to M2/M3 against fixtures*

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

- `/qa` queue (adjudication-flagged first), side-by-side verify with click-through to frozen page images, edit (provenance → `ai_human_edited`, audit-logged), approve/reject; approve writes the findings snapshot + template version (ENG-8/ENG-11).
- `packages/reports`: Part A/B React templates (i18n-keyed, `es` stubbed), Chromium tagged-PDF render, reading-level lint on Part A strings; deadline/tolling copy exactly per PRD FR-5 language rules.
- Cited-page image pre-render at approval; share-with-a-lawyer links (hashed token, expiry, revocation, access log); delivery flow with `DELIVERED`-on-confirmation and bounce → Ops (§8, §9).
- Re-run diff on `Finding.stableKey` (US-6).

**AC:** a QA reviewer completes a reference case in ~30 min; nothing customer-visible exists pre-approval; a template change after approval does not alter an in-flight report; a bounced delivery email leaves the case `READY` and opens an Ops item.

### M6 — Ops console, observability, analytics (5 ew)

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
- Open product/compliance decisions closed (owner: PO): SLA `N`, plea-lane pricing, payment plans, R-6 referral structure, brand/R-5, **Texas sales-tax treatment of the $299 review** (M2 flag), TDPSA items (privacy policy **stating the §11a.2 retention matrix — what deletion removes and what survives, and the ≤35-day backup propagation bound**, subprocessor list, cookie/consent counsel confirmation per ENG-11), accessibility statement.

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
