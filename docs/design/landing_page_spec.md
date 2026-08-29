# Landing Page & Purchase Flow Specification — snotnoselegal.com

**Status:** Draft for design/engineering review · **Owner:** Product/Design · **Last updated:** 2026-08-29
**Companions:** `mvp_ui_design_spec.md` (Daybreak system — this page uses its tokens) · `mvp_workflow_design.md` (S0/S1 stages this page feeds) · `mvp_v1_prd.md` (US-0/US-1, R-1–R-7)

## 1. Conversion strategy

**The conversion event is the free eligibility check, not the sale.** A $299 emotional purchase is not won by a button; it is won by the two-minute check that proves we're honest (it turns people away when the product doesn't fit). Every CTA on the page routes to `/check`. Payment converts *after* S0 says "good fit" — at that point the buyer has invested effort, received honesty, and seen the price framed.

Conversion principles applied (modern landing practice + our research):
1. **One CTA, repeated** — "See if this fits your case — free, 2 minutes." No competing actions; the nav has no menu, just the CTA.
2. **Price anchoring is the argument** — $299 against the ~$3,000 attorney document review and $975–$2,000 medical second opinions. Anchors appear in the hero subtext, the price section, and the FAQ.
3. **Honesty as a conversion device** — a visible "This is not for every case" section (capital cases, pending appeals, out-of-state) converts *better* with this audience, which has been burned by writ mills and prison-tech nickel-and-diming. "One price, no per-page fees" is a direct counter-position.
4. **The human is on the page** — the QA reviewer's role stated concretely (trust research: vague "human-reviewed" scores worse than either extreme).
5. **Mobile-first** — the buyer is on a phone; the desktop layout is the adaptation.
6. **No urgency theater** — no countdowns, no "2 spots left." The only legitimate urgency is legal (deadlines), and that claim stays general ("legal deadlines can expire") per R-1.

## 2. Page architecture (sections in order)

| # | Section | Job | Key copy (canonical — changes require R-5 tone review) |
|---|---|---|---|
| 1 | **Nav** | Brand + single CTA | Logo · "See if this fits — free" |
| 2 | **Hero** | State the offer in one sentence | H1: "Find out what's really in the court record — before you spend thousands." Sub: "We read every page of your loved one's Texas trial record, check it for the problems that win appeals and writs, and explain what we find in plain English. Reviewed by a trained legal reviewer. **$299. One price, no per-page fees.**" CTA + micro-trust row: "Free 2-minute check · Not a law firm · Information, not legal advice" |
| 3 | **The problem** (anchor) | Make the $299 meaningful | "A lawyer charges about $3,000 just to read the file and tell you if a writ is worth pursuing. Full representation runs $15,000 or more. Most families decide blind — or don't decide at all." |
| 4 | **How it works** | Reduce process fear | 3 steps: Answer a few questions (free) → Send the court documents (we show you how to get them; upload photos from your phone) → Get your report (plain-English findings + a packet any lawyer can use). Timeline note: "ready within N business days of your documents being complete" |
| 5 | **What we look for** | Features as outcomes, not tech | Five cards in plain words: Mistakes the trial lawyer may have made · Evidence the State didn't turn over · Forensic science that's since been discredited · Sentence and jail-time-credit errors · Deadlines that still matter (incl. "if the lawyer never filed the appeal you asked for — that itself can be a claim"). Each card: "backed by page-and-line citations you can verify." No AI jargon in headings; one honest line: "Powered by careful AI analysis — and checked by a person, every time." |
| 6 | **The report** | Show the deliverable | Two-part framing: Part A for you (plain English), Part B for your lawyer (citations, timeline, packet). Screenshot of the report screen. "Whatever we find — including nothing — we tell you straight, and there is always a next step." |
| 7 | **Price** | Transparent model | $299 card: everything included list (up to 5,000 pages, all five checks, human review, both report parts, secure handling). Below, small and honest: +$49 per extra 2,500 pages · $99 re-run with new documents. Anchor row: attorney review ~$3,000 · medical second opinions $975–$2,000. "Refund policy: if we can't read your records, we tell you before we analyze — and you choose re-upload or refund." |
| 8 | **Who this fits** | Honesty filter | Fits: Texas felony conviction, appeal decided (or never filed), family ready to get the documents. Not for: death-penalty cases (you have a right to appointed counsel — links), cases still on direct appeal (come back after), out-of-state/federal. |
| 9 | **FAQ** | Objection handling | 6 items: Is this legal advice? (no — what it is instead) · What if the news is bad? · What documents do I need / what if I can't get them? · Who sees our records? (privacy, no training, deletion) · How long does it take? · ¿Está disponible en español? (coming; when) |
| 10 | **Footer** | Legal disclosures | Full disclosure block (§5), links to Terms, Privacy, Refund Policy, contact |

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
2. **No outcome promises (DTPA-safe):** "We can't promise relief, release, or any court outcome. We promise a careful, cited review of what's in the record."
3. **Price & scope:** "$299 covers everything up to 5,000 pages. More pages: $49 per additional 2,500 — we'll ask first, never surprise you. Audio and video aren't included yet."
4. **The clock:** "Your review timeline starts when your documents are complete — we'll tell you the moment that happens."
5. **Refunds:** "If we can't read your records, we stop before analyzing and you choose: re-upload or refund."
6. **Privacy & records:** "Your records are encrypted, seen only by our review team, never used to train AI, kept 12 months, and deleted sooner on request. You confirm you're entitled to possess the records you upload."
7. **Deadline reality (urgency without theater):** "Legal deadlines can expire. Nothing on this page can tell you your deadline — the review estimates it, and a lawyer must confirm it."

## 5. Site-wide legal notices (footer + documents)

- Footer line (every page): "Snot Nose Legal is not a law firm and does not provide legal advice. Reports are information about court records, prepared with AI assistance and reviewed by trained staff, for use in consultation with a licensed attorney."
- **Terms of Service** (attorney-drafted, launch gate 2): scope of service, no-advice/no-relationship, arbitration/venue decisions, acceptable use, R-7 no-privilege clause for shared packets.
- **Privacy Policy:** data categories, retention (12 months), no-training commitment, subprocessors (cloud AI providers named in category), deletion rights, Texas data-privacy compliance (TDPSA).
- **Refund Policy** page matching §4.5 and E-1/E-6.
- **AI disclosure** (best-practices spec): AI-generated content labeled in-product and in reports.
- **Referral compliance (R-6):** any "find a lawyer" surface carries its resolved structure's required language (State Bar LRIS referral or neutral directory disclaimer) — no referral fees.
- **Marketing claims rule:** no testimonials at launch (we have none — no fabrication), no success statistics until real and substantiated; competitor price anchors cite public sources.
- Accessibility statement (WCAG 2.1 AA target) + contact.
- Spanish notice: "Ayuda en español próximamente" with email capture until v1.1 ships.

## 6. Metrics (landing-specific, feeds PRD §9)

Visit → check-start rate (target ≥ 25%); check completion ≥ 80%; good-fit → disclosure-ack ≥ 60%; disclosure-ack → paid ≥ 70%; honesty-exit quality (not-a-fit visitors who use the resources links — a health metric, not a loss).

**Experimentation:** the landing page is the highest-power A/B surface (experiments E1–E4 in `../specifications/analytics_experimentation_plan.md`: hero framing, CTA label, anchor position, price-section layout). Winning copy variants still pass the R-5 tone review before entering the §2 canon — experiments never bypass the copy canon. The §4.3 red lines apply: disclosures, not-legal-advice language, and urgency mechanics are never tested.
