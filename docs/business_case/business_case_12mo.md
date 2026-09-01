# 12-Month Business Case — Family Case Review (Sep 2026 – Aug 2027)

**Status:** For decision · **Owner:** Product/Finance · **Prepared:** 2026-08-30 · **Updated:** 2026-09-01
**Sources:** `snotnoselegal_market_study_mvp_gtm` (market frame §1, pricing §6, unit economics §7, GTM §8) · `mvp_v1_prd.md` · `product_roadmap.md` · `../implementation/mvp_v1_implementation_plan.md` (build status & timeline) · PO decisions of Aug 2026 (SLA, pricing, brand, tax, stack) · **live-measured pipeline costs from the first real reference-case runs (Aug 30, 2026)** · **Sep 1, 2026 actuals: production provisioning, automated QA decision, attorney-signed eval ledgers, instrumented full-case COGS**

---

## 0. Update log — 2026-09-01 (what changed since prepared)

Material facts that have moved since this case was written; sections below carry dated inline edits.

1. **Manual QA is removed from the operating model.** The PO decision to eliminate the human-review bottleneck shipped as an automated QA gate (`auto_qa_hold_workflow.md`): screens-complete, minimum-findings, drop-ratio, and render re-verification checks auto-deliver passing reports; failures hold with a customer notice and a 24-hour manual-triage SLA; the founder spot-checks a sample rather than touching every report. `AUTO_APPROVE=1` is armed. This deletes the ~$12.50/report QA cost line (§5), removes the ~50-case/month solo throughput ceiling (§8c, §12d), and converts Lever 1 of §8b from a plan into shipped software.
2. **Engineering is complete and production is provisioned** — not "four months to launch-ready." As of Sep 1: full loop proven repeatedly on both reference cases end-to-end (purchase → upload → digitize → analyze → auto-QA → delivered PDF); Render production stack live (Ohio: web, api, Postgres w/ PITR, Redis, clamav — the §5b ~$88/mo actuals); promo engine, customer-feedback program, retention tiering (S3 lifecycle), Sentry/PostHog wired and verified. Remaining launch work is **business, not build**: DNS cutover, Stripe live-mode webhook, E&O, counsel sign-offs, credential rotation.
3. **Launch gate 1 is met early:** the reviewing attorney signed **both** reference-case eval ledgers (Sep 1). Current harness state: Gary case **green 5/5** must-finds (64 findings, auto-delivered as the first live AUTO_APPROVE case); Brian case **2/4** on the latest fresh run (run-variance remediation — sample count 3 + larger output cap — is scoped and pending a go decision, ~$12 of re-run spend). The Dec-26 "no eval green, no launch" checkpoint stands for the Brian ledger.
4. **COGS is now instrumented per case, not estimated:** Gary case **$4.66** all-in tech (model $3.75 + OCR $0.91, scanned 602-pp record), Brian case **$9.42** (born-digital transcript-heavy record, all model, 2-sample union). Batch API validated at ~50% model-cost reduction ($1.75 Gary harness run). §5 updated.
5. **Trial GTM in place:** admin-managed 100%-off promo codes with atomic cap enforcement and a Stripe-free $0 fulfillment path, live-verified — EARLYBIRD (25 uses, early adopters) and SNOT26 (**5 uses**, trial offer). 30 free slots ≈ **~$200–300 of COGS as the launch marketing/testimonial budget** — under one month of the $500 paid-channel floor.
6. **Spanish pulled forward:** the v1.1 "Spanish purchase flow" item partially shipped Sep 1 — bilingual landing, auth, buy-flow disclosures (English-governs banner pending counsel), and a plain-language documents guide, with a per-release parity gate (`i18n_localization.md`). The Spanish **report Part A** remains v1.1. Adds a one-time ~$200–400 professional translation review before Spanish ad spend.
7. **New recurring obligations created:** 24-hour QA-hold triage SLA (founder), promo redemption monitoring, and the counsel review queue now includes the rewritten disclosure set (`2026-09-01.1`, training-use promise removed), TX/FL/CA disclosure pages, and the Spanish legal copy.

