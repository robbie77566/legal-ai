# Internal Operations Spec — Administrator, DevOps, PM & UX Personas

**Status:** Draft for review · **Owner:** Product · **Last updated:** 2026-08-29
**Companions:** `mvp_v1_prd.md` (US-8 QA console; this doc adds US-9) · `analytics_experimentation_plan.md` (PM reporting) · `../design/mvp_ui_design_spec.md` (§5.9–5.10 internal surfaces) · `../security/iam_rbac.md`

The customer-facing specs promise things only internal operators can keep: a refund "issuable from the ops console" (never spec'd), an SLA clock, guardrail metrics, and a QA gate. This doc defines the four internal personas, their JTBD and pain points, and the requirements (OPS-x, SRE-x, PMX-x, UXG-x) that make those promises operable. Internal surfaces use **Industrial Authority** (professionals in deep work), never Daybreak.

---

## I-1 · The Administrator / Operations Lead (ADMIN role)

> JTBD: *"When a customer case needs a human decision — a refund, a deletion request, a dispute, a stuck review — I want one console with the full case story and audited one-click actions, so nothing depends on a developer running SQL."*

**Pain points today:** refunds, deletion, and dispute evidence exist only as narrative in the PRD/workflow docs; every one would currently be a manual DB operation — unauditable and slow at exactly the moments (chargebacks, upset families) where speed and records matter.

**Requirements — the Ops Console (US-9, Industrial Authority surface at `/ops`):**
- **OPS-1 Case queue:** dense table of all cases — stage, lane, days-in-stage, page count, QA status, deadline-urgent flag, stall flag (`docs.stalled_7d`) — filterable; row opens the case file with full event timeline.
- **OPS-2 Refunds:** issue full/partial refund per E-1/E-6 policy with reason enum; Stripe-linked; append-only audit entry; weekly refund total surfaces on the console and in the PM report (5% reserve tracking).
- **OPS-3 Disclosure archive:** per case, one click shows the archived S1 disclosure set + acknowledgment timestamp + IP — the E-6 chargeback-defense packet, exportable as PDF.
- **OPS-4 Retention & deletion:** dashboard of cases approaching 12-month deletion; verified-request deletion flow (identity check → soft-delete grace → hard delete incl. S3 + vectors + graph) with audit trail; consent-revocation (US-5) processed here.
- **OPS-5 User & reviewer management:** existing RBAC surfaces (invite QA reviewers as ATTORNEY role, deactivate, reset MFA) — reuse the auth spec's admin flows, don't rebuild.
- **OPS-6 Support context:** every support contact (`support.contacted`) links to the case timeline; canned responses for the top scenarios (records how-to, delay notice, refund status) maintained here with R-5-reviewed copy.
- **OPS-7 SLA clock authority:** when an internal incident delays a case (SRE-4), the admin can mark "delay ours" — the customer's expected-ready date extends visibly with an honest tracker message, and the case is excluded from stall metrics. The clock never silently slips.

## I-2 · The DevOps / SRE Persona

> JTBD: *"When the pipeline degrades, I want to know before a family sees a lie on their tracker — and have a runbook that says what pauses, what we tell customers, and what it costs."*

**Pain points:** known gaps (monitoring, rate limiting) are on record; the consumer UX makes promises (real progress events, a records-complete clock, N-business-day SLA) that turn silent infra failures into broken promises on a grieving family's screen.

**Requirements:**
- **SRE-1 SLOs:** consumer surfaces 99.5% availability; upload success ≥ 99%; pipeline stage p95 latencies budgeted per stage (sum ≪ SLA N); throughput capacity 10 cases/day (NFR-5); SSE event delay p95 < 60s. Error budgets reviewed monthly with the PM.
- **SRE-2 Alerting (page vs. ticket):** page — queue depth beyond capacity, case stuck in a stage > budget × 3, payment webhook failures, S3/DB errors; ticket — OCR-confidence spike (bad-scan cohort), model-API error/cost anomalies, rolling COGS/case > $54 (NFR-4), cache hit-rate collapse (silent cost regression per the routing spec), refund-rate drift.
- **SRE-3 Observability:** existing Sentry + OpenTelemetry plan implemented (no longer deferred — launch gate); per-case cost and token telemetry queryable; a pipeline-health board (worker liveness, queue depths, provider latencies, batch-job status) — the right rail of the Ops Console serves the summary view.
- **SRE-4 Incident honesty runbook:** provider outage / pipeline stall → status tracker switches to a truthful state ("We've hit a delay on our side — your review is safe, and this delay is on us, not your clock"), OPS-7 extends dates, and no fake progress ever renders. Runbooks required at launch: pipeline stall, model-provider outage (incl. batch-API failure → standard-API fallback cost note), S3/storage failure, Stripe webhook loss, mass low-OCR cohort.
- **SRE-5 Deploy & flag safety:** experiment/config flags server-side (analytics plan §4.2); migrations backward-compatible one release; report-template changes versioned so an in-flight case renders with the template it was QA'd against.
- **SRE-6 Security ops:** rate limiting on auth + upload endpoints (closing the known gap) before launch; RLS pentest per the implementation plan; audit-log review cadence.

## I-3 · The PM Persona

> JTBD: *"When Monday comes, I want the funnel, guardrails, outcome mix, and experiment states in one place I didn't have to assemble — so decisions trace to numbers and land back in the specs."*

**Requirements:** **PMX-1** the weekly report of `analytics_experimentation_plan.md` §5 is automated (no hand-built decks); **PMX-2** experiment flags have an admin UI (create, allocate, freeze) with every change audit-logged; **PMX-3** dashboards (funnel, outcome mix, guardrails, unit economics) accessible without SQL; **PMX-4** the confusion log (QA reviewers') lives in the QA console with one-click export into the weekly report; **PMX-5** doc-diff discipline — readouts link the spec commit (analytics plan §6) — is tracked as a checklist item in the readout template itself.

## I-4 · The UX Designer Persona

> JTBD: *"When a copy test wins or a confusion-log item lands, I want to change the product's words and tokens through a governed path — one source of truth, with the legal gates built in — not by hunting hex codes through the codebase."*

**Requirements:**
- **UXG-1 Tokens as code:** Daybreak (`db-*`) and Industrial Authority (`hg-*`) tokens live in one shared package (CSS variables + Tailwind preset); screens consume tokens only — a palette change is one PR.
- **UXG-2 Copy canon as strings:** all Daybreak strings externalized (already required by i18n NFR-2); canonical copy files map 1:1 to `landing_page_spec.md` §2 and the screen specs, so a winning variant ships as a reviewed string change with the R-5/counsel gates in the PR template.
- **UXG-3 Design source of truth:** the Daybreak canvas (design artifact) is the reference for screen states; merged UI changes update the canvas in the same cycle — drift between canvas and product is a bug.
- **UXG-4 Research access:** UX owns the qualitative program (analytics plan §4.4) and receives the confusion log weekly; session recruiting via the TIFA relationship with compensation budgeted.
- **UXG-5 A11y regression:** axe-core + contrast + reading-level checks (UI spec §7) run in CI and block merges on Daybreak routes; UX triages failures.

## Incorporation map
- PRD: internal personas referenced in §3; **US-9 Ops Console** added beside US-8; SRE-3/SRE-6 join the launch gates.
- UI design spec: §5.10 Ops Console (Industrial Authority) added; governance (UXG-1–3) noted in §7.
- UX canvas: "Internal Ops" page added with the Ops Console artboard.
- Roadmap standing tracks already carry the known-gap burn-down; SRE items make it concrete.
