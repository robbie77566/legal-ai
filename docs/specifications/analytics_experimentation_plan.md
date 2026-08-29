# Analytics, Conversion & Experimentation Plan — MVP v1.0

**Status:** Draft for PM/UX/engineering review · **Owner:** Product · **Last updated:** 2026-08-29
**Companions:** `mvp_v1_prd.md` (§9 success metrics) · `../design/landing_page_spec.md` (§6 funnel targets) · `../design/mvp_ui_design_spec.md` (§7 analytics notes) · `mvp_workflow_design.md` (stages S0–S7)

This plan reviews every spec'd surface for what must be measured, what is worth testing after deployment, and how findings flow back to the PM and UX teams. It is the single source of truth for event names, experiment governance, and reporting cadence.

---

## 1. Review findings: where the specs are measurable and where they weren't

Cross-reading the PRD, workflow blueprint, UI spec, and landing spec:

1. **The funnel is fully specified but events were only sketched.** The UI spec names five funnel events; this plan defines the complete taxonomy (§2) so engineering instruments once, correctly.
2. **The most decision-relevant metric is not a conversion rate** — it's *S0 outcome mix* (what share of visitors are good-fit trial lane / plea lane / capital / pending appeal / discharged / prior writ). That distribution validates or falsifies the market sizing and decides v1.1 priorities. No spec captured it; added as a first-class report (§5).
3. **Two silent drop-off cliffs need dedicated instrumentation:** the S2→S3 documents gap (families stall for weeks gathering records — measure time-to-records-complete and checklist stall points, per-item) and the S6 interstitial ("come back later" without return within 7 days is a wellbeing + product signal).
4. **Bottom-funnel A/B tests are underpowered at launch volume.** At the 90-day target (~10 paid cases/mo), payment-step experiments would need many months to reach significance. Testing effort must concentrate where traffic exists — landing → check-start → outcome — and rely on qualitative methods below the pay wall (§4.4).
5. **Some variants must never be tested.** Experiment governance needs explicit red lines (§4.3); nothing in the earlier specs said so.

## 2. Event taxonomy (implement exactly these names)

Namespace `snl.` · every event carries: anonymous visitor id (first-party cookie), session id, lane (trial/plea) once known, locale, device class. **No third-party ad pixels anywhere; no analytics beyond first-party on post-purchase surfaces; no session-replay tooling on report or upload surfaces** (records and findings are on screen — privacy is a product promise, R-6 privacy card).

| Stage | Events | Key properties |
|---|---|---|
| Landing | `landing.view`, `landing.section_seen`, `landing.cta_click` | section id; cta position (hero/price/nav) |
| S0 check | `check.start`, `check.answer`, `check.outcome` | question id, answer enum; outcome ∈ {fit_trial, fit_plea, capital, pending_appeal, discharged, misdemeanor, prior_writ_warned, not_fit_other}; duration |
| Resources exit | `check.resource_click` | which resource (TCDLA/TIFA/OCFW/email-capture) — the "honesty-exit quality" metric |
| S1 buy | `buy.disclosures_view`, `buy.disclosures_ack`, `buy.account_created`, `buy.payment_start`, `buy.payment_success`, `buy.payment_abandon` | time-on-disclosures (a floor matters: <10s reading seven cards is a comprehension warning, not a win) |
| S2/S3 docs | `docs.interview_complete`, `docs.item_uploaded`, `docs.shoebox_uploaded`, `docs.echoback_confirmed`, `docs.echoback_corrected`, `docs.howto_expanded`, `docs.records_complete`, `docs.stalled_7d` | item type; days since purchase; page count |
| S4/S5 | `pipeline.stage_entered`, `qa.approved`, `qa.rejected`, `case.deadline_urgent_flag` | stage; QA cycle time |
| S6 report | `report.ready_notified`, `report.interstitial_view`, `report.opened`, `report.later_chosen`, `report.finding_expanded`, `report.record_peek`, `report.partB_downloaded` | days from notify→open; findings mix (counts only, never content) |
| S7 act | `next.consent_granted`, `next.consent_revoked`, `next.directory_click`, `next.rerun_purchased` | recipient class |
| Health | `refund.requested`, `chargeback.received`, `support.contacted` | reason enum |

Server-side mirror events for money and pipeline facts (payments, QA, COGS per case) — the client is untrusted for anything reported to finance.

**Data-governance rules (data review, Aug 2026 — `../architecture/mvp_v1_system_design.md` §11a):**
- **No free-text properties, ever.** Event payloads are IDs, enums, counts, durations. Case content and customer-entered text are structurally excluded from the taxonomy.
- **IP addresses truncated** before storage; Global Privacy Control honored.
- **Identity stitching is one-way:** anonymous visitor id links to userId at purchase for post-purchase funnel continuity; pre-purchase S0 answer events are never retroactively re-identified.
- **Retention:** raw events 14 months, then aggregates only.
- **Schema registry:** the taxonomy above lives as versioned JSON Schemas validated in CI; evolution is additive-only — an event's meaning is never changed, only new versions added. (This is the enforcement mechanism behind "event schema changes require a PR touching this file.")

## 3. Metrics model (what PM/UX actually watch)

**North star: completed reviews that reach a lawyer** — proxied by `report.partB_downloaded ∪ next.consent_granted ∪ next.directory_click` per paid case. The product's promise is a *usable* decision, not a delivered PDF.