## 1. Executive summary

Snot Nose Legal's **Family Case Review** sells a $299 flat-fee, AI-analyzed, quality-gated review of a Texas criminal court record to the one persona in the post-conviction market no incumbent serves and who actually pays: the inmate's family. The competitive anchor is not software but the **~$3,000 attorney file review** and the $0 pro se path that burns a family's only writ shot. The market study establishes genuine white space (habeas-specific analysis; consumer access) that none of the five incumbent platforms can enter without abandoning their per-professional-seat licensing.

This case models the next 12 months: four months to launch-ready (per the implementation plan) and eight months of operation. *(Updated 2026-09-01: the build finished early — the full loop is proven end-to-end on both reference cases, production is provisioned on Render, and automated QA is live; the Sep–Dec phase is now legal/business gate work, not engineering. See §0.)*

**The headline numbers (base case):** first-year revenue ≈ **$36k**, peak cumulative cash need ≈ **$78k**, monthly contribution turns positive around **~30 cases/month** at current cost structure — i.e., the business does not self-fund inside 12 months at bootstrap staffing; it buys three things instead: a **proven engine on paid real records**, the **reference metrics** (recall, refund rate, CAC by channel) that de-risk every later tier, and the **referral flywheel** into the Justice/Advocate tiers where the durable revenue lives (roadmap v2/v3). The recommendation (§10) is to proceed, with the pre-agreed kill/pivot checkpoints in §8.

## 2. Problem & product

When a Texas felony conviction becomes final, the family faces a brutal information gap: pay ~$3,000 for an attorney merely to read the file, pay $15k–$50k+ for representation on faith, or let the inmate file pro se — where a weak application burns the effective one shot Texas's subsequent-writ bar allows. **The product sells the decision, not the writ**: every finding grounded to page and line, screened for the six claim families (preserved error, IAC, Brady, 11.073 junk science, sentencing/deadlines, jury selection), passed through an automated QA gate, and delivered as Part A (plain English) + Part B (attorney-ready packet).

**Trust is the product.** The engineering enforces it structurally: findings whose quotes aren't verbatim in the record are dropped by a hard filter; citations are hash-anchored and re-verified at every render; every report clears automated quality gates before delivery — failures hold for human review on a stated 24-hour SLA rather than shipping — with founder spot-checks on a sample; deletion, refunds, and disclosures are audited operations, not promises.

## 3. Market

| Measure | Size | Definition |
|---|---|---|
| TAM | $30B | Global legal tech & legal AI |
| SAM | $1.5–2B | US criminal defense / public defender legal tech |
| SOM | $50–100M | Texas post-conviction — the nation's highest Art. 11.07 writ volume |

The consumer wedge is deliberately unsized by incumbents: all five platforms license to lawyers. Texas structural facts driving demand: IAC is the dominant claim; most 11.07 applications are filed pro se; the AEDPA one-year clock is miscalculated fatally and computed by no platform; decades-old scans break incumbents' tooling (our Textract pipeline with per-page confidence is built for exactly these — proven this week on a real 602-page reporter's record).

**Competitive floor:** research is free to the Texas bar (vLex), document review is free to nonprofits (Everlaw for Good). The product never positions as either.

## 4. Pricing & offer (as decided, Aug 2026)

| Offer | Price | Notes |
|---|---|---|
| Family Case Review | **$299 one-time** | Uniform across trial and plea lanes (PO decision); 5,000-page cap |
| Page overage | +$49 / 2,500 pages | Charged in-flow only when the count crosses the line |
| Re-run with new documents | $99 | After report delivery |
| Attorney-signed review add-on | ~$499 | v1.1 (from ~May 2027); licensed TX attorney per review |
| Payment options | Stripe-native installments (Affirm/Klarna) | Stripe Tax enabled; TX data-processing determination pending |

10-business-day SLA from records-complete. Later tiers (Advocate $99/seat, Chambers $249/seat, Justice $0-to-cap, Sovereign site license) are out of this case's revenue but are its strategic payoff.

## 5. Unit economics

