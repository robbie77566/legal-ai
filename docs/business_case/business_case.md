# Business Case — Snot Nose Legal / HabeasGraph

**Status:** Draft for decision · **Owner:** Founder / Product · **Decision forum:** Founding team + prospective investors · **Last updated:** 2026-08-29
**Companion docs:** `snotnoselegal_market_study_mvp_gtm.pdf` (market study, competitor dossiers, GTM — the evidence base for §3) · `market_analysis.md` · `swot_analysis.md` · `../specifications/mvp_v1_prd.md` (what v1.0 is) · `../implementation/mvp_v1_implementation_plan.md` (what it costs to build) · `../specifications/product_roadmap.md` (v1.1–v4 sequencing) · `../architecture/cost_optimization_ollama.md` (COGS basis)

> **Amendment (2026-09-15):** `professional_tier_expansion.md` re-cuts this case for two professional segments pursued ahead of roadmap v3 — public defender appellate attorneys and solo/small writ practices. Its base case adds ~$32k revenue and ~$14k contribution to year one and, more materially, seeds 23 professional seats twelve months earlier than §5.3 assumed. The recommendation in §1 below stands; §5.4's payroll-coverage arithmetic is revisited there.

> **Scope of this document.** The market study established *that* a white space exists and *who* pays. This document is the investment decision: what it costs, what it returns, what must be true, when to stop. Figures marked `[estimated]` are modelled assumptions, not observed data; every driver is listed and individually adjustable in §11. Nothing here supersedes the PRD's product scope or the roadmap's sequencing.

---

## 1. Recommendation

**Build v1.0 lean, launch it, and raise against evidence rather than specifications.**

Fund the MVP through launch as a founder-built effort at **~$34k of cash** (§6, Option A), reach the four launch gates in the PRD §7, and prove the analysis engine on **30–50 paid real records**. Then, and only then, decide on the ~$720k institutional round (§6, Option B) that buys the professional tiers on a competitive timetable.

The reason to split the decision this way is specific to this business: **the consumer tier's unit economics are excellent and its fixed costs are trivial, but its volume ceiling cannot fund an engineering team.** At $299 with ~$54 COGS, one case contributes ~$263 and the whole operation breaks even at **two cases a month**. The same arithmetic says a two-engineer payroll needs **114 cases a month** — a number the base plan does not reach until Q4 of year two. Committing to payroll before the engine is proven converts a low-risk, high-margin service into a venture that must raise on schedule. Sequencing the commitment removes that dependency at the cost of a slower roadmap, and the roadmap's own gates (v2 waits on proven consumer volume; v3 waits on referral-attorney conversion) already assume that pace.

**What the money buys, in one line:** the only product that computes the 11.07/AEDPA deadline-and-tolling posture, screens a Texas trial record for preserved error, IAC, Brady, and junk science, and hands the result to the person who actually writes the check — the inmate's family — for a tenth of what a lawyer charges to read the same file.

| | Option A — Lean (recommended now) | Option B — Funded (decide at Gate 3) |
|---|---|---|
| Cash in | ~$34k | ~$720k peak |
| Cash-positive | Month 10 post-launch | Mid-year 3 |
| 3-yr revenue | Slower ramp; consumer-led | ~$1.38M cumulative |
| Roadmap pace | v1.1 ~2 quarters late; v3 slips a year | Roadmap as written |
| Principal risk | Incumbent copies the wedge before v3 | Raise fails mid-build; payroll outruns proof |

---

## 2. The decision

Three questions are on the table, and they are separable:

1. **Do we build v1.0 at all?** — §3 (opportunity), §5 (financial case). *Recommended: yes.*
2. **Which market do we enter first?** — §4 (options). *Recommended: consumer/family, per the market study and PRD.*
3. **How do we fund it?** — §6. *Recommended: lean to launch, then reassess at a defined gate.*

Question 2 is effectively settled by the study and the PRD; it is restated here only because the financial case depends on it and a business case that cannot show its rejected alternatives is not a business case. Question 3 is the live one.

---

## 3. Opportunity (summary — evidence in the market study)

**The problem.** When a Texas conviction becomes final, the family faces a decision with no information: pay ~$3,000 for an attorney merely to read the file and opine on whether an Article 11.07 writ is plausible; pay $15k–$50k+ for representation on faith; or let the inmate file pro se from a TDCJ unit, where a weak application burns the effective one shot the subsequent-writ bar allows.

