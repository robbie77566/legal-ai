# Persona Rollout & Production Plan

**Status:** Draft for decision · **Owner:** Founder / Product · **Written:** 2026-10-18 against commit 6535990
**Companion:** the shareable doc "Snot Nose Legal — Persona Rollout & Production Plan" (https://claude.ai/code/artifact/69be96e1-d99c-4a60-b0c2-a4c24b701c8d) carries the same plan with the roadmap drawing. Sources: the GTM & Persona Campaigns doc, `../business_case/attorney_offering_and_pricing.md`, `../business_case/appeals_and_writ_attorney_personas.md`, `../business_case/professional_tier_expansion.md`, the September UX reviews, and the code.

## 1. The decision

Launch all four personas together in January 2027: the family review as planned, the Counsel Review on the record-length ladder, PD office pilots and the public-interest allowance for clinics, and the investigator page with a free first timeline delivered as a Record Desk service. Depth arrives after launch on evidence, not by persona. The engine is ready for all four personas; the product around it is built for one. Almost all of the build is done by Claude agents working from this plan's acceptance criteria, so calendar time is set by the founder's review and merge throughput and by the external gates (counsel, eval, cost measurement, Stripe live, pilot signatures), not by engineering headcount. January holds if the founder merges about two agent pull requests a working day from now to the cutover and the gates run in parallel in November.

- **Families, January:** no new scope beyond the UX review's last P1 items and the launch gates already listed; AUTO_APPROVE stays off.
- **Attorneys, January:** sign-up with a Texas bar number, a matter form in place of the quiz, uploader-labelled volumes with a page-meter bucket that quotes $149, $249 or $349 before analysis, a Part B-first packet with the TRAP clock, the *Anders* appendix, the verified mark and the court disclosure blocks, five-record packs and a free first review. Grounds grouping and affidavit topics follow in February; the Advocate seat waits for a measured repeat rate.
- **PD offices and clinics, January:** organisations with a 90-day, 15-record pilot allowance for offices and 25 free records for public-interest clinics, a consented-packet inbox for clinics, invoices recorded by hand on the Money page with ACH statements in February, and the Record Desk sold and delivered from the staff console until the verification view and exports land between February and April.
- **Investigators, January:** the page, the request form and free membership inside an office; the chronology is a Record Desk service done by hand until the engine reads institutional records.
- **Production:** the proving ground until the cutover, then every surface ships dark behind a per-organisation flag. In December the founder walks all four flows on real records with a real card, then the discovery lawyers, the first pilot office and the two clinics become the external organisations before 31 January. Staging arrives at the cutover.

What the plan cannot do is make January cheaper in founder time. The January scope in section 5 is the cut that fits about forty reviewed pull requests; everything below that line is deferred by weeks, not by persona, and the single decision that moves the date is the daily merge window the founder can hold. The ladder still replaces the $199 flat review and the seat prices in the GTM doc and the prototype pages, and the Record Desk, clinic and investigator prices on those pages must be set by mid-December.

## 2. Where the product stands today

| Area | State | Evidence |
| --- | --- | --- |
| Family journey | Built and reviewed; every P0/P1 from the September UX review closed except the overage purchase card and the new-evidence report section | `apps/web/app/(daybreak)/*` |
| Case facts, ask-once, re-run with versions | Built | migrations 000019–000024, `payments.service.ts` |
| Billing | Three env-priced Stripe Checkout prices (review $299, overage $49/2,500 above 5,000, re-run $99); promo codes; refunds ledger; no subscriptions, packs, allowances, invoices or page tiers | `PRICES_CENTS` `payments.service.ts:19`, `intake.ts:449` |
| Accounts | One `Role` enum for customers and staff; single-member tenants; no organisation, seat, bar number or professional customer; accounts created at family checkout only | `schema.prisma` |
| Analysis engine | Fable 5.1; prompt set v2 runs seven TRIAL screens incl. preserved error and identification with per-finding preservation, harm standard, vehicle, develop, dependsOn; FR-7 re-verification; AUTO_APPROVE held at 0 | `render.yaml`, `analysis.service.ts:76-111` |
| Report | Part A and Part B PDF, versions, change notes, share link; grouped by severity; no DOCX; no Anders appendix | `packages/reports` |
| Staff console | `/ops` Today, Cases, Case file, Customers, Money, Promos, Retention; `/qa` outside the shell; SUPPORT role and staff requests shipped | `apps/web/app/ops/*` |
| Professional surfaces | `/dashboard`, `/workspace` are the 2025 mocked build on a bare `POST /cases`; no `/for-counsel`, `/clinics`, `/investigators` | `ux_buildout_plan.md` |
| Operations | Render (Ohio), workers in the api process, no staging, api deploy kills in-flight runs, additive migrations; CI: gitleaks, audit, lint, env-drift, typecheck, vitest, one Playwright spec | `render.yaml`, `ci.yml` |
| Deadline engine | Finality, PDR, cert, AEDPA tolling, laches; no TRAP 38.6 brief clock, no 11.07 posture beyond laches, no §2254 exhaustion | `packages/case-lifecycle/deadlines.ts` |

Open family launch gates (all also gate the professional launch): counsel copy batch, deadline-vector sign-off, UPL and privacy review, E&O, TX sales-tax determination, AUTO_APPROVE at 0 until validation.

## 3. Personas, jobs to be done and the UX review

Only the family is served end to end. Every professional persona hits the same four walls: no sign-up, no record-sized price, no matter-shaped intake, and a report built for a family rather than a brief.

**Family (January 2027).** Ship-ready. Remaining: overage purchase card (G-B4); new-evidence section (G-A6, FR-10); deadline tool on the `/learn` deadline article feeding `/check`; ten learn articles; chapter and seminar promo attribution; Stripe instalments; "Six checks" copy vs seven screens; family copy still promises human review of every report (rewrite before AUTO_APPROVE or `/for-counsel`).

**Writ practitioner (January 2027, Counsel Review).** Jobs: fast cited read before quoting; IAC/Brady/11.073/sentencing cites for a retained matter; findings by CCA-form ground; the affidavit list from the IAC screen; AEDPA posture. UX today: nothing (`Role.ATTORNEY` is staff and routes to `/qa`). Missing: `/for-counsel/signup` with bar number and practice type; matter form; bucket quote before analysis; Part B-first packet with grounds grouping and affidavit topics; verified-against-record mark, TRAP 9.1(d) log, N.D. Tex. 47.2(e) block, W.D. Tex. certificate; packs, first-free, partner codes; 11.07 posture and §2254 map.

**PD appellate attorney (January 2027, pilots).** Jobs: every preserved objection cited before the 30-day brief; an honest *Anders* record; the TRAP clock. Missing: `direct_appeal`/`2254` vehicles; TRAP 38.6 clock with counsel-signed vectors; *Anders* appendix; organisation with free investigator/viewer roles, pilot flag, annual allowance; ACH invoice itemised by cause number; W-9, DPA, security one-pager; pilot metrics.

**Clinic director (January 2027, public-interest allowance).** Consent and share link exist; missing clinic organisation, public-interest allowance, consented-packet inbox, triage sheets (deferred: engine reads trial records, not letters), grant counts.

**Investigator (January 2027, as a service).** Nothing exists; sold as a Record Desk service; product work limited to free membership and the CSV export shape.

**Staff.** New jobs: bar verification, pilot/office/public-interest flags and allowances, Long-record quotes, Record Desk engagements with a named reviewer and per-cite verification, ACH invoicing. Extend the console; the Record Desk is a queue, not an app.

Rule from the GTM doc: audiences never see each other's copy; separate routes, navigation and sign-in landings.

## 4. Pricing model to implement

| Unit | Price | Who | Mechanics |
| --- | --- | --- | --- |
| Counsel Review Short (<100 pages) | $149 | Attorneys | Checkout one-time; rung from the page meter after upload, before analysis |
| Counsel Review Standard (100–500) | $249 | Attorneys | Same |
| Counsel Review Extended (501–1,500) | $349 | Attorneys | Same; $50 above the family price |
| Long record (>1,500) | Quote from $499 | Attorneys | Not sold until the volume split ships; quote request |
| Re-run | $99 | All | Existing RERUN flow |
| Five-record pack, any rung, 12 months | 10% off | Attorneys | Prepaid credits with expiry |
| First review free (≤500 pages) | $0 | Verified bar number | Promo engine, monthly cap |
| Bar-partner code | 15% off first paid | Attorneys | Promo engine |
| Office 50 / 120 / 250 | $9,000 / $18,000 / $30,000 by quote | PD offices | Annual prepay, unlimited users, ACH invoice, allowance decremented per record |
| PD pilot | Free, 90 days, 15 records | PD offices | Pilot flag; converts on the 1 October fiscal year |
| Public-interest | 25 records/year at $0, then Office rates | Clinics | Allowance at price $0 |
| Family Case Review | $299 (open: $349) | Families | Unchanged |

Prototype-only proposals, to be priced by mid-December so the four pages launch together: Justice tier 10 sheets + 2 digests/month free, triage $60, digests from $475; investigator chronology free <500 pages, $600 to 1,500, $1,100 to 4,000. Build the allowance and band machinery so any can be switched on without new billing code.

Billing must: classify a record into a bucket from reporter's-record pages (clerk's and exhibits metered separately); carry several prices per kind via a `PriceBook`; hold credits with expiry and annual allowances decremented at analysis start; invoice offices by ACH with lines by matter and cause number; refuse >1,500 pages for attorneys with a quote request; keep the $49 overage family-only; emit cost telemetry per record and rung.

