# PRD — MVP v1.0 "Family Case Review"

**Product:** Snot Nose Legal (snotnoselegal.com) · **Status:** Draft for engineering review · **Owner:** Product · **Last updated:** 2026-08-29
**Companion docs:** `docs/business_case/snotnoselegal_market_study_mvp_gtm.pdf` (market study, unit economics, GTM) · `docs/architecture/cost_optimization_ollama.md` (model routing) · `docs/architecture/model_evaluation.md` (launch quality gate) · `docs/specifications/product_roadmap.md` (release sequencing)

---

## 1. Problem statement

When a Texas conviction becomes final, the family faces a brutal decision with no information: pay ~$3,000 for an attorney merely to *read the file* and say whether an Article 11.07 writ is plausible, pay $15k–$50k+ for full representation on faith, or let the inmate file pro se from a TDCJ unit — where a weak application burns the effective one shot Texas's subsequent-writ bar allows. No product on the market serves this decision. Every incumbent (Westlaw+CoCounsel, Lexis+ AI, vLex/Vincent, Everlaw, Casefleet) licenses to legal professionals, prices per professional seat, and assumes legal training.

**MVP v1.0 sells the decision, not the writ:** a $299 flat-fee automated review of the court record that tells a family — in plain English, grounded to page and line — what the record contains, which statutory doors it touches, and what to do next.

## 2. Goals and non-goals

### Goals (v1.0)
1. A family member can purchase, upload a record, and receive a viability report with zero legal training and zero human hand-holding.
2. Every finding in every report is grounded to a verifiable record citation (volume/page/line).
3. Every report passes a human QA gate before release (see §7.4) — no report reaches a customer unreviewed.
4. The product never practices law: information, not advice; routing to counsel, never toward pro se filing (see §8).
5. Unit economics hold: ≤ ~$54 COGS/case at the $299 price (market study §7.3).

### Non-goals (v1.0) — explicitly deferred
- **No interactive workspace** — no chat, no side-by-side viewer, no knowledge-graph UI for the customer. The graph and LangGraph agents run *internally*; the customer sees only the report. (These are Advocate/Chambers-tier features; roadmap v3.)
- **No A/V ingestion** — jail calls/bodycam/interview video are rejected at upload with a clear message; documents only. (Roadmap v1.1 as a priced add-on.)
- **No multi-seat tenancy for consumers** — one purchaser account per case. The existing RBAC/RLS multi-tenant layer is reused with a single-member tenant; no invitations, no roles UI.
- **No case-law research or citator claims** — the report cites statutes/doctrine categories, not "your winning precedent." Research is the duopoly's ground and vLex gives it to attorneys free; we do not compete there.
- **No subscriptions** — one-time purchase (+ optional re-run). Billing infrastructure is Stripe Checkout, not a subscription engine.
- **No DOCX master-sheet export** to consumers — the attorney-ready packet is a PDF appendix. Court-format exports remain professional-tier.

## 3. Personas, JTBD, competitive frame (summary)

Primary persona: **the inmate's family member** (see `docs/design/user_journeys.md` Persona 4) — the actual payer in retained post-conviction work; not a lawyer; making a high-stakes financial decision under emotional stress; may not be a native English reader.

> JTBD: *"When my son's direct appeal is denied, I want to know whether a writ has any realistic chance before I spend $3,000 just for a lawyer to read the file, so I don't drain the family's savings on false hope."*

Secondary beneficiary (not a v1.0 user): **clinic directors**, who receive consented high-viability referrals as pre-triaged packets — the funnel into roadmap v2.

Competitive frame: this persona is unserved by all five researched platforms; the competitive anchor is not software but the **$3,000 human review** and the **$0 pro se path**. Value proposition: *"Know before you retain — a complete review of the court record for a tenth of what a lawyer charges to read it."* Full analysis: market study §§2–4.

## 4. User stories & acceptance criteria

> Workflow detail for all stories: `mvp_workflow_design.md` (service blueprint, edge flows, pattern research).

**US-0 — Eligibility screen (free, pre-purchase).** As a visitor, I can find out in under two minutes — without paying or creating an account — whether this product fits my family's case.
- AC: ~6 questions (TX conviction? felony? trial/plea? direct-appeal status? timing? representation?); three outcomes: good fit → purchase; not a fit → plain explanation + pointed resources (never a dead end); fit-but-records-missing → records guidance first. No case created; anonymized funnel logging only.

**US-1 — Purchase.** As a family member, I can buy a case review for a flat $299 without creating anything more than an email/password account.
- AC: Stripe Checkout; price, page cap, refund policy, and "information, not legal advice" statement displayed *before* payment; receipt emailed; purchase creates a Case in a single-member tenant.

