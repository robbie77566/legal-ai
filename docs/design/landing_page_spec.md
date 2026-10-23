# Landing Page & Purchase Flow Specification — snotnoselegal.com

**Status:** Draft for design/engineering review · **Owner:** Product/Design · **Last updated:** 2026-10-23 (§2, §4 and §5 canon lines rewritten after the UPL review, `../compliance/upl_review_2026-10-23.md` recommendations 1, 2 and 10; §7 added 2026-10-19)
**Companions:** `mvp_ui_design_spec.md` (Daybreak system — this page uses its tokens) · `mvp_workflow_design.md` (S0/S1 stages this page feeds) · `mvp_v1_prd.md` (US-0/US-1, R-1–R-7)

## 1. Conversion strategy

**The conversion event is the free eligibility check, not the sale.** A $299 emotional purchase is not won by a button; it is won by the two-minute check that proves we're honest (it turns people away when the product doesn't fit). Every CTA on the page routes to `/check`. Payment converts *after* S0 says "good fit" — at that point the buyer has invested effort, received honesty, and seen the price framed.

Conversion principles applied (modern landing practice + our research):
1. **One CTA, repeated** — "See if this fits your case — free, 2 minutes." No competing actions; the nav has no menu, just the CTA.
2. **The record is the argument** — what the software does with it (every page read, six checks for the issues post-conviction law recognises, every quote re-verified) stated plainly in the hero, the problem block and the price section. No comparison to what a lawyer charges or does: the UPL review (2026-10-23, F1) retired the ~$3,000 attorney anchor and the "questions a lawyer asks" framing from every family surface.
3. **Honesty as a conversion device** — a visible "This is not for every case" section (capital cases, pending appeals, out-of-state) converts *better* with this audience, which has been burned by writ mills and prison-tech nickel-and-diming. "One price, no per-page fees" is a direct counter-position.
4. **The checking is on the page, truthfully** — one sentence everywhere: "Checked by automated quality gates and by our review staff when anything looks off." No one is held out as a legal reviewer or an attorney (UPL review 2026-10-23, E4/F3); the sentence lives in `packages/case-lifecycle/brand.ts` (`QUALITY_CHECKED`) and the tracker, emails, report footer and share-link notice import it.
5. **Mobile-first** — the buyer is on a phone; the desktop layout is the adaptation.
6. **No urgency theater** — no countdowns, no "2 spots left." The only legitimate urgency is legal (deadlines), and that claim stays general ("legal deadlines can expire") per R-1.

## 2. Page architecture (sections in order)

| # | Section | Job | Key copy (canonical — changes require R-5 tone review) |
|---|---|---|---|
| 1 | **Nav** | Brand + single CTA | Logo · "See if this fits — free" |
| 2 | **Hero** | State the offer in one sentence | H1: "Find out what's really in the court record — before you spend thousands." Sub: "AI built for one job: Texas convictions after the trial is over. It reads every page of your loved one's record, runs six checks for the issues post-conviction law recognises, and shows you only what it can prove with the exact words from the record — page and line. If a quote isn't really there, it never reaches you. Explained in plain English. **$299. One price, no per-page fees.**" CTA + micro-trust row: "Free 2-minute check · Not a law firm · Information, not legal advice" |
| 3 | **The problem** | Make the $299 meaningful | "A trial record runs to hundreds or thousands of pages, and most families never see what is in it — they decide blind, or don't decide at all. Our software reads every page of the record and runs six checks for the issues post-conviction law recognises, so you and a lawyer start from what the record actually says." |
| 4 | **How it works** | Reduce process fear | 3 steps: Answer a few questions (free) → Send the court documents (we show you how to get them; upload photos from your phone) → Get your report (plain-English findings + a packet any lawyer can use). Timeline note: "ready within **10 business days** of your documents being complete" (N resolved, PRD §10.1) |
| 5 | **What we look for** | Features as outcomes, not tech | Five cards in plain words: Mistakes the trial lawyer may have made · Evidence the State didn't turn over · Forensic science that's since been discredited · Sentence and jail-time-credit errors · Deadlines that still matter (incl. "if the lawyer never filed the appeal you asked for — that itself can be a claim"). Each card: "backed by page-and-line citations you can verify." No AI jargon in headings; one honest line: "AI built for this job. Quality gates check every report, and anything that looks off goes to a person before it reaches you." Proof row: "Every quote is re-verified word-for-word against your documents before delivery." · "The method was evaluated against real Texas cases." · "If we find nothing, we say so plainly — we don't sell hope." |
| 6 | **The report** | Show the deliverable | Two-part framing: Part A for you (plain English), Part B for your lawyer (citations, timeline, packet). Screenshot of the report screen. "Whatever we find — including nothing — we tell you straight, and there is always a next step." |
| 7 | **Price** | Transparent model | $299 card: everything included list (up to 5,000 pages, all six checks, quality gates on every report — human review when anything looks off, both report parts, secure handling). Below, small and honest: +$49 per extra 2,500 pages · $99 re-run with new documents. No anchor row (no lawyer price comparison). "Refund policy: if we can't read your records, we tell you before we analyze — and you choose re-upload or refund." Links to `/refund-policy`. |
| 8 | **Who this fits** | Honesty filter | Fits: Texas felony conviction, appeal decided (or never filed), family ready to get the documents. Not for: death-penalty cases (you have a right to appointed counsel — links), cases still on direct appeal (come back after), out-of-state/federal. |
| 9 | **FAQ** | Objection handling | 6 items: Is this legal advice? (no — what it is instead) · What if the news is bad? · What documents do I need / what if I can't get them? · Who sees our records? (privacy, no training, deletion) · How long does it take? · ¿Está disponible en español? (which pages are in Spanish — the information pages — and which are English today: the check, the purchase, the account, the case pages, the emails and the report; never "the whole site switches") |
| 10 | **Footer** | Legal disclosures | The statement (§5) in the current language, links to Terms, Refund policy, Disclosures, Privacy, Accessibility, contact |

