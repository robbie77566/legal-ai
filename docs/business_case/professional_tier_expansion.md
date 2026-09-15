# Professional Tier Expansion — Public Defenders and Writ Practitioners

**Status:** Draft for decision · **Owner:** Founder / Product · **Last updated:** 2026-09-15
**Companion docs:** `business_case.md` (the investment case this amends) · `snotnoselegal_market_study_mvp_gtm.pdf` (competitor dossiers, tier structure §6) · `../design/user_journeys.md` (Personas 1–4) · `../specifications/product_roadmap.md` (v3 professional tiers, which this pulls forward) · `../specifications/mvp_v1_prd.md` (§8 UPL requirements)

> **Scope.** The founder wants to pursue two professional segments now rather than at roadmap v3: attorneys in Texas public defender offices who lack access to the expensive research platforms, and small or solo practices that concentrate on writs. This document reviews what the business case assumed about them, researches both personas, sets a go-to-market, assesses the workflow and a dedicated sign-up page as a product manager would, and re-cuts the twelve-month financials as a business analyst would. Figures marked `[estimated]` are judgement; sourced figures carry their source in §10.

---

## 1. Recommendation

**Pursue both — but as a per-case product on the rails that already exist, not as the v3 workspace.** Launch a **Counsel Review** at $199 per record in month 4 of the consumer year, add the **Advocate** seat ($99/mo) in month 7 once Stripe Billing is wired, and enter public defender offices through **three free pilots** that convert to Chambers seats on the county's next budget cycle. Do not build the interactive graph, chat, or drafting workspace for this — the personas' jobs are served by the Part B packet the engine already produces.

The reason this is the right shape is in the research. The two personas are underserved in a way the market study did not fully appreciate: **the "free floor" that blocks a research or document-review pitch does not exist for them.** Everlaw for Good requires 501(c)(3) status or federal CJA panel membership — a Texas county public defender office is neither, and a for-profit writ practice is neither. vLex Fastcase gives them free *research*, which the product does not sell. What they cannot get anywhere is a grounded read of a multi-volume record against the preserved-error, IAC, Brady, junk-science and sentencing screens, and for the public defender persona specifically, that read is the difference between an arguable issue and an *Anders* brief.

The financial effect in the first twelve months is honest rather than dramatic: **+$32k revenue and +$14k contribution on the base case**, negative in the bear case because channel spend precedes uptake. What the segment actually buys is time: **23 professional seats and $3k MRR live at month 12** — the seat base the business case did not expect until the fourth quarter of year two — and a path to covering a two-engineer payroll from a customer mix a Texas market can plausibly supply, instead of the 114 consumer cases a month the consumer tier alone requires.

| | Consumer only (business case) | With professional tier (this document, base) |
|---|---|---|
| Year-1 revenue | $96,694 | **$128,956** |
| Year-1 product contribution | $58,877 | **$73,196** |
| Seats live at month 12 | 0 | **23** (18 Advocate, 5 Chambers) |
| MRR at month 12 | $0 | **$3,027** |
| Cases to cover 2-FTE payroll | 114 consumer/mo | 50 consumer + 40 counsel + 80 seats |
| Build | — | ~9 ew; v1.1 slips one quarter |
| Principal risk | Unproven demand | Two go-to-markets on a two-engineer team |

---

## 2. What the business case assumed, and what changes

The business case (§4, Option 2) rejected "professional-first" as an *entry* and kept the professional tiers at roadmap v3, gated on referral-list attorneys converting. Three of its assumptions deserve revisiting in light of the research below.

**"Longest sales cycle."** True for the Chambers/B2G end — a public defender office buys on a county budget. Not true for the writ practitioner, who is a solo or small firm paying by card, and whose sales cycle is one CLE conversation. The business case treated "professional" as one segment; it is two, with opposite buying mechanics.

**"Competes against a free research floor."** True only if the pitch is research. The market study §8.3 already forbids that pitch. For these personas the *document-review* floor (Everlaw for Good) is also absent — see §3.3 — so the objection collapses for exactly the two segments the founder named.

**"Requires the full workspace before first revenue."** This is the assumption that most needs correcting. The writ practitioner's first job (§4.2) is answered by the Part B packet as it exists today. The public defender's first job (§4.1) is answered by the same packet plus one screen the PRD already specifies and the pipeline does not yet run — FR-1 preserved error. Nothing in either JTBD needs the Neo4j UI, the side-by-side viewer, or drafting.

What does *not* change: the consumer tier remains the wedge, the engine is still proven on paid consumer records first, and Gate 3 in the business case still governs the funding decision. This document adds a second revenue line to the lean path; it does not replace the path.

---

## 3. Research findings

### 3.1 The Texas indigent-defense map