**US-2 — Upload.** As a purchaser, I can upload the court documents I have (PDFs/scans), even messy ones, and know immediately if something won't work.
- AC: a short case interview (county, year, court, jury/bench, appeal history) generates a **personalized document checklist**; each item carries "don't have this? here's how to get it" guidance (district-clerk mechanics, re:SearchTX for 2016+ e-filings, and the reassurance that the trial transcript usually already exists if there was a direct appeal); per-item upload embedded in the checklist; phone photos accepted with capture coaching, **echo-back verification** ("this looks like RR Vol. 3 — right?"), and OCR-confidence gating; mobile-friendly via existing presigned-S3 flow; A/V and other types rejected with a plain-language explanation of the v1.1 add-on; running page-count meter against the 5,000-page cap with the +$49/2,500-page overage offered in-flow; save-and-resume (records arrive over weeks); "records complete" is an explicit, celebrated event; user attests they are entitled to possess the records (T&C checkbox).

**US-3 — Progress.** As a purchaser, I can see where my review is without calling anyone.
- AC: status tracker with named stages (Documents received → Digitizing your records → Analyzing the record → Quality review → Ready) driven by real BullMQ/SSE pipeline events, with honest live sub-detail ("Volume 3 of 7 read"); the **Quality review stage is customer-visible and its copy names the reviewer's role and task concretely** (vague "human-reviewed" copy tests worse than no mention); email at each major transition; **the SLA clock starts at "records complete," not at purchase** ("most reviews are ready within N business days of your documents being complete" — N set by ops, includes the QA queue).

**US-4 — The report.** As a purchaser, I receive a report I can actually understand *and* hand to a lawyer.
- AC: two-part PDF delivered by email + download page. **Part A (for the family, plain English, ≤ 8th-grade reading level):** what we reviewed (inventory), what we found per screen (§5) with a Strong signals / Possible issues / Nothing found presentation, what each finding means, deadline posture stated as dates and urgency, and *next steps* (always: consult counsel; never: "file this"). **Part B (attorney-ready packet):** findings with full record cites (volume/page/line), excerpted source text per finding, the disclosure/event timeline, entity index, and the deadline-posture computation with its statutory basis. Every Part A claim traces to a Part B citation.

**US-5 — Consent-based referral.** As a purchaser whose review shows strong signals, I can choose to share the packet with an innocence clinic or take a vetted-attorney list.
- AC: opt-in only, after report delivery; consent screen names the recipient class and what is shared; referral packet = Part B + case metadata; consent revocable; nothing is shared without the explicit opt-in (default: not shared).

**US-6 — Re-run.** As a past purchaser, I can add newly obtained documents and re-run for $99.
- AC: re-run diffs against prior findings ("what changed"); same caps and QA gate.

**US-7 — Refund.** As a purchaser whose record was unreadable, I get a partial or full refund without a fight.
- AC: if OCR confidence falls below the readability threshold on > X% of pages, the pipeline halts *before* full analysis spend, support is notified, and the customer is offered re-upload or refund; refund issuable from the ops console; 5% revenue reserve budgeted.

**Internal — US-8 — QA console.** As a QA reviewer, I can review, annotate, correct, or reject every report before release.
- AC: internal queue (reuses ADMIN/ATTORNEY roles); reviewer sees Part A/Part B side by side with click-through to source pages (reuses the existing side-by-side workspace internally); reviewer must affirmatively approve; edits are audit-logged (existing append-only AuditLog); rejection routes to an engineering triage queue. Target ~30 min/case (COGS line).

## 5. Functional requirements — the five screens

The analysis pipeline runs the three-tier model routing (`cost_optimization_ollama.md`) and produces findings for exactly these screens in v1.0. Each finding carries: category, severity (dispositive / supportive / background), confidence, record cites, source excerpts, and — where the cross-model adjudicator disagreed — a flagged-for-QA marker.

| # | Screen | Core method (existing components) |
|---|--------|-----------------------------------|
| FR-1 | **Preserved-error scan** | Objection/ruling extraction over the reporter's record (Phase 4 Appellate Auditor agent) |
| FR-2 | **IAC flags** | Witness-list/discovery vs. transcript diff; un-objected prejudicial events (IAC Auditor + Neo4j entity graph, internal) |
| FR-3 | **Brady / disclosure timeline** | Disclosure filings vs. trial testimony diff (Brady Auditor); timeline in Part B |
| FR-4 | **Art. 11.073 junk-science hits** | Expert-testimony keyword + `mcp-forensic-science` registry lookup |
| FR-5 | **Sentencing / time-credit audit + deadline posture** | Judgment vs. statute-at-date via `mcp-tx-statutes`; 11.07/AEDPA posture via `mcp-tx-procedural-expert` (dates presented with an "as of" stamp and a verification disclaimer) |