**Visual treatment:** Daybreak tokens throughout (`mvp_ui_design_spec.md` §3) — warm paper ground, deep gold accent, Source Serif 4 headlines, Public Sans body. No gavel/handcuff stock photography; imagery is warm light/paper abstractions. Landing pages get one restrained motion moment: hero headline + CTA fade-up on load, honored `prefers-reduced-motion`.

## 3. Signup & payment workflow (S0 → S1 detail)

```
Landing → /check (S0 wizard, no account) → outcome
  "good fit" → /buy: [1] disclosure review screen → [2] account (email+password) → [3] Stripe Checkout → [4] receipt + land in /case/[id]/interview
```

Requirements:
- **W-1** No account before the eligibility outcome; S0 answers carry into the purchase session (server-side draft keyed by an anonymous token, promoted to the case on account creation).
- **W-2** The **disclosure review screen** is a distinct step before payment — the disclosures in §4 rendered as styled content cards with a single explicit checkbox ("I understand what this review is and isn't"), not buried in a terms link. This is both ethics (R-1/R-2) and chargeback defense (E-6 archives this acknowledgment per case).
- **W-3** Account creation is one screen: email, password, name (optional), relationship to the incarcerated person (optional, helps report addressing). Password rules per existing auth spec; email verification is non-blocking (verify link sent; purchase proceeds).
- **W-4** Payment via **Stripe Checkout** (hosted): card + Cash App Pay/Link where available. Amount, page cap, and overage terms restated on the Stripe line items. On success → case created in single-member tenant, receipt email (Resend), redirect to interview. On cancel → return to disclosure screen with state intact, no nagging.
- **W-5** Overage ($49) and re-run ($99) are separate Stripe checkouts initiated in-flow later; never stored-card auto-charges.
- **W-6** Payment-plan decision (PRD open question 5) — if adopted, only via Stripe's native installment options; never a custom ledger.
- **W-7** All purchase-flow analytics events (view → check-start → outcome → disclosure-ack → payment-success) feed the PRD §9 funnel metrics; no third-party ad pixels on any post-purchase page.

## 4. Required disclosures & notices at point of sale (the W-2 screen)

Each rendered as a card, plain language, in this order:

1. **What this is / isn't (UPL, R-1/R-2):** "This is a detailed review of court records — information to help you and a lawyer decide what to do next. It is **not legal advice**, and we are **not a law firm**. No attorney-client relationship is created. We never recommend filing anything on your own; a report is something to take *to* a lawyer."
   The step ends with a line to the full `/terms` and `/refund-policy` pages, which assemble these same cards at length (UPL review 2026-10-23, rec 10; both DRAFT until counsel signs).
2. **No outcome promises (DTPA-safe):** "We can't promise relief, release, or any court outcome. We promise a careful, cited review of what's in the record."
3. **Price & scope:** "$299 covers everything up to 5,000 pages. More pages: $49 per additional 2,500 — we'll ask first, never surprise you. Audio and video aren't included yet."
4. **The clock:** "Your review timeline starts when your documents are complete — we'll tell you the moment that happens."
5. **Refunds:** "If we can't read your records, we stop before analyzing and you choose: re-upload or refund."
6. **Privacy & records:** "Your records are encrypted, seen only by our review team, never used to train AI, kept 12 months, and deleted sooner on request. You confirm you're entitled to possess the records you upload."
7. **Deadline reality (urgency without theater):** "Legal deadlines can expire. Nothing on this page can tell you your deadline — the review estimates it, and a lawyer must confirm it."

## 5. Site-wide legal notices (footer + documents)