Study budget vs. what the pipeline **actually measured** — updated 2026-09-01 with instrumented full-case costs (CostRecord table) from complete fresh runs of both reference cases at the final configuration (6 screens, context pre-pass, 2-sample union):

| Cost line | Study budget | Measured (Sep 1, 2026) | Note |
|---|---|---|---|
| OCR | ~$5 / 3,000 pp | **$0.91** (Gary: 602 pp scanned × Textract $1.50/1k); **$0** (Brian: born-digital) | scales ~$7.50 at the 5,000-page cap |
| LLM analysis | ~$12 | **$3.75–$9.42/case** (Claude Opus 5; range = scanned vs transcript-heavy record) | batch API validated at ~50% off these numbers ($1.75 Gary harness run); economics gate enforces the batch path |
| Embeddings + storage | ~$1 | S3 pennies; 90-day lifecycle tiering applied; embeddings paused by design | |
| Payment processing | ~$9 | 2.9% + $0.30 | + 0.5% Stripe Tax when taxable; **$0 on promo-trial cases** (no Stripe on the free path) |
| Human QA | ~$12.50 | **$0 — automated QA gates + founder spot-check sample** (auto_qa_hold_workflow.md; AUTO_APPROVE live) | holds route to a 24h manual triage; founder time, not cash |
| Refund/chargeback reserve | ~$15 | 5% of revenue | consumer stress purchases |
| **Total COGS** | **~$54** | **~$29–34 measured** (tech $5–10 + Stripe ~$9 + reserve ~$15) | **~89% gross margin at $299** |

This case's tables still model the conservative **$54**; the measured trend is upside and the QA line's removal is structural, not situational (see §8b Lever 1, now shipped).

## 5b. External tools & services — the documented monthly stack (added 2026-08-31)

The hosting/tooling line items are now provisioned and priced, not estimated (canonical register with tiers and upgrade triggers: `docs/operations/external_services.md`):

| Category | Services | $/month |
|---|---|---:|
| Hosting (Render, decided platform) | web $7 · api $25 · Postgres w/ PITR ~$20 · Redis $10 · clamav scan $25 | ~$87 |
| Domain | snotnoselegal.com (~$15/yr) | ~$1 |
| Email / errors / analytics / uptime / CI | Resend · Sentry · PostHog · UptimeRobot · GitHub — all inside free tiers at launch | $0 |
| **Fixed tools total** | | **~$88** |
| Usage-based (in per-case COGS, §5) | Anthropic ~$1.75–3.30/case (batch) · Textract ~$0.90/case · S3 <$5/mo · Stripe ~2.9%+$0.30 | scales with cases |

**Impact on the model:** the solo-founder cash model (§8c) budgeted **$150/mo** for hosting; the provisioned reality is **~$88/mo** — a ~$62/mo favorable variance that also pre-funds the first paid-tier upgrades (Resend $20, Sentry $26 at ~100 cases/mo) without touching the budget line. Cash break-even stays ~4 cases/month; the variance is retained as buffer rather than re-plumbed through the tables.

## 6. 12-month plan

| Phase | Months | Contents | Source |
|---|---|---|---|
| Finish build → launch gates | Sep–Dec 2026 | **Build complete as of Sep 1** (batch, PDF render, analytics, auto-QA, promos, feedback, Spanish P0 all shipped; production provisioned). Remaining gate work is business-side: Brian-ledger eval green, counsel sign-offs (disclosures `2026-09-01.1`, state pages, Spanish legal copy), E&O bound, DNS + Stripe live, credential rotation. **Launch can pull forward from Jan-27 if the gates clear early — a favorable schedule variance this case does not spend** | implementation plan §3/§7; Sep 1 actuals |
| Launch | Jan 2027 | TX-only, SEO + prison-family communities + clinic-declined referrals first; paid search as a capped test | market study §8.2 |
| Ramp | Feb–Apr 2027 | 90-day target ~10 paid cases/mo; S0 outcome-mix report validates market sizing | analytics plan §5 |
| v1.1 | ~Apr–May 2027 | Spanish Part A + purchase flow; attorney-signed add-on; A/V add-on priced | roadmap v1.1 |
| Justice-tier seeding | Jun–Aug 2027 | Consented high-viability referrals to 2–3 clinics — the v2 gate | roadmap v2 |