Cross-cutting: FR-6 — every finding must resolve to at least one verifiable citation or it is dropped (grounding is a hard filter, not a preference); FR-7 — the report generator refuses to render a finding whose citation fails re-verification against the stored chunks.

## 6. Non-functional requirements

- **NFR-1 Quality gate (launch-blocking):** per-category recall and citation fidelity targets on the reference-corpus eval (`model_evaluation.md`) must be met before public launch, and re-met before any router/model change ships. Recall is primary; QA absorbs precision misses.
- **NFR-2 Language & accessibility:** Part A at ≤ 8th-grade reading level; WCAG 2.1 AA on the purchase/upload/status surfaces; **Spanish-language Part A and purchase flow are a fast-follow (v1.1) and the templates must be i18n-ready at v1.0**.
- **NFR-3 Security/privacy:** existing RLS tenancy, encryption at rest/in transit, append-only audit; consumer data never used for model training; retention = 12 months then deletion (stated at purchase); records deleted on verified request.
- **NFR-4 Cost telemetry:** per-case token/OCR/storage cost recorded at case close; alert when rolling COGS exceeds budget ($54).
- **NFR-5 Capacity:** pipeline throughput sized for 10 cases/day at launch hardware; queue depth visible in ops.
- **NFR-6 OCR robustness:** aged-scan handling is a first-class requirement (competitors demonstrably fail here — Casefleet's highlighting degrades on old scans); OCR confidence is stored per page and drives the US-7 halt.

## 7. Launch gates (all must pass)

1. Eval harness green per NFR-1 on both reference cases (Gary; Brian Spinks documents).
2. Attorney review (retained TX counsel) of: report templates, all customer-facing copy, T&C, refund policy, UPL posture (~$2–5k one-time, budgeted).
3. E&O insurance bound.
4. QA console operational with at least one trained reviewer; end-to-end dry run on both reference cases through purchase → report → refund path.
5. Billing spec items in §4 implemented (this PRD **supersedes the deferred PM billing spec** referenced in `user_authentication_experience.md` §"out of scope" for the consumer tier only).

## 8. UPL & ethics requirements (product-shaping, not boilerplate)

- **R-1:** The report states what the record contains and which statutory doors it touches. It never recommends filing, predicts outcomes as probabilities of winning, or selects among legal strategies.
- **R-2:** Persistent "information, not legal advice" labeling on every surface and every report page; AI-generated content labeled as such.
- **R-3:** All high-viability outcomes route toward counsel (referral flow, US-5). The product never links to, or instructs on, pro se filing — encouraging a weak pro se writ that burns the subsequent-writ bar is the worst harm this product could cause.
- **R-4:** Optional attorney-signed review add-on (~$499, licensed TX attorney paid per review) is designed post-v1.0 but the report schema must carry a signature block from day one.
- **R-5 (brand gate):** consumer-facing tone must pass the "grieving family test" — a named GTM risk. Marketing irreverence, if kept, stays off the purchase/report surfaces.

## 9. Success metrics

| Metric | Target (first 90 days) |
|---|---|
| Paid cases | ≥ 10/mo by day 90 (break-even ≈ 2/mo) |
| QA rejection rate | < 10% of reports (leading quality indicator) |
| Citation-fidelity spot-check failures post-release | 0 |
| Refund/chargeback rate | ≤ 5% (reserve level) |
| Consented clinic referrals | ≥ 20% of strong-signal reports (validates the v2 funnel) |
| COGS/case (rolling) | ≤ $54 |
| CAC (paid channels) | ≤ $100/case; organic share rising month-over-month |

## 10. Open questions

1. Report SLA: what N (business days) do we commit to at launch, given the human QA queue? (Ops decision; clock-start framing resolved — begins at "records complete," per `mvp_workflow_design.md`.)
2. ~~Phone captures vs. clerk PDFs~~ — **resolved: accept phone photos** with capture coaching, echo-back verification, and OCR-confidence gating (category leaders coach rather than reject; see workflow doc §6.5).
3. Referral recipients at launch: which clinics have agreed to receive packets? (GTM Phase-2 dependency; US-5 can ship with the attorney list only. TIFA partnership candidate per workflow doc §6.7.)
4. Brand decision (R-5) — resolve before public site copy is written.
5. Payment plans (2×/3× split via Stripe): "Who Pays?" income data argues for it; chargeback exposure argues caution. Decide before launch (workflow doc §6.8).