| Layer | Metric | Target (from PRD/landing specs) | Owner |
|---|---|---|---|
| Acquisition | landing.view → check.start | ≥ 25% | UX |
| Triage | check completion; outcome mix | ≥ 80% complete | PM (mix), UX (completion) |
| Purchase | fit → disclosures_ack ≥ 60%; ack → paid ≥ 70% | | PM |
| Activation | paid → records_complete; median days; stall rate at 7/30d | (baseline first 90d) | UX |
| Delivery | notify → report.opened within 7d | (baseline) | UX |
| Outcome | north star per paid case; consent rate ≥ 20% | | PM |
| Guardrails | QA rejection < 10%; refund/chargeback ≤ 5%; honesty-exit resource-click rate; time-on-disclosures floor | never regressed by experiments | PM+QA |
| Unit econ | COGS/case ≤ $54; CAC ≤ $100 paid channels | | PM |

## 4. Experimentation program

### 4.1 Prioritized test backlog (top of funnel first — that's where power is)

| # | Surface | Hypothesis | Variants | Primary metric | Guardrail |
|---|---|---|---|---|---|
| E1 | Hero headline | Outcome framing ("Find out what's really in the record") vs. cost framing ("Know before you spend $3,000") | 2 | check.start | honesty-exit quality |
| E2 | Hero CTA label | "See if this fits — free, 2 min" vs. "Check the case — free" | 2 | check.start | check completion |
| E3 | Anchor block position | Problem/$3k block above vs. below how-it-works | 2 | scroll-to-CTA, check.start | — |
| E4 | Price section | Anchors-beside-card vs. anchors-inside-card | 2 | price section → check.start | — |
| E5 | S0 question order | Custody question first vs. offense-level first | 2 | check completion | outcome accuracy (QA sample) |
| E6 | "Not sure" reassurance placement | Footer line vs. inline under each question | 2 | check completion, "not sure" answer rate | — |
| E7 | Checklist how-to guidance | Expander (current) vs. always-visible for still-needed items | 2 | time-to-records_complete | support contacts |
| E8 | Stall nudge emails (7d) | How-to help framing vs. progress framing | 2 | docs resumed in 72h | unsubscribe rate |
| E9 | Report delivery email subject | Neutral ("Your report is ready") vs. next-step ("Your report and next steps are ready") | 2 | notify → opened ≤ 7d | later_chosen rate (not a failure, but watch) |

E1–E4 need only visitor traffic; run first. E7–E9 are post-purchase but measured on behavior every purchaser exhibits, so they accrue power faster than payment-rate tests.

### 4.2 Method & decision rules
- Assignment: first-party, cookie-sticky, server-flag driven (no client-flicker); one experiment per surface at a time; minimum run 2 weeks and a pre-registered sample size — no peeking-based stops (use sequential bounds if we must look early).
- Ship rule: a variant ships only if primary metric improves credibly **and no guardrail degrades**; copy variants that win still pass the R-5 tone review and (for anything legal-adjacent) counsel review before becoming canon — **the experiment framework does not bypass the copy canon in `landing_page_spec.md` §2.**
- Low-traffic reality: below ~1,000 landing sessions/week, prefer sequential A/B on one change at a time and lean on qualitative (§4.4); never run underpowered tests to "have data."

### 4.3 Red lines — never A/B tested
1. The seven pre-payment disclosures: presence, order, or acknowledgment step (comprehension improvements go through counsel review, not experiments).
2. Any not-legal-advice / not-a-law-firm language.
3. The interstitial's honesty framing and "come back later" option.
4. Urgency mechanics of any kind (countdowns, scarcity, deadline dramatization).
5. Price displayed vs. price charged (test price only as a deliberate, uniform, disclosed change — not a split).
6. Anything on the report itself that alters findings presentation vs. the QA-approved template.

### 4.4 Where numbers can't reach: qualitative program
Below the pay wall, volumes are small — so: 5 moderated sessions/mo with prison-family participants (recruited via TIFA relationship, compensated) walking S0→S3 on their own phones; a 3-question post-report survey (clarity, "did you know what to do next," would-recommend) embedded in the delivery email; QA reviewers file a weekly "confusion log" of anything customers misread (they see every case). These feed the same report as the metrics.

## 5. Reporting back to PM & UX

**Weekly funnel report** (automated, Monday, one page — dashboard + posted summary):
1. Funnel table (§3 metrics vs. target, WoW delta).
2. **S0 outcome-mix chart** — the market-validation panel.
3. Guardrail panel (QA rejection, refunds, honesty-exit, disclosure dwell floor).
4. Active experiment status: days run, accrued n vs. required n, current direction *without* significance claims until pre-registered n is reached.
5. Top 3 qualitative findings (confusion log + sessions), each tagged to a spec section.

**Experiment readout** (per experiment close): pre-registered hypothesis, n, result with CI, guardrail check, ship/no-ship decision, and — required — the doc diff: which spec file and section changes if shipped. **A shipped variant is not done until its spec is updated**; the readout links the commit.

**Monthly deep-dive** (PM+UX+QA, 60 min): cohort view (time-to-records-complete, notify→open), unit economics vs. model, backlog re-prioritization, qualitative themes → candidate spec changes. Output: updated §4.1 backlog committed to this file.

**Tooling:** self-hosted or privacy-first analytics (e.g., self-hosted PostHog) consistent with the no-third-party rule; experiment flags in our own config service; dashboards accessible to PM/UX without SQL. Event schema changes require a PR touching this file — the taxonomy in §2 is the contract.

## 6. Feedback loop into the docs (change control)

Findings → actions must land in the owning doc, or they evaporate:
- Copy/layout wins → `landing_page_spec.md` §2 canon or `mvp_ui_design_spec.md` §5 + canvas update.
- Funnel-structure findings (e.g., outcome mix says plea lane dominates) → `mvp_v1_prd.md` scope/§10 and `product_roadmap.md` sequencing.
- Confusion-log items about legal comprehension → `mvp_workflow_design.md` + counsel review when disclosure-adjacent.
- Every such change lands via the same review gates as the original spec (R-5 tone; counsel where legal).