**Why no one serves it.** All five platforms studied — Westlaw+CoCounsel, Lexis+ AI/Protégé, vLex/Vincent, Everlaw, Casefleet — license to legal professionals, price per professional seat, and assume legal training. They are structurally unable to sell to a family, and the two obvious adjacent moves are blocked by free incumbents: research is free to every Texas bar member via vLex Fastcase, and ediscovery is free to innocence projects via Everlaw for Good.

**The white space.** Nine capabilities appear in none of the five: the 11.07/AEDPA deadline-and-tolling computation, exhaustion tracking, intake viability triage, Art. 11.073 junk-science screening, IAC affidavit workflow, clemency packet building, a knowledge-graph record view, on-prem deployment, and any consumer-facing product at all. That set is the moat, and it exists only once it ships.

**Market frame.** TAM $30B (global legal tech) · SAM $1.5–2B (US criminal defense / public defender) · SOM $50–100M (Texas post-conviction). The SOM is the honest number; the two above it are context, not a plan.

**The anchors that set the price.** $3,000 (human file review) above; $0 and alone (pro se) below. $299 sits where a family under financial stress can say yes without a second conversation.

---

## 4. Options considered

Five paths were evaluated against the same criteria: time to first revenue, capital required, defensibility, and the risk that a better-resourced player closes the window.

| # | Option | Verdict |
|---|---|---|
| 1 | **Do nothing / shelve** | Rejected. The specification set, architecture, and partial implementation are sunk; the white space is documented and unoccupied; the marginal cost of reaching launch is ~$34k in the lean configuration. Shelving forfeits a real option for a trivial saving. |
| 2 | **Professional-first** (Advocate/Chambers seats to attorneys) | Rejected as an *entry*. Longest sales cycle, competes against a free research floor, and requires the full workspace (graph UI, drafting, integrations) before first revenue. Retained as v3 — but earned, not assumed. |
| 3 | **B2G-first** (indigent-defense commissions, courts) | Rejected as an entry. Highest contract values and a genuine unserved need, but public procurement demands reference customers, published outcomes, security review, and accessibility conformance the product cannot yet produce. Retained as v4. |
| 4 | **License the analysis engine to an incumbent** | Rejected for now. It converts a category position into a component sale, caps the outcome at the licensee's ambition, and negotiates from zero leverage pre-launch. Revisit as an exit path once v1.0 has proven recall on real records. |
| 5 | **Consumer/family-first** (**chosen**) | Chosen. No competitor, shortest sales cycle (a credit card, not a procurement process), a straight line through the pipeline already scaffolded, and — decisively — it is the only entry that *hardens the analysis engine on paid real records*, which is the precondition for every later tier. |

**The strategic logic that ties them together:** each release monetizes the persona that proves the next one. Consumer volume proves the engine → proven engine plus consented referrals seeds the Justice tier → clinics become the reference customers attorneys trust → attorney subscribers and published outcomes are what survives public procurement. The options above are not alternatives so much as a sequence, and the business case is a case about *ordering*.

---

## 5. Financial case

### 5.1 Unit economics (per case, $299, ~3,000-page record)

| Line | Per case | Basis |
|---|---:|---|
| Revenue — base fee | $299.00 | PRD US-1 |
| Revenue — page overage (20% attach × $49) | $9.80 | `[estimated]` attach |
| Revenue — re-run (8% attach × $99) | $7.92 | `[estimated]` attach |
| **Effective ARPU (v1.0)** | **$316.72** | |
| COGS — OCR, LLM, embeddings/storage | $18.00 | market study §7.3 |
| COGS — payment processing | $9.00 | 2.9% + $0.30 |
| COGS — human QA (~30 min @ $25/hr loaded) | $12.50 | PRD US-8, non-optional |
| COGS — refund & chargeback reserve (5%) | $15.00 | consumer stress purchase |
| **Total COGS** | **$54.00** | **~83% gross margin** |
| **Contribution per case (pre-marketing)** | **$262.72** | |
| Less blended CAC at steady state (35% paid × $100) | −$35.00 | PRD ceiling |
| **Net contribution per case** | **$252.62** | |

From v1.1, the attorney-signed review add-on (~$499, 10% attach, ~$250 attorney cost) lifts ARPU to ~$366 and contribution to **$287.62**.

**Break-even is trivially low and that is the point:** against ~$500/mo of fixed cost, **1.9 cases/month**. Against fixed cost plus a $500/mo marketing test, **3.8 cases/month**. The PRD's day-90 target of 10 cases/month clears both with room.