## 5. Development workstreams

Each workstream is a brief a Claude agent can execute: scope, schema, routes, pages and the acceptance test that closes it. Sizes in engineering-weeks (ew) are an effort measure for scoping briefs, not a calendar; agents run workstreams in parallel on their own branches and land one pull request per acceptance criterion for founder review with CI green. The January scopes total about 19 ew of effort, roughly forty pull requests before 31 January; the after-launch scopes total about 15 ew through August. Engine work assumed done.

- **A. Organisation and professional accounts (January, 3 ew).** `Organisation { kind: FIRM|PD_OFFICE|CLINIC|FAMILY, legalName, billingEmail, pilot, allowance, features }`, `Membership { role: OWNER|ATTORNEY|INVESTIGATOR|VIEWER }`, `AccountKind` and `grants StaffGrant[]` on `User` per the Staff Console Access Model; `User.barNumber/barState/barVerifiedAt/barVerifiedBy/practiceType`; `POST /counsel/signup`, `GET /counsel/me`; `/go` routes professionals to `/counsel`. Expand-and-contract migration. Accept: route matrix test per role; an attorney never lands on `/qa`; demotion refused next request.
- **B. Price book, buckets, packs, allowances (January: ladder, packs and allowances, 3.5 ew; February: invoice statements, 1 ew).** `PriceBook` keyed by audience and SKU with Stripe Price ids and effective dates; bucket classifier (100/500/1,500) stored as `recordBucket`; new `QUOTED` state before analysis taking card, credit or allowance; `QuoteRequest` for Long; `Credit`, `AllowanceLedger`, `Invoice` with PDF statement and ACH mark-paid; promo `maxRedemptionsPerMonth` and `audience`. Accept: boundary tests at 99/100/500/501/1,500/1,501; pack refuses a sixth record; family tests unchanged.
- **C. Matter intake for counsel (January, 1.5 ew).** Vehicle chosen (`direct_appeal`, `pdr_clock`, `11.07`, `11.072`, `11.09`, `2254`), lane, county, court, cause number, client initials, offence, sentence, dates, prior writs, outside-record note; capital refused; screens weighted by vehicle.
- **D. Record inventory and volume recognition (January: the uploader labels volumes and the meter sets the bucket, 0.75 ew; March: TAMES cover-page recognition, 0.75 ew).** TAMES cover-page labelling, echo-back inventory, missing volumes, OCR confidence per volume, bucket. Accept: references and sample digests classify; unlabelled PDFs listed, not dropped.
- **E. Counsel packet and deadline engine (January: TRAP clock, Anders appendix, verified mark and disclosure blocks, 2 ew; February: grounds grouping, affidavit topics and the 48.4 checklist, 1 ew).** Part B primary; Part A optional client letter; inventory; TRAP chain (26.2, 26.3, 35.2, 38.6, 49.1, 68.2, 73.4, 73.5) labelled jurisdictional/discretionary; *Anders* appendix (Guideline 9.5); TRAP 48.4 checklist; 11.07 grounds grouping with §4 tag, form-item mapping, affidavit topics; verified mark; 9.1(d) log "proposed"; 47.2(e) block; W.D. Tex. certificate; template variant and work-product footer. Accept: TRAP vectors counsel-signed; Gary packet renders every section; dropped findings listed as dropped.
- **F. Professional web surfaces (January, 3 ew).** `/for-counsel` (nine sections, ladder, pack, first-free), `/for-counsel/signup`, `/counsel`, `/counsel/matters/new`, `/counsel/matters/[id]`, `/for-offices`, `/for-investigators`, `ProfessionalNav`; remove `/dashboard` and `/workspace`. Accept: Playwright flows; landing spec updated; axe clean.
- **G. Staff console extensions (January, 1.5 ew; Record Desk queue from February, 2 ew).** Bar-verification queue, organisation column, quote requests, pilot/allowance panel, invoices and credits on Money, Record Desk queue with named reviewer, SLA, per-citation state, deliverable export; QA edits widened to `partBText`, `harmStandard`, `develop`. Accept: every write audited; SUPPORT/REVIEWER matrix rows.
- **H. Record Desk verification view and exports (February to April, 5 ew; in January the Record Desk is sold and delivered by hand from the staff console).** Side-by-side read-only for organisation attorneys; accept/reject/annotate into ledgers; exports: cite table (DOCX/CSV), preserved-error table, 11.07 form-fit with budgets and 73.1 checklist, 9.4(i) helper, verification log, ICS calendar, *Anders* and 48.4 templates, activity log. Accept: exports open clean; form-fit emits no argument; rejected findings never exported.
- **I. Clinics, offices, investigation layer (January: organisations, allowances, consented-packet inbox, investigator membership and request form, 1.5 ew; May onward: investigation layer, 5 ew).** Clinic and office organisations with the pilot and public-interest allowances; consented-packet inbox; pilot metrics; security page. From May, Office conversion and admin, records tracker, §2254 map, clinic intake mode, volume split for Long, A/V add-on, chronology CSV shape. Accept: packet appears in clinic inbox without re-upload; 2,000-page record splits and merges without duplicates.
- **J. Operations, flags, family tail (November, 2 ew; worker checkpoints by March).** Staging blueprint; `FeatureFlag` rows with per-organisation overrides (`counsel_surfaces`, `counsel_checkout`, `offices`, `record_desk`, `clinic_inbox`, `long_records`); worker checkpoints per screen and deploy drain; weekly eval gate in CI with cost per bucket; family UX tail. Accept: deploy during a run finishes on the new build; flag flips without deploy; env-drift CI.