## 7. Financial model — three scenarios

**Assumptions (labeled):** bootstrap staffing (founder unpaid + part-time senior contractor: $8k/mo build, $6k/mo operating — the funded-team alternative per the implementation plan runs ~$30k/mo and is shown in §8); fixed infra + E&O ~$600/mo (study §7.4); counsel $4k one-time (Nov, gate 2) + $500/mo retainer from launch; marketing = max($500/mo test budget, blended CAC $60 on the ~50% of cases from paid channels — organic channels are the durable base); overage attach 10%, re-run 5%; attorney-signed add-on 8% attach from May 2027 (base/upside only) at $250 attorney cost; volumes per the study's break-even ladder with the 90-day ~10/mo target hit in March (base).

### Conservative scenario

| Month | Cases | Revenue | COGS | Gross | Opex | EBITDA | Cumulative |
|---|---|---|---|---|---|---|---|
| Sep-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-8,600 |
| Oct-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-17,200 |
| Nov-26 | 0 | $0 | $0 | $0 | $12,600 | $-12,600 | $-29,800 |
| Dec-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-38,400 |
| Jan-27 | 2 | $598 | $108 | $490 | $7,600 | $-7,110 | $-45,510 |
| Feb-27 | 3 | $897 | $162 | $735 | $7,600 | $-6,865 | $-52,375 |
| Mar-27 | 5 | $1,495 | $270 | $1,225 | $7,600 | $-6,375 | $-58,750 |
| Apr-27 | 7 | $2,142 | $378 | $1,764 | $7,600 | $-5,836 | $-64,586 |
| May-27 | 9 | $2,740 | $486 | $2,254 | $7,600 | $-5,346 | $-69,932 |
| Jun-27 | 11 | $3,437 | $594 | $2,843 | $7,600 | $-4,757 | $-74,689 |
| Jul-27 | 13 | $4,035 | $702 | $3,333 | $7,600 | $-4,267 | $-78,956 |
| Aug-27 | 15 | $4,682 | $810 | $3,872 | $7,600 | $-3,728 | $-82,684 |

**Year totals — revenue $20,026, EBITDA $-82,684; peak cumulative cash need $82,684; first EBITDA-positive month: not in window.**

### Base scenario

| Month | Cases | Revenue | COGS | Gross | Opex | EBITDA | Cumulative |
|---|---|---|---|---|---|---|---|
| Sep-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-8,600 |
| Oct-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-17,200 |
| Nov-26 | 0 | $0 | $0 | $0 | $12,600 | $-12,600 | $-29,800 |
| Dec-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-38,400 |
| Jan-27 | 3 | $897 | $162 | $735 | $7,600 | $-6,865 | $-45,265 |
| Feb-27 | 6 | $1,843 | $324 | $1,519 | $7,600 | $-6,081 | $-51,346 |
| Mar-27 | 10 | $3,039 | $540 | $2,499 | $7,600 | $-5,101 | $-56,447 |
| Apr-27 | 13 | $4,035 | $702 | $3,333 | $7,600 | $-4,267 | $-60,714 |
| May-27 | 17 | $5,779 | $1,168 | $4,611 | $7,610 | $-2,999 | $-63,713 |
| Jun-27 | 21 | $7,474 | $1,634 | $5,840 | $7,730 | $-1,890 | $-65,603 |
| Jul-27 | 25 | $8,670 | $1,850 | $6,820 | $7,850 | $-1,030 | $-66,633 |
| Aug-27 | 30 | $10,313 | $2,120 | $8,193 | $8,000 | $193 | $-66,440 |

**Year totals — revenue $42,050, EBITDA $-66,440; peak cumulative cash need $66,633; first EBITDA-positive month: Aug-27.**

### Upside scenario