### 5.2 Year 1 (2027) — monthly, base case

Volume ramps from the PRD's own targets (≥10/mo by day 90) and compounds as SEO and prison-family community channels mature.

| Month | Cases | Revenue | COGS | Fixed | Marketing | Contribution | Cumulative |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3 | $950 | $162 | $500 | $180 | $108 | $108 |
| 2 | 6 | $1,900 | $324 | $500 | $360 | $716 | $824 |
| 3 | 10 | $3,167 | $540 | $500 | $550 | $1,577 | $2,402 |
| 4 | 13 | $4,117 | $702 | $500 | $650 | $2,265 | $4,667 |
| 5 | 16 | $5,068 | $864 | $500 | $800 | $2,904 | $7,571 |
| 6 | 20 | $6,334 | $1,080 | $500 | $900 | $3,854 | $11,425 |
| 7 | 24 | $8,799 | $1,896 | $750 | $960 | $5,193 | $16,618 |
| 8 | 28 | $10,265 | $2,212 | $750 | $1,120 | $6,183 | $22,801 |
| 9 | 32 | $11,732 | $2,528 | $750 | $1,120 | $7,334 | $30,135 |
| 10 | 36 | $13,198 | $2,844 | $750 | $1,260 | $8,344 | $38,479 |
| 11 | 40 | $14,665 | $3,160 | $750 | $1,200 | $9,555 | $48,034 |
| 12 | 45 | $16,498 | $3,555 | $750 | $1,350 | $10,843 | **$58,877** |
| **Year 1** | **273** | **$96,694** | **$19,867** | **$7,500** | **$10,450** | **$58,877** | |

Month 7 is where v1.1's attorney-signed add-on lands (ARPU and COGS both step up) and where fixed costs rise for staging, monitoring, and a larger managed database. Gross margin holds at **79%** across the year.

### 5.3 Years 2–3 (base case)

| | Year 1 (2027) | Year 2 (2028) | Year 3 (2029) |
|---|---:|---:|---:|
| Consumer cases | 273 | 915 | 1,800 |
| Professional seats (avg live) | — | 25 (Q4 only) | 140 |
| B2G / Sovereign | — | — | $60,000 |
| **Revenue** | **$96,694** | **$345,207** | **$938,316** |
| COGS | $19,867 | $74,722 | $195,000 |
| Fixed opex | $7,500 | $21,600 | $34,200 |
| Marketing | $10,450 | $22,875 | $56,000 |
| **Product contribution** | **$58,877** | **$226,010** | **$653,116** |

Year 2 adds the Justice tier as a *cost* (~$7.5k of infrastructure and support at $0 price) — deliberately, because those clinics are the reference customers and the referral intake for everything after. Year 3 crosses ~150 cases/month, the threshold at which a dedicated GPU (~$350/mo) beats per-case cloud inference, taking ~$6 off COGS.

**Three-year cumulative: 2,988 cases, $1.38M revenue, $938k product contribution.**

### 5.4 The two P&L views — and why the difference matters

The contribution figures above exclude engineering payroll. That is the correct way to see the *product*, and the wrong way to see the *company*. Both views belong in the decision:

| | Product contribution | Payroll | **Net** |
|---|---:|---:|---:|
| Year 1 (2 FTE) | $58,877 | $336,000 | **−$277,123** |
| Year 2 (3 FTE) | $226,010 | $504,000 | **−$277,990** |
| Year 3 (3 FTE) | $653,116 | $504,000 | **+$149,116** |

Volume required to cover payroll, at $252.62 net contribution per case:

| Team | Annual fixed + payroll | Break-even |
|---|---:|---:|
| 1 FTE | $177,000 | **58 cases/mo** |
| 2 FTE | $345,000 | **114 cases/mo** |
| 3 FTE | $513,000 | **169 cases/mo** |
| 5 FTE | $849,000 | **280 cases/mo** |

Or, in the professional tier: **456 seats** covers a 3-FTE team; **744 seats** covers 5. Those are the honest thresholds, and they are the reason §1 recommends sequencing the funding decision rather than making it now.

---

## 6. Investment required and funding options

### 6.1 Pre-launch investment (4 months, Sep–Dec 2026)

Build parameters are taken from the implementation plan: ≈36–42 engineering-weeks plus a 15% buffer, 15–17 calendar weeks, two senior full-stack engineers plus a frontend contractor for the ~6 ew Daybreak track, launch-ready around late December 2026.