Documents to update with the code: GTM Campaign 2 ladder, prototype attorney/clinic/investigator pages, `pricing.ts` and the landing e2e spec, the Appellate & Writ Support open question, `professional_tier_expansion.md` §5.1 and §9, family disclosures promising human review.

## 6. Phased plan

One launch in January for all four personas, then three deepening phases on the GTM calendar. No persona waits on another's evidence; the January gate is a launch-readiness gate for four audiences at once.

| Phase | Window | Live at exit | Gate to the next | Agent work and founder review |
| --- | --- | --- | --- | --- |
| Build to launch | 19 Oct 2026 – 31 Jan 2027 | family $299; Counsel Review $149/$249/$349; $99 re-run; 5-pack; first review free; PD pilots free; public-interest allowance; Record Desk and investigator timelines delivered by hand | four pages live; eval green on both ledgers plus the direct-appeal ledger; cost measured per bucket; counsel signed for four audiences | ~19 ew of agent effort, ~40 PRs; founder runs the eval, cost and counsel gates in parallel |
| Deepen | Feb – Apr 2027 | invoice statements; Record Desk engagements on the verification view and exports | 10 paid reviews, 2 from the referral loop; three pilots running | ~10 ew, ~20 PRs |
| Convert | May – Aug 2027 | Office 50/120 conversions; Long records by quote after the split; records tracker; clinic intake mode | one pilot office at 5+ records; repeat-purchase rate measured | ~8 ew, ~16 PRs |
| Extend | Sep – Dec 2027 | A/V add-on; Office 250 by quote; Advocate seat only if repeat >30% | one office licence signed | ~7 ew, ~14 PRs |