| Month | Cases | Revenue | COGS | Gross | Opex | EBITDA | Cumulative |
|---|---|---|---|---|---|---|---|
| Sep-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-8,600 |
| Oct-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-17,200 |
| Nov-26 | 0 | $0 | $0 | $0 | $12,600 | $-12,600 | $-29,800 |
| Dec-26 | 0 | $0 | $0 | $0 | $8,600 | $-8,600 | $-38,400 |
| Jan-27 | 5 | $1,495 | $270 | $1,225 | $7,600 | $-6,375 | $-44,775 |
| Feb-27 | 9 | $2,740 | $486 | $2,254 | $7,600 | $-5,346 | $-50,121 |
| Mar-27 | 14 | $4,334 | $756 | $3,578 | $7,600 | $-4,022 | $-54,143 |
| Apr-27 | 19 | $5,878 | $1,026 | $4,852 | $7,670 | $-2,818 | $-56,961 |
| May-27 | 25 | $8,670 | $1,850 | $6,820 | $7,850 | $-1,030 | $-57,991 |
| Jun-27 | 31 | $10,612 | $2,174 | $8,438 | $8,030 | $408 | $-57,583 |
| Jul-27 | 38 | $13,253 | $2,802 | $10,451 | $8,240 | $2,211 | $-55,372 |
| Aug-27 | 45 | $15,845 | $3,430 | $12,415 | $8,450 | $3,965 | $-51,407 |

**Year totals — revenue $62,827, EBITDA $-51,407; peak cumulative cash need $57,991; first EBITDA-positive month: Jun-27.**


## 8. Cash need, staffing sensitivity, and checkpoints

- **Funding requirement (bootstrap):** peak cumulative need ≈ **$78k (base)** / $83k (conservative) / $72k (upside). Round to a **$100k envelope** for working-capital comfort (chargebacks, Textract/LLM spikes, counsel overruns).
- **Funded-team alternative:** at the implementation plan's full staffing (~$30k/mo), the same 12 months need ≈ **$320–350k**. The bootstrap path is viable precisely because the build is largely done; choose funded staffing only if v1.1/v2 acceleration is worth buying.
- **Sensitivity (base case):** CAC doubling to $120 costs ~$5k/yr (manageable — contribution/case ≈ $245); COGS at the measured ~$45 adds ~$1.5k/yr; a $349 price test (+17%) adds ~$8k/yr revenue at unknown conversion cost — run it only through the §4.3-compliant experiment path. The model is **volume-dominated**: the single number that matters is paid cases/month.
- **Checkpoints (pre-agreed):**
  - **Dec 2026:** eval harness green + attorney sign-off, or launch slips — do not launch on an unproven engine. *(Status Sep 1: attorney signed both ledgers; Gary case green 5/5; Brian case 2/4 pending the scoped run-variance remediation — this checkpoint is more than half met, three months early.)*
  - **Mar 2027 (90 days post-launch):** ≥ 8–10 cases/mo and refund rate ≤ 5% → continue; materially below → the S0 outcome-mix data decides pivot (plea-lane emphasis, price, or channel) before more spend.
  - **Jun 2027:** ≥ 20% referral opt-in → begin Justice-tier seeding (the v2 gate); below → double down on B2C channels first.


## 8b. The path to profitability (BA answer to "how do we make money on this")

The base case loses money for exactly one structural reason: **fixed operating cost ($7.6k/mo) needs ~31 cases/month to cover at $245 contribution, and the ramp only reaches 30 by month 12.** Profitability is therefore engineered from three levers, in order of leverage:

**Lever 1 — lean operations (the big one). *Shipped as software, 2026-09-01.*** The $6k/mo operating contractor is 79% of post-launch opex, budgeted for a build that is *already done*. Founder-run operations with an on-call contractor (~$1.5k/mo) cut fixed cost to ~$3.1k/mo → **break-even falls from 31 to 13 cases/month** — inside the study's own 90-day trajectory. The automated QA gate goes further than the lean-rate assumption: passing reports deliver with zero marginal labor (spot-check sample only), and the failure path is a bounded 24h triage queue, so this lever no longer depends on anyone's discipline — it is the default behavior of the system.