| Line | Cash-funded | Founder-built | Note |
|---|---:|---:|---|
| 2 senior engineers × 4 months @ $14k/mo `[estimated]` | $112,000 | — | founder labour in Option A |
| Frontend contractor (~6 ew @ ~$3k/ew) `[estimated]` | $18,000 | $18,000 | the plan does not close without this lane |
| Attorney launch-gate review (PRD §7.2) | $3,500 | $3,500 | $2–5k budgeted; midpoint |
| Eval ledger — attorney-labelled ground truth | $4,000 | $4,000 | external dependency; commission at S1 |
| Pre-launch infrastructure (4 mo) | $800 | $800 | |
| Entity, brand, T&C, privacy policy | $3,000 | $3,000 | |
| **Subtotal** | **$141,300** | **$29,300** | |
| Contingency 15% | $21,195 | $4,395 | |
| **Total** | **$162,495** | **$33,695** | |

Not capitalised here, because they are ongoing operating costs from launch: E&O insurance ($150–300/mo, a hard launch gate) and the ~$500/mo infrastructure baseline, both carried in fixed opex above.

### 6.2 Option A — Lean (recommended now)

**~$34k in, cash-positive in month 10, payback inside the first year.** The founders build; the only hard cash lines are the frontend contractor, the two attorney engagements, and incorporation. Cumulative contribution passes the $33,695 invested during month 10 post-launch.

*Cost:* the roadmap slows. v1.1 (Spanish, A/V, records concierge) slips roughly two quarters; v3 professional tiers slip about a year. *Risk accepted:* a longer window in which an incumbent — most plausibly Clearbrief's cite-to-record technology, or a Thomson Reuters "post-conviction skill" — could copy the wedge.

### 6.3 Option B — Funded (decide at Gate 3, not now)

**~$720k peak cash requirement, cash-positive mid-year 3.**

| | Cash flow | Cumulative |
|---|---:|---:|
| Pre-launch investment | −$162,495 | −$162,495 |
| Year 1 (2 FTE) | −$277,123 | −$439,618 |
| Year 2 (3 FTE) | −$277,990 | **−$717,608** ← peak |
| Year 3 (3 FTE) | +$149,116 | −$568,492 |

This buys the roadmap as written and closes the copy window. It also introduces the dependency the lean path avoids: payroll commitments made before the engine has been validated on paid real records. Note that headcount discipline is the whole lever — holding at 3 FTE in year 3 produces +$149k; growing to 5 produces −$187k on identical revenue.

### 6.4 Option C — Hybrid (the actual recommendation)

Run Option A to launch and through the first ~50 paid cases. At **Gate 3** (§9) the evidence exists to decide Option B on facts rather than projections: measured recall against the eval harness, real COGS telemetry, an observed CAC, and a QA rejection rate. A raise at that point is priced on a working product with paying customers rather than on a specification set — which is both cheaper capital and a better decision.

---

## 7. Benefits beyond the P&L

**Mission benefit, quantified.** Every review displaces a ~$3,000 attorney file-read with a $299 product: **$2,701 retained by each family**. At base-case volumes that is **~$737k in year 1** and **~$8.1M across three years** — the number that matters to foundations, to bar associations considering a member benefit, and to any B2G procurement that scores public value.

**Strategic option value.** A validated Texas engine is a template. The architecture is jurisdiction-parameterised, and the states with the next-largest post-conviction volumes (California, Florida, New York) are addressable without re-architecture. Nothing in the plan spends against that option; it simply exists once v1.0 works.

**Data asset.** The consented reference corpus of attorney-labelled findings compounds with volume and is the one asset an incumbent cannot buy or copy quickly — a better moat than any single feature in the white-space table.

**Harm reduction as product design.** Routing every strong-signal case toward counsel rather than toward pro se filing is an ethical requirement (PRD R-3), but it is also the referral funnel that seeds v2. The compliant design and the commercial design are the same design.

---

## 8. Risks

Ordered by expected impact. Mitigations that are already product requirements are cited to their spec, because a risk closed by the specification is closed.