Texas does not run a unified public defender system. Counties choose between assigned counsel (private attorneys appointed from a rotating list), contract counsel, managed assigned counsel (MAC) programs, and public defender offices (PDOs), subject to Texas Indigent Defense Commission (TIDC) standards. The PDO footprint is growing fast and is still a minority: 36 of 254 counties had a PDO in 2019; by 2024, over 80 counties were served by a MAC or PDO, and 155 rural counties still had neither. TIDC's December 2025 board approved more than $21M in grants, weighted to rural regional offices. [S1, S2, S3]

The offices that matter for an appellate product are the large urban ones with appellate divisions: Harris County (four divisions including Appellate), Dallas County (88 attorneys; handles appeals and post-conviction), El Paso (50 attorneys; appeals), Bexar (26 attorneys, **2 on appeals**), Travis (established 2020). [S4, S5, S6] The Bexar figure is the persona in one number: an appellate division is typically two to five lawyers carrying every appeal an office of dozens generates.

### 3.2 The post-conviction bar and its volume

The Court of Criminal Appeals received **3,325 new Article 11.07 applications** in FY2021, plus 533 other original proceedings. [S7] There is **no constitutional right to appointed counsel** on a non-capital 11.07; appointment is discretionary under art. 1.051(d)(3) when "the interests of justice require." [S7, S8] The consequence is in the outcome data: the CCA dismissed or denied **84% of applications from people without counsel** without a written order, against 16% for represented applicants. [S9] The retained and pro bono writ bar is therefore small and specialised — Texas has roughly **134 attorneys board-certified in criminal appellate law** [S10] — and it sits inside a professional community with a ready channel: TCDLA, **3,800+ members**, more than 60 seminars a year including a dedicated Post-Conviction & Parole seminar and an Appellate seminar. [S11] The Innocence Project of Texas alone receives **over 1,000 requests a year**. [S12]

The procedural constraints that shape the writ practitioner's work are specific and product-relevant: the application must be on the CCA's prescribed form, each ground limited to the two pages provided, with any memorandum capped at **15,000 words or 50 pages**, and a non-compliant application may be dismissed (TRAP 73.1–73.2). [S13] The Office of Capital and Forensic Writs handles capital writs and a limited number of non-capital Art. 11.073 junk-science matters on referral from the Forensic Science Commission — it is a referral destination, not a competitor. [S14]

### 3.3 The free floor is not free for these personas

This is the finding that most changes the business case. The market study established that the incumbent floor in Texas is free: vLex Fastcase for research (State Bar site licence) and Everlaw for Good for document review. But Everlaw for Good's eligibility requires the organisation to **have or be fiscally sponsored by a U.S. 501(c)(3)**, or the user to be **active on a federal district's CJA panel**. [S15] A Texas county public defender office is a government agency, not a 501(c)(3), and does not take federal CJA appointments. A for-profit solo writ practice qualifies only for a pro bono matter with no fee. Neither persona can get the document-review floor for free. The nearest paid alternative is Casefleet at $30–$140/seat/month with per-page OCR overage, which the market study documents as degrading on aged scans.

Legal-AI pricing for solo and small firms clusters at **$50–$200 per seat per month** [S16], which brackets the market study's Advocate price ($99) and leaves Chambers ($249) as a premium that a public defender office would justify only per-attorney where the appellate division is two people.

### 3.4 Buying mechanics

Solo and small firms buy by card; adoption is no longer the barrier — Clio's 2026 survey reports **71% of solo practitioners and 75% of small firms** using AI. [S16] Public defender offices buy through county purchasing, and the relevant threshold moved in the product's favour: Local Government Code §262.023's competitive-bidding threshold rose from $50,000 to **$100,000 effective 1 September 2025** (SB 1173). [S17] A five-seat Chambers licence at $249/month is $14,940 a year — an ordinary departmental purchase, no sealed bids. TIDC's multi-year improvement grants reimburse up to 80% in year one on an 80/60/40/20 taper and explicitly fund technology projects [S18], which gives an office a grant line to put the subscription on.

---

## 4. Personas and jobs to be done

The existing persona set (user_journeys.md) has an attorney (Persona 1) and a managing public defender as budget-holder (Persona 3). Neither is the line lawyer this expansion serves. Two personas are added; Persona 6 refines Persona 1 for the retained solo practice.

### 4.1 Persona 5 — The public defender appellate attorney

**Who.** One of two to five lawyers in a PDO appellate division, carrying every direct appeal the office's trial divisions generate, on a county salary, with vLex Fastcase for research and nothing for the record. Appointed, not retained: the client did not choose them and cannot pay for a second opinion.

**The job is not the writ.** Because non-capital 11.07 appointments are discretionary and rare, a PDO's post-conviction work is the exception; its volume is *direct appeal*, which is confined to the four corners of the record and runs on TRAP deadlines. That reframes what the product is for this persona:

> *"When the reporter's record lands and the brief is due in thirty days, I want every preserved objection, every un-objected prejudicial event, every sentencing defect and every expert-reliability problem in a 3,000-page record laid out with volume-page-line cites, so I can brief the arguable issues instead of reading linearly — and so that if there truly is none, my* Anders *brief can honestly say I reviewed the entire record."*

Three consequences for the product:

1. **Preserved error (FR-1) is this persona's primary screen**, and it is the PRD-specified screen the pipeline does not currently run (`SCREENS_BY_LANE` runs iac, brady, junk_science, sentencing, voir_dire). Direct appeal lives on preserved error; the writ screens are secondary here.
2. **The *Anders* obligation is a job in itself.** Appointed counsel who concludes an appeal is frivolous must file a brief stating they diligently reviewed the entire record and found no reversible error, after which the court of appeals independently reviews the record. [S19] A grounded, complete screen of the record is both the search for the arguable issue and the documentation of diligence.
3. **Deadlines are TRAP, not AEDPA.** The deadline engine needs the appellate brief clock (30 days from the later of the clerk's or reporter's record, TRAP 38.6, with extension practice), not only the 11.07/AEDPA posture.

**Pain today.** Reading linearly under deadline; no tool for the record at all; a research platform the office may or may not licence; the emotional weight of the *Anders* decision on an appointed client who cannot afford anyone else.

**Buyer vs user.** The user is this persona; the buyer is Persona 3 (the chief or managing defender) via county purchasing or a TIDC grant line. GTM must reach the user first and let them carry it to the buyer — hence pilots.

### 4.2 Persona 6 — The writ practitioner (solo or small office)

**Who.** A solo or two-to-four-lawyer practice whose retained work is post-conviction: 11.07 applications, occasional 11.072 (community supervision), federal §2254 follow-on, clemency. Board-certified in criminal appellate law or aiming to be. Member of TCDLA. Paid by families — the same families the consumer tier serves.

**Jobs, in the order they occur:**

1. **Triage.** *"When a family calls and asks whether there is anything in the record, I want a fast, cited read of the file before I quote a fee, so I take the cases I can help and decline the rest honestly."* Today this is the ~$3,000 file-read the consumer product is priced against. That is a **channel conflict** the GTM must confront (§5.4).
2. **The record review for a retained matter.** *"When I have taken the case, I want the IAC, Brady, 11.073 and sentencing indicators with volume-page-line cites and verbatim excerpts, so I can build claims instead of hunting for them."* This is the Part B packet as it exists.
3. **Fitting the form.** *"When I draft, I want findings organised so they map onto the CCA form's grounds — two pages per ground, 15,000 words of memorandum — because a non-compliant application can be dismissed."* [S13] A Part B export grouped by ground, not by severity, is a small change with large value.
4. **The affidavit bottleneck.** Trial-counsel affidavits are the dominant cause of CCA remands (market study §5). *"When I file, I want to know exactly which IAC allegations trial counsel must answer, so the affidavit request is specific and the remand does not happen."* The IAC screen's findings are that list.
5. **The clock.** *"When the state writ is decided, I want the AEDPA posture computed, so I do not file federal at month thirteen."* The existing deadline engine.

**Pain today.** Casefleet is generic and fails on aged scans; Westlaw/CoCounsel is priced for firms ten times their size; Everlaw for Good is closed to them; so the record is read by hand and the file-read is billed at $3,000 because that is what it costs in attorney hours.

### 4.3 What the two personas share and where they diverge

| | Persona 5 — PD appellate | Persona 6 — Writ practitioner |
|---|---|---|
| Primary vehicle | Direct appeal (TRAP) | Art. 11.07 (+ §2254) |
| Primary screen | **Preserved error (FR-1)** — not yet running | IAC, Brady, 11.073, sentencing — running |
| Deadline engine | Brief clock (TRAP 38.6) — new | 11.07/AEDPA posture — exists |
| Deliverable | Part B packet; *Anders* diligence record | Part B packet, grouped by ground |
| UPL posture | Licensed; "issues identified" language is appropriate | Same |
| Buyer | Office (county / TIDC grant) | Self, by card |
| Sales cycle | Pilot → budget cycle (6–12 mo) | One CLE conversation |
| Price sensitivity | Per-office budget line; $249/seat fine for 2–5 seats | High; $199/case or $99/mo |
| Volume per user | 3–8 records/month | 1–3 records/month |
| Channel | TIDC, chief defenders, NAPD, pilots | TCDLA seminars, TBLS list, consumer referrals |
| Relationship to consumer tier | None directly; clinics are closer | **Referral destination** for strong-signal reports; **channel conflict** on the $3k file-read |

---

## 5. Go-to-market

### 5.1 Offer and pricing

Three offers, in the order they can be built and sold:

| Offer | Price | For | What it is | Rails |
|---|---|---|---|---|
| **Counsel Review** | $199 per record (5,000-page cap; +$49/2,500) | Both personas; first purchase | The full screen set run on one record; Part B packet with cites and excerpts; optional Part A as a client letter; sampled (10%) rather than 100% human QA; 48-hour target from records-complete | Existing Stripe Checkout one-time purchase — **no new billing engine** |
| **Advocate** | $99/seat/month (annual $79) | Persona 6 regulars | One Counsel Review included per month, additional at $99; matter list; deadline posture on every matter | Stripe Billing subscription (Checkout in subscription mode) |
| **Chambers** | $249/seat/month, investigator/viewer seats free | PDOs, clinics, small firms with staff | Advocate plus office tenancy, preserved-error screen and TRAP brief clock, shared matters, admin | Same billing; existing multi-role RBAC |

Counsel Review at $199 is deliberately *below* the consumer $299: the attorney is their own QA, receives no human review of Part A, and carries none of the consumer's chargeback risk — the unit economics in §7.1 hold at $199 with an 85% margin. It is also the price that turns the $3,000 file-read into a $199 tool plus the lawyer's judgement, which is the honest version of the channel-conflict answer.

### 5.2 Channels, in order of durability

1. **Consumer referral loop.** Every consumer strong-signal report already asks the family whether to share Part B with counsel (US-5). A neutral directory of Advocate subscribers — no matching, no per-referral consideration, per PRD R-6 option (b) and Tex. Occ. Code ch. 952 — is the only lawful directory design and is also the lowest-CAC acquisition channel the product will ever have: the attorney's first contact with the product is a packet a paying client hands them.
2. **TCDLA.** The Post-Conviction & Parole seminar and the Appellate seminar are the two rooms in Texas where Persona 6 gathers. [S11] Exhibit, and offer a seminar-only code (the promo infrastructure exists). Budget in §7.2.
3. **The board-certified list.** ~134 criminal-appellate specialists [S10] is a list short enough to reach individually with a sample packet.
4. **Public defender pilots.** Three offices, free for four months, chosen for an appellate division of two to five (Bexar is the archetype) and a chief defender who will be a reference. The ask at month five is a Chambers licence on the next budget cycle, with the TIDC technology-grant line named in the proposal. Introductions via TIDC's public defense staff and NAPD membership.
5. **CLE content.** A one-hour "Reading the record for preserved error" CLE, accredited through TCDLA or the State Bar, is both channel and product education. Slow, compounding, cheap.

### 5.3 Sequencing

| Month | Milestone | Gate to next |
|---|---|---|
| M4 | Counsel Review live; `/for-counsel` landing; bar-number sign-up; consumer referral directory | 10 paid Counsel Reviews; ≥2 from the referral loop |
| M5 | Three PDO pilots start; FR-1 preserved-error screen live behind the eval gate | Pilot offices each run ≥5 records |
| M6 | TCDLA Post-Conviction seminar | Seminar code redemptions ≥10 |
| M7 | Advocate seats via Stripe Billing | Per-case buyers converting to seats |
| M9 | TCDLA Appellate seminar; pilot conversion asks | ≥1 office commits to Chambers |
| M10 | First Chambers office live | Reference customer for v4 B2G |

### 5.4 Positioning and the channel-conflict problem

To Persona 5: *"Every preserved objection in the record, cited to page and line, before the brief is due."* To Persona 6: *"The habeas spine no platform sells — IAC, Brady, 11.073, sentencing, deadlines — grounded to the record."* Never "research", never "document review".

The channel conflict is real and should be said out loud rather than discovered: the consumer product sells for $299 the go/no-go signal that some writ practitioners sell for $3,000. Three responses, all needed. First, the honest one — the $3,000 was the cost of attorney hours, and the tool lets the attorney sell judgement rather than reading. Second, the structural one — the consumer report *routes to* counsel (R-3) and never away from them, so every consumer case is a lead, not a lost fee. Third, the pricing one — Counsel Review at $199 means the practitioner who adopts the tool is cheaper to the family than the practitioner who does not. Expect some resistance at the TCDLA booth; the answer is the directory.

**Brand.** PRD R-5 flagged "Snot Nose Legal" against grieving families and public procurement. A county purchasing office and a chief defender's budget memo are exactly the procurement surface the risk described. This document does not resolve the brand question; it raises its priority, because Chambers cannot be sold into a PDO under a name the chief defender is embarrassed to write down.

---

## 6. Product management assessment — workflow impact

### 6.1 Impact by component

The platform was designed multi-tenant for law firms and narrowed to single-member CLIENT tenants for v1.0, so much of what the professional tier needs is already present and merely unused. The table is honest about what is not.