## 7. Production rollout

**Environments.** Until the family cutover, production is the only environment and carries all testing (Stripe test mode, real records, test organisations flagged `features.isTest` and excluded from Money and analytics). At the cutover: a staging blueprint instance on the cheapest plans with a scrubbed database, weekly refresh; thereafter every change reaches staging first. Pilots run on production from day one.

**Flags, not branches.** Every professional surface ships behind a `FeatureFlag` with per-organisation overrides; engine switches stay env vars. Surface rollback is a flag flip; engine rollback is one env var and a redeploy.

**Deploy discipline.** Additive migrations; identity split via expand, backfill, swap guards, contract over two or more deploys; worker checkpoints and drain so deploys stop killing runs; until then, deploy only when no analysis is running.

**Agent operating model.** Each workstream is a brief handed to a Claude agent with its acceptance criteria; the agent works on a `ws/<letter>-<slug>` branch, writes the tests from the criteria first, and opens one pull request per criterion. `main` is protected with the CI gate required; Render auto-deploys `main`, so merging is deploying and the founder merges inside a daily window when no analysis is running. Pull requests touching auth, RLS, payments or migrations get a founder-run code review and security review before merge; the contract step of any migration is run by the founder. Agents never hold production secrets, never run migrations against production, never flip production flags and never touch Stripe live keys. Human-only: counsel review, bar verification, QA and Record Desk reviews, eval-ledger adjudication, pilot sales, prices, the real-money smoke.

