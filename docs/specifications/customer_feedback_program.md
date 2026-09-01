# Customer Feedback Program — Research & Recommendations

**Prepared:** 2026-09-01 (PM research) · **Goal:** learn how customers feel about report quality and whether they felt the purchase was worth it — *without ever asking about money* · **Constraint that shapes everything:** a large share of reports deliver hard news; satisfaction instruments must separate "served well" from "liked the answer," or they measure grief.

## 1. Technique research — what fits and what doesn't

| Technique | Verdict for us | Why |
|---|---|---|
| **CSAT** (1–5, transactional, at the moment of service) | ✅ adopt, reworded | Right timing model; the question must target *clarity of explanation*, not happiness |
| **NPS** (0–10 "how likely to recommend") | ⚠️ adopt the *question*, drop the *ritual* | At 30 cases/mo the score is statistical noise; but "would you tell another family in your situation to get this?" is the best money's-worth proxy that never mentions money — peer-referral intent prices the product implicitly |
| **CES** (customer effort score) | ✅ but for the *process*, not the report | "How easy was getting your documents in?" — measures the funnel, feeds the checklist UX |
| **Sean Ellis PMF** ("how disappointed if it disappeared") | ❌ | Built for recurring products; nonsensical for a one-shot review |
| **Email surveys** | ⚠️ secondary only | 5–15% response rates; use for the *delayed* value question where in-product can't reach |
| **In-product micro-survey** (1–2 taps + optional text) | ✅ primary | 20–40% response rates; catches the customer at the value moment |
| **Behavioral/revealed signals** | ✅ already instrumented | PDF download, share-with-lawyer link creation, next-steps consent, re-run purchase, refund/chargeback — these are *revealed* value; surveys exist to calibrate against them |

**Low-volume reality:** at launch scale, statistical dashboards are a fantasy. Every response should be read individually by the founder — qualitative open-text is the highest-value channel for the first year, and the survey design should maximize it.

## 2. Recommended instrument (three touches)

**Touch 1 — on the report page, once, dismissible (the value moment: after the PDF download or meaningful scroll):**
- Q1 (CSAT, reworded for bad-news neutrality): *"How well did this report explain what's in the record?"* — 1–5.
- Q2 (the money's-worth proxy): *"Would you tell another family in your situation to get this review?"* — Yes / Not sure / No.
- Optional open text: *"What did this report help you decide?"* — the product's stated job is selling the decision; this asks exactly that.

**Touch 2 — email at +7 days (Resend; one question deep):**
- *"Have you shared your report with a lawyer yet?"* (Yes/planning to/no) + open text *"Anything that almost stopped you from getting the review?"* — objection mining for the landing page, and the share answer cross-checks the behavioral signal.

**Touch 3 — refund/rejection follow-ups: none.** A family that asked for a refund or got devastating news is not a survey target; the ops record already tells that story. (Explicit anti-recommendation — surveying them harms the brand for zero learning.)

## 3. Bias guards (from the research)

- Never survey *before* the customer has seen the full report (measures anticipation, not delivery).
- Neutral verbs — "explain," "tell," "help you decide" — never "enjoy," "love," "satisfied with your results."
- The bad-news case is normalized in copy: the micro-survey intro is one line — *"However your report turned out, we want to know if we did our job well."* This sentence is what licenses honest answers from families who got hard news.
- One prompt, dismiss forever; no nag loops (this audience's goodwill is not renewable).

## 4. Workflow integration & scorecard

- Responses → `snl.survey_*` events (PostHog) + a small table read weekly by the founder alongside the spot-check queue (runbook cadence).
- The **value scorecard** at launch: Q2 yes-rate (target ≥60%), report-PDF download rate, share-link creation rate, refund rate ≤5% (existing KPI), plus every open-text read raw. Q2-yes correlated against severity mix answers the deepest question: *do families who got bad news still endorse the service?* If yes, the product's honest-broker positioning is working; if no, Part A's delivery of hard news needs work — a copy problem, not an engine problem.
- Feeds: objection texts → landing/FAQ iteration; "helped me decide" texts → testimonial pipeline (with consent); Q1 ≤2 responses → founder personal follow-up email (recovery + learning).

## 5. Implementation sketch (when approved)

Report page `FeedbackCard` (localStorage-dismissed, appears after PDF download click or 30s dwell) → `POST /cases/:id/feedback` (one row per case, upsert) → `snl.survey_report` event; +7d email via a simple daily interval checking READY cases aged 7 days without a sent flag. ~half-day build on existing rails.
