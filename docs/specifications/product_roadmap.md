# Product Roadmap — Release Sequencing

**Status:** Active · **Last updated:** 2026-08-29
**Supersedes** the release sequencing implied by `docs/implementation/scaffolding/full_implementation_plan.md` §3 (which remains the *engineering build* record). The engineering phases 1–5 built the platform capabilities; this roadmap sequences how those capabilities reach the market, following the segment sequencing in the market study's GTM plan (§8).

Guiding principle: **each release monetizes the persona that proves the next one.** The consumer product hardens the analysis engine on paid real records; clinics validate triage at volume; attorneys buy the workspace the first two phases de-risked; agencies buy what reference customers have published outcomes on.

---

## v1.0 — Family Case Review (MVP) — target: next

**Persona:** Inmate & family (B2C). **Spec:** `mvp_v1_prd.md`. **Model:** $299 one-time + $49 page overage + $99 re-run.

| Workstream | Contents | Reuses |
|---|---|---|
| Consumer surface | Purchase (Stripe Checkout), guided upload, status page, report download | Presigned-S3 upload, BullMQ/SSE progress |
| Analysis | Five screens (preserved error, IAC, Brady, 11.073, sentencing/deadlines) via three-tier routing | Phase 3–4 agents, MCP servers, entity graph (internal) |
| Report | Part A plain-English + Part B attorney-ready packet (PDF), grounded-citation hard filter | DOCX/export service (retargeted to PDF), Bluebook sanitizer |
| QA gate | Internal review console, approve-before-release, audit-logged edits | Side-by-side workspace (internal use), RBAC, AuditLog |
| Trust & safety | UPL guardrails (PRD §8), refunds, OCR-confidence halt, retention policy | RLS tenancy |
| Launch gates | Eval harness green (`model_evaluation.md`), attorney copy review, E&O bound | Reference cases (Gary, Brian Spinks) |

**Explicitly cut from v1.0:** A/V, chat, graph UI, research/citator, subscriptions, multi-seat, Clio/PACER, DOCX court exports, Spanish (templates i18n-ready only).

## v1.1 — Hardening & reach — target: v1.0 + ~1 quarter

- **Spanish-language** purchase flow and Part A (largest reachable expansion of the TX family market).
- **A/V add-on** (~$0.10/min): jail calls & interview audio via the Phase-5 Whisper/FFmpeg queue; contradiction findings join the report; Spinks media joins the eval ledger.
- **Attorney-signed review add-on** (~$499; licensed TX attorney per review) — PRD R-4.
- **Records concierge** (Cleveland Clinic "we collect your records" pattern): request clerk's/reporter's records on the family's behalf, priced at cost + fee — the highest-leverage differentiator surfaced in workflow research (`mvp_workflow_design.md` §6.4); deferred from v1.0 for operational complexity (v1.0 ships get-it-yourself guidance instead).
- Ops: cost-telemetry-driven router tuning; Ollama switch evaluated only if volume ≳150 cases/mo.

## v2 — Justice Tier (clinics & innocence projects) — gate: engine proven on paid consumer volume; ≥20% referral opt-in

**Persona:** Clinic director. **Model:** $0 to monthly ingestion cap (mirrors Everlaw for Good); funded as the reference-customer and referral-intake investment.

- Intake triage dashboard (Bento viability scorecard) — the Workflow A spec in `user_journeys.md`, now fed by two sources: mailed/uploaded inmate requests **and** consented v1.0 referral packets arriving pre-triaged.
- Multi-seat tenancy surfaces (existing RBAC: ADMIN/ATTORNEY/INVESTIGATOR/VIEWER) with clinic verification (501(c)(3)).
- Batch ingestion; caseload views; assignment.
- Exit criteria for v3: 2–3 named reference clinics; triage recall validated at volume.

## v3 — Advocate & Chambers (professional tiers) — gate: referral-list attorneys converting

**Personas:** Solo/court-appointed counsel ($99/seat/mo); firms & PD offices ($249/seat/mo, investigator/viewer seats discounted or free).

- The full workspace goes customer-facing: side-by-side Parchment viewer + chat, interactive Neo4j knowledge graph, drafting with cite-to-record and Bluebook sanitization, DOCX 11.07 master-sheet export (all built in engineering phases 3–4; productized here).
- Subscription billing (the real billing engine; v1.0's Stripe Checkout is deliberately minimal).
- Clio/MyCase sync, PACER/RECAP docket monitoring (Phase-5 integrations, productized).
- Exhaustion tracker and affidavit-tracking workflow (white-space features from the market study §5 — first professional-tier differentiators to ship).

## v4 — Sovereign / B2G — gate: reference clinics + publishable outcomes

**Personas:** Indigent-defense commissions, county PD offices, courts managing 11.07 dockets. **Model:** annual self-hosted site license; TCDLA/State Bar association bundle as the channel (the vLex playbook).

- Self-hosted deployment profile (Ollama-primary routing, local MCP stack — the data-sovereignty architecture, packaged).
- Procurement collateral: security whitepaper (RLS/audit/E&O), outcome data, accessibility conformance.
- Judicial-side 11.07 docket-management exploration (unserved need surfaced in research — courts get CLE toolkits, not software).

---

## Standing tracks (every release)

- **Eval-gated model changes:** no router/model change ships without meeting `model_evaluation.md` decision rules; reference corpus grows with consented real records.
- **COGS telemetry** against the unit-economics budget; pricing guardrails (page cap, A/V metering) reviewed quarterly.
- **UPL/compliance review** of any surface that changes what a non-lawyer sees.
- **Known-gap burn-down:** mocked services, monitoring/rate limiting, VIEWER role alignment (`user_authentication_experience.md`) — v1.0 launch requires the subset on its critical path (payments, pipeline, QA console); the rest tracks to v2.