- **The statement** (every page, both languages, from `packages/case-lifecycle/brand.ts` `NOT_A_LAW_FIRM`, rendered by `<NotASubstitute />`): "Snot Nose Legal is not a law firm. This is information about what is in a court record. It is not legal advice and is not a substitute for the advice of an attorney." / "Snot Nose Legal no es un bufete de abogados. Esto es información sobre lo que hay en un expediente judicial. No es consejo legal y no sustituye el consejo de un abogado." It sits in the site footer, at the top of every check outcome, on the buy success, interview, documents, status, case home, report (top and footer), next-steps, account, sample report and how-it-works pages, the shared-token page, the professional footer and the counsel layout; on both PDF covers at body size with the "AI-generated content" label, and in every PDF page footer (≥ 8 pt) and every email footer. `apps/web/tests/unit/NotASubstitute.test.tsx` fails when a page renders without it.
- The landing's own footer line is the statement plus: "Reports are AI-generated content about court records. Checked by automated quality gates and by our review staff when anything looks off."
- **Terms of Service** (`/terms`, DRAFT pending counsel; UPL review 2026-10-23 rec 10): scope of service, no-advice/no-relationship/no-substitute, no outcome promised, price and scope, refunds, data handling, sharing and R-7 no-privilege clause for shared packets, account, Texas law and English governs. Arbitration/venue remain counsel's decision.
- **Privacy Policy:** data categories, retention (12 months), no-training commitment, subprocessors (cloud AI providers named in category), deletion rights, Texas data-privacy compliance (TDPSA).
- **Refund Policy** (`/refund-policy`, DRAFT pending counsel) matching §4.5 and E-1/E-6: unreadable records → re-upload or full refund before analysis; partial refunds for what we could not deliver; a refund never depends on what the report finds; extra pages and re-runs follow the same rules; full refund before records are marked complete; 5–10 business days to the card.
- **AI disclosure** (best-practices spec): "AI-generated content" labeled on the report page footer, on both PDF covers (`AI_GENERATED_LABEL`) and in the share-link notice.
- **Referral compliance (R-6):** every "find a lawyer" surface links the certified service, `https://www.texasbar.com/lris` (`LRIS_URL`), with "We receive nothing from any referral." beside it (`NO_REFERRAL_FEE`); the clinic consent card carries the R-7 sentence.
- **Marketing claims rule:** no testimonials at launch (we have none — no fabrication), no success statistics until real and substantiated; competitor price anchors cite public sources.
- Accessibility statement (WCAG 2.1 AA target) + contact.
- Spanish: the information pages (`/`, `/review`, `/how-it-works`, `/pricing`, `/learn`, `/how-to-get-documents`, `/faq`, `/sample-report`, `/about`, `/contact`, `/terms`, `/refund-policy`) ship in both languages; the check, purchase, account, case pages, emails and the report are English today, and the FAQ says exactly that.

## 6. Metrics (landing-specific, feeds PRD §9)

Visit → check-start rate (target ≥ 25%); check completion ≥ 80%; good-fit → disclosure-ack ≥ 60%; disclosure-ack → paid ≥ 70%; honesty-exit quality (not-a-fit visitors who use the resources links — a health metric, not a loss).

**Experimentation:** the landing page is the highest-power A/B surface (experiments E1–E4 in `../specifications/analytics_experimentation_plan.md`: hero framing, CTA label, anchor position, price-section layout). Winning copy variants still pass the R-5 tone review before entering the §2 canon — experiments never bypass the copy canon. The §4.3 red lines apply: disclosures, not-legal-advice language, and urgency mechanics are never tested.

## 7. The professional route group (added 2026-10-19)

Since 2026-10-19 the public pages `/for-counsel`, `/for-offices` and `/for-investigators` and the signed-in `/counsel` app exist as a separate Next.js route group (`apps/web/app/(professional)/*` and `apps/web/app/(counsel)/*`) with its own navigation, footer and voice (`snotnoselegal_site_design.md` §8). Nothing in §1–§6 changes for them: the family nav and home never link to them, the only crossing is one "For counsel" text link in the family `SiteFooter`, and the professional pages never link to `/review` or `/check`. They are served dark behind the `counsel_surfaces` flag (the public pages always render; the sign-up form says "Sign-ups open January 2027" while the global flag is off). Their prices are the adopted ladder in `../implementation/persona_rollout_plan.md` §4, never the older $199.

The family copy canon in §2 and §4–§5 was brought into line with the live copy on 2026-10-23 (UPL review recommendations 1 and 2): no surface promises a "trained legal reviewer" or an attorney's sign-off any more; the one checking sentence and the one statement come from `packages/case-lifecycle/brand.ts`, and the automatic-approval path sends its own email (`sendReportReadyAutoChecked`) saying the report passed the automated gates and was not held for staff review. Counsel's sign-off on the statement, the Terms and the Refund policy remains a launch gate before AUTO_APPROVE is turned on or `/for-counsel` goes live (runbook → Auto-delivery; persona rollout plan §7 go-live gates).