| # | Risk | Likelihood / Impact | Mitigation | Owner |
|---|---|---|---|---|
| R1 | **UPL exposure** — selling a viability opinion to a non-lawyer edges toward unauthorized practice | Med / **Critical** | PRD §8 is product-shaping, not boilerplate: information not advice; no filing recommendations; persistent labelling; every strong signal routed to counsel. Attorney review is launch gate 2; E&O bound is gate 3. Referral list held to Tex. Occ. Code ch. 952 analysis (R-6) — no referral fees in any form until resolved | Founder + retained counsel |
| R2 | **Accuracy** — incumbents hallucinate at 17–33%; here an error costs liberty | Med / **Critical** | Grounding is a hard filter (FR-6/FR-7): a finding without a re-verifiable citation is dropped, not flagged. Recall-first eval harness gates launch and every router change (NFR-1). Human QA on 100% of reports (US-8), costed at $12.50/case | Engineering |
| R3 | **Volume never materialises** — the family channel is unproven; no competitor means no demonstrated demand | **High** / High | Lowest-cost falsification available: break-even is 2 cases/mo, so the test is cheap. Free eligibility screen (US-0) instruments demand pre-purchase. Bear case (109 cases, 40% of plan) still returns **+$19,051** contribution in year 1 | Product |
| R4 | **Payroll outruns proof** — commit to a team before the engine is validated | Med / High | This is exactly what Option C removes. Gate 3 is the commitment point | Founder |
| R5 | **COGS overrun** — OCR on aged scans, retries, long records | Med / Med | Three guardrails: 5,000-page cap with priced overage, no A/V in base product, cloud-first inference. Cost telemetry per case with budget alert (NFR-4). Stress-tested: COGS would have to double to $110 before year-1 contribution falls below **$43,589** | Engineering |
| R6 | **Incumbent copies the wedge** | Med / Med | Their pricing and per-seat licensing keep them structurally out of this buyer; the defensible asset is the labelled corpus and the habeas spine, not any one feature. Option C shortens the exposure window | Founder |
| R7 | **Execution gap** — specs describe a category-defining product; the codebase has mocked services | **High** / Med | Implementation plan §5 disposition register; walking skeleton end-to-end on staging by S3; pre-agreed scope-shed order that never touches the QA gate or disclosure archive | Engineering |
| R8 | **Capacity** — two engineers, with M4 complexity concentrated in one head; the Daybreak lane competes for the same person | High / Med | Frontend contractor staffs Daybreak (funded in §6.1 under **both** options); if unstaffed, the launch date moves visibly rather than silently | Founder |
| R9 | **Chargebacks above the 5% reserve** — emotional purchase, delayed delivery | Med / Med | OCR-confidence halt before full analysis spend (US-7); disclosure-acknowledgement archive for dispute defence (US-9); SLA clock starts at "records complete" and internal delays extend the customer's date visibly | Ops |
| R10 | **Brand** — "Snot Nose Legal" meets grieving families and public procurement | Med / Med | PRD R-5 brand gate: resolve before public site copy is written. Open question 4 | Founder |

**Sensitivity to the two drivers that matter most** (year-1 contribution, base fixed and marketing):

| Price | Bear (109 cases) | Base (273) | Bull (491) |
|---:|---:|---:|---:|
| $199 | $8,677 | $32,942 | $65,296 |
| $249 | $13,864 | $45,910 | $88,637 |
| **$299** | **$19,051** | **$58,877** | **$111,979** |
| $349 | $24,238 | $71,845 | $135,320 |

Every cell is positive. The consumer tier does not have a plausible configuration in which it loses money at these fixed costs — which is precisely why it is the right place to spend the first dollar and the wrong place to hang a payroll.

---

## 9. Stage gates and kill criteria

Each gate is a decision point with a pre-agreed outcome. Gates 1–2 are the PRD's launch gates, restated here in investment terms.

| Gate | When | Pass condition | If failed |
|---|---|---|---|
| **G1 — Technical viability** | End of S3 (walking skeleton) | Test-mode purchase drives a fixture end-to-end through one real Tier-2 screen to a rendered PDF on staging | Re-estimate; the plan's mid-point checkpoint at S4 absorbs one slip, not two |
| **G2 — Launch readiness** | Pre-launch | All four PRD §7 gates: eval harness green on both reference cases, attorney review complete, E&O bound, QA console operational with a trained reviewer | **Do not launch.** No gate on this list is sheddable |
| **G3 — Engine proven** *(the funding decision)* | ~50 paid cases | Per-category recall holds on real records; QA rejection <10%; zero post-release citation-fidelity failures; COGS ≤$54 rolling; CAC ≤$100 | Hold at lean operation; fix quality before spending on growth |
| **G4 — Demand proven** | Day 180 | ≥20 cases/mo and organic share rising month-over-month | Re-examine channel mix and price before any raise; the product works but the market doesn't |
| **G5 — Referral funnel** | Day 270 | ≥20% of strong-signal reports consent to clinic referral; 2–3 named clinics receiving | v2 Justice tier deferred; consumer business continues standalone |
| **Kill** | Any time | Two consecutive quarters below 5 cases/mo *after* G2 with CAC >$200, **or** any confirmed citation-fidelity failure reaching a customer that the QA gate should have caught | Wind down the consumer tier; preserve the engine and reconsider Option 4 (license) from §4 |