| Component | Consumer today | Professional change | Effort |
|---|---|---|---|
| **Tenancy & roles** | One CLIENT per single-member tenant | One tenant per practice/office; ATTORNEY role (exists) for members; ADMIN for the office admin; INVESTIGATOR/VIEWER free seats | 1 ew — surfaces only; model exists |
| **Sign-up** | Created inside the buy flow (`/buy/account`) | New `/for-counsel/signup`: email, bar number, practice type (private / PDO / clinic). Bar verification manual against the State Bar directory at first; automated later | 1 ew |
| **Eligibility (US-0)** | Seven-question wizard routes vehicle | **Skipped.** A short matter form: vehicle (direct appeal / 11.07 / 11.072 / §2254), lane (trial/plea), county, dates | 0.5 ew |
| **Billing** | Stripe Checkout one-time | Counsel Review reuses Checkout unchanged. Advocate/Chambers: Checkout in subscription mode + customer portal; seat count on the tenant | 0.5 ew (per-case) + 1.5 ew (seats) |
| **Upload & pipeline** | Presigned S3, BullMQ, SSE | Unchanged. Attorneys upload cleaner records (clerk PDFs), so OCR-halt rates fall | 0 |
| **Screens** | iac, brady, junk_science, sentencing, voir_dire; plea lane | **Add FR-1 preserved error** (PRD-specified, absent). Screen set selectable per vehicle: direct appeal weights preserved error; 11.07 weights IAC/Brady/11.073 | 1.5 ew + eval-gate run (NFR-1) |
| **Deadline engine** | 11.07/AEDPA posture | **Add TRAP brief clock** (38.6) for direct-appeal matters | 0.5 ew |
| **QA gate** | 100% human review before release | Sampled 10% for attorney tenants; citation re-verification (FR-7) remains 100% and blocking; a separate, faster SLA lane | 1 ew |
| **Report** | Part A (family) + Part B | Part B primary; **grouped by ground** for 11.07 (maps to the CCA form); Part A optional "client letter"; *Anders* diligence appendix listing screens run and pages read | 1 ew |
| **UPL copy** | "Information, not advice" on every surface | Attorney template variant: "issues identified for counsel's evaluation"; still no outcome probabilities; the persistent label reads differently to a licensed user | 0.5 ew (template variant) + counsel review |
| **Referral (US-5)** | Consent → clinic or "vetted list" | Neutral directory of Advocate subscribers — no matching, no fees (R-6 option b) | 0.5 ew |
| **Ops** | Case label/ref (landed 2026-09-15) | Add tenant/organisation column and filter; pilot-office flag | 0.5 ew |
| **Analytics** | `snl.*` consumer funnel | `snl.counsel.*` events: signup, bar-verified, first review, seat start/churn | 0.5 ew |
| **i18n** | Spanish planned v1.1 | Not needed for professional surfaces | 0 |

**Total: ~9 engineering-weeks**, with Counsel Review alone (rows 1–5, 8–11) at roughly 4 ew and shippable first.

### 6.2 The landing page — `/for-counsel`

The consumer site speaks in Daybreak's voice to a family under stress; that voice is wrong for a lawyer under deadline. The professional page keeps the design tokens and drops the tone. It is a separate route, not a variant of the home page, because the audiences must never see each other's copy.

**Sections, in order:**

1. **Hero.** Headline for the persona (§5.4); sub-line naming the five screens; two CTAs — *Run a Counsel Review — $199* and *Public defender office? Start a pilot*. No eligibility wizard.
2. **The packet.** A real Part B page from a reference case (Gary), with the volume-page-line cite and verbatim excerpt visible. Lawyers buy on the artefact, not the pitch.
3. **How it fits the work.** Three short columns: direct appeal (preserved error, TRAP clock, *Anders* appendix); 11.07 (grounds mapped to the form, affidavit list, §4 subsequent-writ tagging); federal (AEDPA posture). Each column is a JTBD from §4.
4. **What it is not.** Not research (link vLex); not a citator; not a drafting tool. Saying it disarms the free-floor objection before it is raised.
5. **Pricing.** The three offers, plainly, with "Counsel Review is $100 less than the family price, because you are the reviewer."
6. **Trust.** Grounding as a hard filter (every finding re-verified against the record or dropped); zero-retention model providers; RLS tenancy; E&O bound; deletion on request; **work-product note** — the packet is prepared at counsel's direction for counsel's use.
7. **Public defender pilot.** The offer, the ask, the TIDC grant line, the county threshold fact from §3.4, and a form that routes to the founder.
8. **Sign-up.** Email, password, bar number, practice type. Creates an ATTORNEY in a new tenant; bar number queued for manual verification; the first matter form follows immediately.
9. **FAQ.** Confidentiality and privilege; conflicts (the vendor holds no client relationship); how it treats aged scans; page caps; what happens when the model finds nothing.

**Metrics:** visit → sign-up → bar-verified → first Counsel Review → second review → seat. Report weekly beside the consumer funnel; the two must be compared, not merged.