**Lever 2 — contribution stacking (no new customers needed).** Measured COGS (~$45, not $54) + overage/re-run attach + the v1.1 attorney-signed add-on pulled forward (10% attach × $249 margin) lifts contribution from $245 to **~$289/case** → break-even ~**11 cases/month**.

**Lever 3 — Advocate-tier early access (recurring revenue, warm leads).** The QA console is already the attorney workspace dogfood, and the referral list produces warm attorney contacts from month one. An early-access Advocate seat at $99/mo needs no new engineering to pilot: **10 seats ≈ 3 cases of monthly contribution, 25 seats ≈ 9 — recurring.** This is the roadmap's Phase-3 revenue sampled early, without gating v2.

**Re-modeled (lean ops + stacked contribution, same base volumes):**

| Post-launch month | Cases | EBITDA | Cumulative |
|---|---|---|---|
| Jan-27 | 3 | −$2,338 | −$40,738 |
| Feb-27 | 6 | −$1,527 | −$42,265 |
| Mar-27 | 10 | −$511 | −$42,776 |
| **Apr-27** | 13 | **+$350** | −$42,426 |
| May-27 | 17 | +$1,903 | −$40,523 |
| Jun-27 | 21 | +$2,799 | −$37,724 |
| Jul-27 | 25 | +$3,695 | −$34,029 |
| Aug-27 | 30 | +$5,212 | −$28,817 |

**Monthly EBITDA turns positive in April 2027 (month 4 post-launch)**, peak cash need drops from ~$78k to **~$43k**, and the exit run-rate (~$5k/mo EBITDA and climbing, before any Advocate seats) pays back the build burn during year two. Add 25 early-access Advocate seats and break-even arrives a month earlier with ~$2.5k/mo of recurring on top.

**What this does NOT change:** the volume dependency. Every lever above lowers the bar; only the channels (clinic-declined referrals at zero CAC, SEO, communities) clear it. The March checkpoint in §8 remains the decision that matters.


## 8c. The solo-founder cash model (the operator's actual position)

Sections 7–8b model *staffed* scenarios from the implementation plan's team assumptions. The operating reality is **one founder, home-based, no payroll** — which converts the model from a P&L question into a cash-flow question, and changes the answer dramatically:

- **Fixed cash ≈ $1,100/month** (hosting budgeted ~$150 — provisioned actual ~$88, see §5b; E&O ~$250, counsel pay-as-you-go ~$200, $500 marketing floor). No salaries, no office.
- **Cash contribution ≈ $278/case** — cash COGS is ~$31 (OCR + LLM + storage + Stripe + expected refunds), consistent with the Sep-1 instrumented range (§5). *(Updated 2026-09-01: QA is no longer founder time per case — automated gates deliver passing reports; founder time is a spot-check sample plus the 24h hold-triage queue.)*
- **Cash break-even: ~4 cases/month.**

| Phase | Cash position |
|---|---|
| Build (Sep–Dec 2026) | −$4,850 total (hosting + $4k counsel gate + E&O binding) |
| Jan-27 (3 cases) | −$296/mo → cumulative −$5,146 |
| Feb-27 (6) | +$557 → −$4,589 |
| Mar-27 (10) | +$1,629 → −$2,960 |
| **Apr-27 (13)** | +$2,532 → **−$428 (effectively recovered)** |
| May-27 (17) | +$4,151 → **+$3,723 cumulative positive** |
| Aug-27 (30) | +$8,032/mo → +$23,273 cumulative |

**Read:** on the base volume ramp, the entire venture recovers its cash by ~May 2027 and exits the year at an ~$8k/month cash run-rate — total capital at risk under **$6k** plus founder time.

**The honest disclosures that keep this rigorous:** (1) founder time is the real investment — with QA automated (2026-09-01) the old ~50–80 case/month QA ceiling is gone, and the solo binding constraint shifts to **support + hold-triage + everything else**, plausibly 100+ cases/month before paid help returns to the model (a good problem; when it does, it re-enters as support/ops labor, not per-report QA, leaving contribution strong); (2) sweat equity is deferred compensation, not free — the staffed scenarios in §7 remain the true economic cost of the business and the basis for any future hiring or investment conversation; (3) volume remains the gating variable — 4 cases/month is a low bar, but it is still a bar the channels must clear.