**Test-in-production protocol, for each surface in December and for each phase after.** (1) Migrate on staging, full suite, deploy dark. (2) Flag on for the founder's test organisation; real record, real card, refund from Money; receipts, audit rows, emails, PDF checked once by hand. (3) Flag on for the first external organisation with a promo or allowance; watch the first record through QA. (4) Flag on for all at the phase gate with counsel sign-off on that surface.

**Pilot sequencing, compressed.** The discovery lawyers become the first external organisations in December through the real sign-up and the free first review; Bexar's two-lawyer appellate division is the first pilot office, signed in December and uploading by mid-January; the two clinics that agreed to receive consented packets get their organisations in January; Harris and Dallas wait for the Long-record split in May. Investigators are reached only through those firms and offices.

**Go-live gates.** January launch, all four personas: the family gates (eval green on both ledgers, counsel sign-offs on copy, disclosures, deadline vectors and directory, E&O, tax decision, Stripe live and real-money smoke, alerts, restore drill, AUTO_APPROVE 0) plus cost per bucket measured and Extended above the 70% floor, the direct-appeal ledger signed, TRAP vectors signed, counsel review of the attorney, office, clinic and investigator pages, sub-brand decided, verification queue staffed, family disclosure rewrite live, pilot proposal, DPA, W-9 and security one-pager final, Record Desk, clinic and investigator prices set, four dark-flag walkthroughs done on real records. Deepen (Apr): 10 paid reviews with 2 from referral; three pilots running; cross-tenant read audit on the verification view; exports clean; 9.1(d) wording matched to the rule in force. Convert (Aug): one pilot at 5+ records; ACH reconciled once; office admin matrix green. Extend (Dec): one office licence signed; repeat rate measured for the seat decision.