### 6.3 Sequencing against v1.1

The honest collision is capacity. The implementation plan staffs two engineers; v1.1 (Spanish, A/V add-on, attorney-signed review, records concierge) is a quarter of their time. Nine engineering-weeks of professional work in the same window means **v1.1 slips one quarter**, or the founder builds the professional surfaces personally. The recommended order is Counsel Review (~4 ew) first, because it is the smallest slice that produces both revenue and evidence, then seats, then the PDO-specific screen and clock once a pilot office is actually using the product.

### 6.4 What not to build

The v3 workspace — interactive Neo4j graph, side-by-side chat, drafting with Bluebook sanitisation, DOCX court export, Clio sync. None of it appears in either persona's first three jobs. It is the temptation the market study warned about in different words: building for the persona the founder imagines rather than the job the customer has. Ship the packet; let the seat data say what comes next.

---

## 7. Business analysis — impact on the business case and twelve-month financials

### 7.1 Unit economics per line

| Line | Price | COGS | Contribution | Margin | COGS basis |
|---|---:|---:|---:|---:|---|
| Counsel Review | $199 | $29.30 | **$169.70** | 85% | OCR $5, LLM $12, storage $1, Stripe $6.07, 10% sampled QA $1.25, 2% reserve $3.98 |
| Advocate seat / mo | $99 | $25.46 | **$73.54** | 74% | 1.2 reviews × $18, Stripe $3.17, Billing 0.7% |
| Chambers seat / mo | $249 | $30.00 | **$219.00** | 88% | Higher usage; PDO volume `[estimated]` |
| *Consumer (reference)* | *$299* | *$54* | *$252.62 net of CAC* | *83%* | *business_case.md §5.1* |

Counsel Review out-earns a consumer case on margin because the two costs the consumer carries — $12.50 of human QA and a $15 chargeback reserve — mostly do not apply to a licensed professional reviewing their own matter.

### 7.2 Twelve-month model — professional lines, base case

Months align with the business case's consumer year. Counsel Review launches in month 4, Advocate in month 7, the first Chambers office in month 10; three PDO pilots run free in months 5–8.

| Month | Counsel Reviews | Advocate seats | Chambers seats | Revenue | Cost | Contribution | Cumulative |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1–3 | — | — | — | $0 | $0 | $0 | $0 |
| 4 | 2 | — | — | $398 | $309 | $89 | $89 |
| 5 | 4 | — | — | $796 | $967 | −$171 | −$82 |
| 6 | 6 | — | — | $1,194 | $6,526 | −$5,332 | −$5,414 |
| 7 | 9 | 3 | — | $2,088 | $1,190 | $898 | −$4,516 |
| 8 | 12 | 5 | — | $2,883 | $1,329 | $1,554 | −$2,962 |
| 9 | 15 | 8 | — | $3,777 | $3,393 | $384 | −$2,578 |
| 10 | 18 | 11 | 5 | $5,916 | $1,208 | $4,708 | $2,131 |
| 11 | 22 | 14 | 5 | $7,009 | $1,401 | $5,608 | $7,738 |
| 12 | 26 | 18 | 5 | $8,201 | $1,620 | $6,581 | **$14,319** |
| **Year** | **114** | **59 seat-mo** | **15 seat-mo** | **$32,262** | **$17,943** | **$14,319** | |

Cost detail for the year: COGS $5,293 · pilot offices $2,400 · channel $10,250 (TCDLA Post-Conviction exhibitor $4,000 in M6, Appellate seminar $2,500 in M9, travel $1,500, attorney content $250/mo from M4). Month 6 and month 9 are negative because seminar spend lands before the redemptions it generates. Build (~9 ew) is **$0 cash in the founder-built path** and ~$31,500 in the funded path; neither is in the table.

### 7.3 Scenarios

| | Bear (40% of plan, no PDO conversion) | Base | Bull (180%, two PDO offices) |
|---|---:|---:|---:|
| Professional revenue | $11,411 | $32,262 | $58,819 |
| Professional contribution | **−$3,176** | $14,319 | $36,552 |
| Combined Y1 contribution (with consumer $58,877) | $55,701 | **$73,196** | $95,429 |

The bear case is negative: channel spend of ~$10k is committed regardless of uptake. That is the honest cost of the decision — roughly one consumer month of contribution at risk if the segment does not respond — and it is bounded, because the seminar spend is the only irreversible line and can be halved by exhibiting at one seminar rather than two.

### 7.4 Effect on the business case

**Year one.** Revenue $96,694 → $128,956 (+33%); product contribution $58,877 → $73,196 (+24%). Useful, not decisive.