## 9. Risks (top 5, from SWOT + study §8.4 + risk register)

| Risk | Mitigation |
|---|---|
| UPL exposure on the consumer tier | Information-report framing throughout (built); counsel gate 2; attorney-signed add-on keeps a human path; never route toward pro se filing |
| Volume doesn't materialize (the model's dominant risk) | Channels are cheap and compounding (SEO, communities, clinic referrals); checkpoints cap the downside; contribution ≈ $245/case means even small volume is not cash-destructive |
| Chargebacks/refunds above 5% | W-2 disclosure archive per case (built — the E-6 evidence packet is one query); 10-day SLA honesty; reserve modeled |
| Incumbent module entry | The moat is the white-space spine + consumer trust surface; incumbents' seat-licensing makes B2C structurally awkward for them |
| Model-quality regression / eval not green | Recall-first harness on attorney-labeled ledgers is a launch **gate**, not a hope; live runs already shook out real pipeline defects pre-launch |
| Auto-delivery quality escape (added 2026-09-01: no human reads every report) | Layered gates (grounding filter, render re-verification, screens-complete/min-findings/drop-ratio checks) fail **closed** into a 24h human-triage hold; founder spot-check sample; per-case feedback survey as the customer-side detector; kill switch is one env var (`AUTO_APPROVE=0`) |

## 10. KPIs (weekly, from the analytics plan)

Landing→check ≥ 25% · check completion ≥ 80% · fit→ack ≥ 60% · ack→paid ≥ 70% · **S0 outcome mix** (the market-validation panel) · time-to-records-complete · QA rejection < 10% · refund ≤ 5% · COGS/case ≤ $54 · north star: **completed reviews that reach a lawyer**.

## 11. Recommendation

**Proceed on the bootstrap path with a $100k working-capital envelope.** The first year is an investment year by design: the P&L loss (~$78k base) purchases a proven, eval-gated analysis engine on paid real records, channel economics measured against the study's targets, and the pre-triaged referral pipeline that gates the Justice tier — the sequence the study identifies as the only durable route to the $50–100M Texas SOM. The two disciplines that keep the downside bounded: the launch gates are hard (no eval green, no launch), and the March volume checkpoint decides pivot with data, not hope.

## 12. Expansion model — two additional high-post-conviction states (BA answer to "what if we expand")

### 12a. State selection

Criteria: post-conviction demand (state prison population as proxy), a document-centric vehicle the engine can screen, a hard deadline that makes the product urgent, records accessibility, and UPL climate. Approximate 2025–26 state prison populations: TX ~134k, CA ~93k, FL ~85k, GA ~50k, OH ~45k, PA ~37k, NY ~33k.