The kill criteria are deliberately asymmetric. Slow volume is survivable at a 2-case break-even and gets two quarters. A quality failure that reaches a family gets none, because the harm is irreversible and the product's entire claim is grounding.

---

## 10. Governance

| Cadence | Forum | Reviews |
|---|---|---|
| Weekly | Founder + engineering | Milestone burn-down against the implementation plan; blocked launch gates |
| Monthly | Founder | Cost telemetry vs. the $54 COGS budget (NFR-4); CAC by channel; QA rejection rate |
| Quarterly | Founding team | This document — assumptions in §11 re-based against actuals; pricing guardrails; roadmap gate status |
| Event-driven | Founder + counsel | Any surface change altering what a non-lawyer sees (standing UPL review) |

Instrumentation for every metric above is specified in `../specifications/analytics_experimentation_plan.md`, which is the measurement contract; this document does not define its own telemetry.

---

## 11. Assumptions register

Every driver behind §5–§6. Sourced assumptions cite their document; `[estimated]` marks a judgement call that a reviewer should feel free to overturn — the model is a spreadsheet of these numbers and nothing more.

| # | Assumption | Value | Source |
|---|---|---|---|
| A1 | Base price | $299 | market study §6, PRD US-1 |
| A2 | Total COGS per case | $54 | market study §7.3 |
| A3 | Page-overage attach | 20% × $49 | `[estimated]` |
| A4 | Re-run attach | 8% × $99 | `[estimated]` |
| A5 | Attorney-signed add-on, from v1.1 | 10% × $499, $250 cost | PRD R-4 price; `[estimated]` attach |
| A6 | Fixed opex at launch → month 7 | $500 → $750/mo | market study §7.4 |
| A7 | CAC ceiling | $100/case | PRD §9 |
| A8 | Paid-acquisition share | 60% → 30% over year 1; 25% year 2; 20% year 3 | `[estimated]` — assumes SEO/community compounding |
| A9 | Year-1 volume ramp | 3 → 45/mo | anchored on PRD ≥10/mo by day 90; ramp `[estimated]` |
| A10 | Year-2 volume | 50 → 105/mo | `[estimated]` |
| A11 | Year-3 volume | ~150/mo average | `[estimated]`; crosses the GPU threshold |
| A12 | Loaded senior engineer cost | $14,000/mo | `[estimated]` |
| A13 | Frontend contractor | ~6 ew @ ~$3k/ew | implementation plan §2 scope; rate `[estimated]` |
| A14 | Blended professional seat ARPU | $130/mo | Advocate $99 / Chambers $249 mix, market study §6 |
| A15 | Professional seat COGS | 25% of seat revenue | `[estimated]` |
| A16 | First Sovereign/B2G licence, year 3 | $60,000 | `[estimated]` — quote-based tier, no comparable published |
| A17 | Justice tier cost (price $0) | ~$7.5k across year 2 | `[estimated]` |
| A18 | GPU switch saving from ~150 cases/mo | −$6/case COGS, +$350/mo fixed | `cost_optimization_ollama.md` |
| A19 | Refund/chargeback rate | 5% of revenue (in COGS) | PRD §9 reserve |
| A20 | Attorney file-review anchor | ~$3,000 | market study §4.4 |

**Known weaknesses in this model, stated plainly.** Volume (A9–A11) is the least-supported input in the document and drives everything: there is no competitor to benchmark against precisely because no one serves this persona, which is simultaneously the opportunity and the reason demand is unproven. The bear case exists to show that being wrong about it by 60% is survivable, not to suggest that the base case is safe. Attach rates (A3–A5) and the B2G licence value (A16) are judgement; the seat economics (A14–A15) rest on the tier structure in the market study, which was priced against competitors rather than against willingness-to-pay research. None of these change the recommendation, because the recommendation is specifically designed to defer the large commitment until the assumptions have been replaced by measurements.