**The seat base is pulled forward a year.** The business case's model had 25 professional seats live in Q4 of year two and 140 across year three. This plan has **23 seats and $3,027 MRR at month 12**. If the year-two ramp then follows the business case's own slope, year three lands nearer 250 seats than 140 — which is the difference between a three-FTE company that breaks even in year three and one that breaks even in year two. That, and not the year-one contribution, is what the founder is buying.

**Payroll coverage becomes a mix a Texas market can supply.** The business case's central finding was that a two-engineer payroll needs 114 consumer cases a month — a number with no demonstrated demand behind it. With professional lines the same $28,750/month is covered by roughly **50 consumer cases + 40 Counsel Reviews + 60 Advocate + 20 Chambers seats (98%)**, or 40 + 40 + 80 + 30 (102%). Forty Counsel Reviews a month is under 1% of the CCA's annual 11.07 intake touching the product once; eighty Advocate seats is under 2% of TCDLA's membership. Those are believable. 114 consumer cases a month was a hope.

**Gate 3 gets a second evidence stream.** The business case defers the ~$720k funding decision until the engine is proven on 30–50 paid consumer records. Counsel Reviews are paid records too, produced by users who will tell you exactly what the engine missed. Attorney-run records may prove the engine faster than consumer records, because the customer can read the output critically.

**What it does not do.** It does not change the recommendation to build lean and raise on evidence. It does not remove the consumer wedge. It does not make the bear case safe — it makes the bear case slightly worse in year one and materially better in year two.

### 7.5 Risks specific to this expansion

| # | Risk | L / I | Mitigation |
|---|---|---|---|
| P1 | **Two go-to-markets on a two-engineer team** — consumer v1.1 slips and neither segment gets finished | High / High | Counsel Review first (4 ew, reuses rails); seats and PDO screen only after 10 paid reviews; founder owns professional sales personally so engineering does not |
| P2 | **Channel conflict** at TCDLA — practitioners see the consumer product as undercutting the $3k file-read | Med / Med | §5.4 answers; the directory; lead with Persona 5 (no conflict) at the Appellate seminar |
| P3 | **PDO procurement stalls** — pilots love it, budget cycle says next fiscal year | High / Med | Pilot start aligned to county budget calendar (most Texas counties: FY starts 1 Oct); name the TIDC grant line; accept that base case has one conversion, not three |
| P4 | **Brand blocks Chambers** — a chief defender will not put "Snot Nose Legal" in a budget memo | Med / High | Resolve R-5 before the first pilot proposal; a professional sub-brand is the likely answer |
| P5 | **FR-1 preserved-error screen fails the eval gate** — the PD persona's primary screen is not yet built or validated | Med / High | Build behind the gate; PD pilots start on the existing five screens; preserved error joins when NFR-1 passes on the reference cases |
| P6 | **Sampled QA misses a citation error** reaching a lawyer's brief | Low / High | FR-7 citation re-verification stays 100% and blocking; sampling applies only to Part A/B prose review; attorney tenants see the "verified against record" mark per finding |
| P7 | **Work-product / confidentiality objections** from counsel or a court | Low / Med | Engagement terms: prepared at counsel's direction; zero-retention providers verified (NFR-3); deletion on request; no cross-tenant training |
| P8 | **Casefleet or Clearbrief adds a criminal-record screen** | Med / Med | Neither computes Texas deadlines or grounds to the CCA form; the labelled corpus is the moat; speed matters — hence M4 |

---

## 8. Assumptions register

| # | Assumption | Value | Source / status |
|---|---|---|---|
| B1 | Counsel Review price | $199 | `[estimated]` — $100 below consumer, justified by removed QA/reserve |
| B2 | Counsel Review COGS | $29.30 | Built from business_case A2 lines minus QA/reserve; 10% QA sample `[estimated]` |
| B3 | Counsel Review volume | 2 → 26/mo, M4–M12 (114) | `[estimated]`; anchored on ~134 board-certified specialists and 3,800 TCDLA members |
| B4 | Advocate price / included usage | $99 / 1 review, 1.2 used | Market study §6; usage `[estimated]` |
| B5 | Advocate seats | 3 → 18, M7–M12 | `[estimated]`; conversion from per-case buyers |
| B6 | Chambers price / PDO usage | $249 / $30 COGS | Market study §6; usage `[estimated]` |
| B7 | PDO pilots | 3 offices, 4 months, 8 records/mo each | `[estimated]`; Bexar-sized appellate divisions |
| B8 | PDO conversions in Y1 | Base 1 (M10), bear 0, bull 2 | `[estimated]`; county budget cycle |
| B9 | Channel spend | $10,250 | TCDLA exhibitor rates `[estimated]`; two seminars |
| B10 | Build | ~9 ew; $3,500/ew if funded | §6.1 breakdown; rate per business_case A13 |
| B11 | Consumer base year unchanged | 273 cases, $58,877 | business_case.md §5.2 — no cannibalisation assumed |
| B12 | 11.07 annual intake | 3,325 (FY2021) | S7 — most recent figure surfaced; FY2023/24 reports exist but were not retrievable here |
| B13 | Pro-se outcome gap | 84% vs 16% dismissed/denied without written order | S9 (Texas Defender Service 11.073 report) |
| B14 | County bid threshold | $100,000 from 1 Sep 2025 | S17 |
| B15 | Everlaw for Good excludes government PDOs and for-profit firms | 501(c)(3) or CJA panel required | S15 |