**Observability.** Today page professional group (verifications, quote requests, pilot records, allowances near zero, engagements past SLA); `snl.counsel.*` events reported weekly beside the family funnel; cost telemetry tagged by bucket and audience.

## 8. Test and quality plan

Unit: price book boundaries, credits, allowances, bucket classifier, TRAP vectors, grounds grouping, verification log. Integration: sign-up to quote to payment by card, pack and allowance; refund credits; Long quote request; pilot at zero allowance; invoices; bar verification; Record Desk flow; clinic inbox. Authorization matrix: every route as every role incl. anonymous; demotion; RLS canary under `hg_app` after the identity migration. E2E: family purchase, counsel sign-up to packet, pilot upload against allowance, landing specs updated, axe. Eval gate: weekly on all ledgers with cost per bucket; attorney labels feed ledgers. Load: ten records in an hour on production before pilots; the 1,450-page ceiling and refusal exercised.

Rules: family tests unchanged until the contract step; eval gate is the only approval for an engine change; no flag flip for an external organisation until its matrix and e2e rows are green on staging.

## 9. Risks and decisions needed

Blocking the January launch, in order: (1) set the agent operating model: branch protection with required CI on `main`, a daily founder merge window of about two pull requests, and the human-only steps (migration contract steps, production flag flips, Stripe live keys, counsel-gated copy); the date moves with review throughput, not headcount; (2) adopt the ladder and update the GTM doc, prototype and expansion doc this week; (3) family price $299 vs $349 (recommend keep $299 to March); (4) attorney QA regime (recommend sampled QA, 100% citation re-verification, 48-hour target, family copy rewrite first); (5) defer the Advocate seat; (6) office terms annual prepay by ACH; (7) sub-brand by December; (8) refuse >1,500 pages until the split ships in May, keeping Harris and Dallas out of the January pilots; (9) production cost run on Fable v2 in November before any professional price is published; (10) Record Desk, clinic triage and investigator chronology prices by mid-December. Blocking Deepen: office overage price; which pages count toward the shown bucket.

Risks and mitigations: founder review throughput, about forty agent pull requests in ten working weeks on top of the launch gates (PRs sized to one criterion with tests first, CI as first reviewer, a daily merge window, and the family launch never waits on a professional surface); agent-built code in auth, RLS, payments and migrations (matrix and RLS tests on every such PR, founder-run code and security review before merge, contract steps run by the founder); unmeasured Fable cost (November CostRecord, price book rows, Long refused); eval not re-run (hard gate); identity migration (expand-and-contract, matrix tests); channel conflict (ladder, separate audiences, directory); UPL (client letter via lawyer only, templates fill structure, neutral directory, AUTO_APPROVE kill switch); TRAP 9.1(d) pending (log labelled proposed, disclosure blocks shipped); 11.07 §4 one shot (complete-inventory framing, "not reviewed" prominent); deploy kills runs (deploy windows until the worker checkpoints land in March); founder bandwidth (Record Desk SLA queue, engagement cap); brand (December decision, legal-entity name everywhere); county calendars (pilots free from January, asks in September for 1 October budgets).