| State | Pop. (≈) | Vehicle & deadline | Fit notes |
|---|---|---|---|
| **Florida (pick #1)** | 85k | Rule 3.850 motion, **hard 2-year deadline** | Unified statewide rules, strong e-filing/clerk access, huge pro se volume; deadline engine is directly monetizable. Caution: the Florida Bar is the nation's most aggressive UPL enforcer (*Fla. Bar v. TIKD*) — counsel opinion is a launch gate, not a formality. |
| **California (pick #2)** | 93k | § 1473 habeas + resentencing wave (§ 1172.6 felony-murder, SB 483) | Largest addressable population after TX; § 1473(e) (false/repudiated expert evidence) is a statutory analog to TX 11.073 — the junk-science screen ports naturally. Costs: county-by-county practice, fragmented/expensive transcripts, dense free legal-aid ecosystem. |
| Pennsylvania (alternate) | 37k | PCRA, **1-year deadline** | Best product-fit-per-build-dollar (unified statute, hard clock, active CIU culture) but ~40% of CA's population. Named swap-in if CA build cost or records friction proves heavy. |

### 12b. What a state launch actually costs

Per state: vehicle/checklist/deadline-calendar build + screen-prompt adaptation + state disclosure set (founder time, ~6–8 weeks part-time); UPL counsel opinion ~$4k; eval corpus — one attorney-labeled reference case, records + labeling ~$2.5k; foreign qualification/registered agent ~$500. **One-time ≈ $7k cash per state**, plus **≈ $550/month incremental fixed** while active ($500 marketing floor + E&O/agent increment). The analysis engine itself is state-agnostic by construction (grounding, QA gate, event spine); what changes is legal framing — and the **per-state eval ledger green is the same hard launch gate TX has**.

### 12c. Sequencing (gated, solo-founder-realistic)

TX launch Jan-27 unchanged → **FL commit only if the Mar-27 TX checkpoint passes** (build Feb–Apr, launch May-27) → **CA commit only if FL's own 90-day look holds** (build Jun–Aug, launch Sep-27). Expansion ramps modeled at ~60% of the TX curve (population ratio × no-local-network discount).

### 12d. Solo cash model, horizon extended to Feb-28

Assumptions as §8c ($278/case cash contribution, $1,100/mo base fixed) plus the per-state costs above; when combined volume crosses ~50 cases/month the solo QA ceiling binds and hired QA (~$25/case, Lever 1's lean rate) is applied to **all** cases from that month. *(Updated 2026-09-01: with QA automated, the ~50-case trigger and the $25/case hire are now a conservatism — the real trigger is support/hold-triage load, later and cheaper. The table below is kept unchanged as the downside-safe version; every row from Oct-27 on is therefore understated.)*

| Month | TX | FL | CA | Total | Net cash | Cumulative | TX-only cum. |
|---|---|---|---|---|---|---|---|
| Jan-27 | 3 | – | – | 3 | −$266 | −$5,116 | −$5,116 |
| Mar-27 | 10 | – | – | 10 | +$1,680 | −$2,868 | −$2,868 |
| Apr-27 | 13 | – | – | 13 | −$4,486 *(FL launch spend)* | −$7,354 | −$354 |
| May-27 | 17 | 2 | – | 19 | +$3,632 | −$3,722 | +$3,272 |
| Aug-27 | 30 | 8 | – | 38 | +$1,914 *(CA launch spend)* | +$10,460 | +$21,100 |
| Oct-27 | 34 | 13 | 4 | 51 | +$10,703 *(QA hire binds)* | +$31,473 | +$37,248 |
| **Dec-27** | 38 | 18 | 9 | 65 | +$14,245 | **+$58,192 (crossover)** | +$55,620 |
| Feb-28 | 42 | 21 | 14 | 77 | +$17,281 | **+$91,236** | +$76,216 |

### 12e. Reads

- **Inside the original 12-month window, expansion is cash-negative relative to staying TX-only** (+$10.5k vs +$21.1k by Aug-27): $14k of launch spend plus early-ramp months. Anyone evaluating on the 12-month frame alone should not expand.
- **The crossover lands ~Dec-27** (8 months after FL launch), and by Feb-28 the expanded business is **+$15k ahead and diverging ~$2k+/month**, exiting at a ~$17.3k/month cash run-rate vs ~$10.6k TX-only — with SOM roughly **2.3×** the TX-only frame and three states of Justice-tier seeding ground.
- **Expansion forces the capacity decision early**: combined volume hits the ~50-case solo ceiling in Oct-27 — a good problem, already priced into the table via hired QA. The founder's binding constraint shifts from demand to throughput a full year earlier than TX-only.
- **The dominant risk is unchanged and now tripled**: volume per state. Each state's Mar-27-style 90-day checkpoint caps its downside at ~$7k + ~$550/mo, individually killable without touching the others.

### 12f. Recommendation

**Plan FL now, commit at the Mar-27 checkpoint; hold CA until FL's 90-day read; keep PA as the named alternate.** The engine and spine are state-agnostic; each expansion buys ~0.6× a Texas at ~$7k entry cost, with per-state kill switches. Do not let expansion jump the TX launch gates — a second state doubles distribution, not proof.