**Weakest inputs, stated plainly.** B3 and B5 — the professional volumes — are judgement calibrated to the size of the community, not to observed demand; the only evidence that Texas writ practitioners will pay $199 for a record screen is that they currently pay their own hours to do it. B8 depends on county budget calendars the plan cannot control. B12 is two fiscal years stale because the current CCA activity reports were behind the network proxy; the direction (thousands a year, most pro se) is not in doubt, the exact count is.

---

## 9. Decisions requested

1. **Approve Counsel Review at $199 as the first professional offer**, launching on existing Checkout rails at month 4, ahead of seats.
2. **Approve three free PDO pilots** and the founder's time to run them, with the conversion ask tied to the county budget calendar.
3. **Accept that v1.1 slips one quarter**, or fund the frontend contractor for a second block so it does not.
4. **Resolve the brand question (R-5) before the first pilot proposal** — it is now on the critical path for Chambers.
5. **Confirm the referral directory design** (neutral, no fees) with counsel at the launch-gate review, since it becomes the professional tier's cheapest channel.

---

## 10. Sources

- S1 — TIDC, *Managed Indigent Defense Systems Chart* (Oct 2025): https://www.tidc.texas.gov/media/f5hf0ttl/managed-indigent-defense-systems-chart-as-of-20251020-with-hub-counties-in-bold-v10.pdf
- S2 — KERA, "Rural Texas needs more public defenders" (Jan 2025): https://www.keranews.org/criminal-justice/2025-01-13/texas-indigent-defense-funding-public-defenders-criminal-attorney-shortage-legislature
- S3 — TIDC, December board meeting press release: https://www.tidc.texas.gov/media/bqyajikp/press-release-tidc-december-board-meeting.pdf
- S4 — Harris County Public Defender's Office, About: https://hcpdo.org/about/
- S5 — TIDC, *Public Defender Primer*: https://www.tidc.texas.gov/media/txbl01p2/public-defender-primer.pdf
- S6 — Bexar County Public Defender's Office / Appellate Division: https://www.bexar.org/1745/Appellate-Division
- S7 — Falkenberg, *Article 11.07 Writs of Habeas Corpus* (Texas Courts): https://www.txcourts.gov/media/1457413/1107-paper-53123-update.pdf
- S8 — *Ex parte Graves* (Tex. Crim. App. 2002): https://law.justia.com/cases/texas/court-of-criminal-appeals/2002/73927-3.html
- S9 — Texas Defender Service, *An Unfulfilled Promise: Assessing the Efficacy of Article 11.073* (2024): https://www.texasdefender.org/wp-content/uploads/2024/07/TDS-11.073-Report.pdf
- S10 — Lawyer Legion, Board Certified Criminal Appellate Law, Texas: https://www.lawyerlegion.com/certifications/texas/criminal-appellate-law
- S11 — TCDLA FAQ and seminar listings: https://www.tcdla.com/TCDLA/FAQs/TCDLA/FAQ.aspx?hkey=04f20cec-50f8-4c82-b2af-7022959d9009 · https://www.tcdla.com/TCDLA/Events/Event_Display.aspx?EventKey=P102518
- S12 — Innocence Project of Texas: https://innocencetexas.org/submit-a-case/
- S13 — Texas Rules of Appellate Procedure, Rules 73.1–73.2: https://www.txcourts.gov/media/1457526/texas-rules-of-appellate-procedure.pdf
- S14 — Office of Capital and Forensic Writs: https://ocfw.texas.gov/
- S15 — Everlaw for Good, Eligibility Requirements: https://www.everlaw.com/everlaw-for-good/learn-more/
- S16 — Clio, *Legal AI Tool Pricing* and *2025 Legal Trends for Solo and Small Firms*: https://www.clio.com/resources/ai-for-lawyers/legal-ai-tool-pricing/ · https://www.clio.com/resources/legal-trends/2025-solo-small-firm-report/
- S17 — Texas Association of Counties, *Changes to the County Purchasing Act* (SB 1173): https://www.county.org/resources/news/legalease-faqs-by-subject/county-finances/changes-county-purchasing-act
- S18 — TIDC, Improvement Grants: https://www.tidc.texas.gov/funding/improvement-grants/
- S19 — Texas Courts, *Anders* guidelines: https://www.txcourts.gov/media/1460406/anders-criminal-cases-guidelines.pdf
