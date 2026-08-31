# MVP UI/UX Design Specification — "Daybreak" Consumer Surface

**Status:** Draft for design/engineering review · **Owner:** Product/Design · **Last updated:** 2026-08-29
**Companions:** `mvp_workflow_design.md` (service blueprint S0–S7 — every screen here implements a stage there) · `mvp_v1_prd.md` (US-x/FR-x/R-x requirements) · `ui_design_system.md` + `../architecture/ui_design_system.md` (Industrial Authority — the professional system this doc deliberately does *not* use for consumers)

---

## 1. Design audit: why the MVP needs a second surface

The existing "Industrial Authority" system is excellent *for its personas* — it was designed for professionals in hours-long deep work: dark `#0B0E14` control center, 12px/32px high-density tables, bento grids, command-palette idioms. Its own philosophy doc says it "prioritizes precision, scannability, and deep-work focus **over traditional consumer-grade aesthetics**."

Persona 4 is the inversion on every axis:

| Axis | Professional personas (1–3) | Family persona (4, MVP) |
|---|---|---|
| Skillset | Legal training, daily software use | No legal training; prison-tech apps (JPay/Securus) are the software baseline |
| Device | Multi-monitor desktop | Mobile-first, often mobile-only |
| Session | 4-hour deep work | Short, interrupted sessions over weeks |
| Emotional state | Professional detachment | Stress, hope, fear; a $299 decision against a $30k one |
| Density need | Maximum information density | One thing at a time; progressive disclosure |
| Reading | Legal jargon fluency | ≤ 8th-grade level (NFR-2); Spanish fast-follow |
| Dark UI reads as | Serious, secure | Intimidating, "not for me" |

**Decision: two surfaces, one brand.** The consumer surface — codename **Daybreak** — is light, warm, calm, and mobile-first. It shares brand DNA with Industrial Authority (Law Gold accent, serif gravitas, the same semantic system) so the v2/v3 professional products feel like the same company, but nothing about its layout, density, or tone is inherited. Professionals get Industrial Authority; families get Daybreak; the internal QA console (US-8) stays Industrial Authority because its user is a professional.

## 2. Design principles (derived from JTBD, pain points, and workflow research)

1. **One question at a time.** Every multi-step flow (eligibility, interview, upload) is a wizard with a single decision per screen (TurboTax pattern, workflow §S0/S2). Cognitive load is the enemy; the user is stressed and interrupted.
2. **Always say what happens next.** Every screen ends with what the next step is and how long it takes. Uncertainty — not waiting — is the stress driver (Domino's tracker research, workflow §S4).
3. **Plain words, real warmth, zero cuteness.** 8th-grade reading level; no legalese without an inline definition; no exclamation marks, no mascots, no dark patterns. The R-5 "grieving family test" applies to every string.
4. **Show the work honestly.** Progress UIs surface *real* pipeline events ("Volume 3 of 7 read"), never fake spinners (operational-transparency research). The human QA stage is visible and its role concretely named.
5. **Never a dead end.** Every failure, rejection, "not a fit," and "nothing found" pairs the news with a next step (23andMe pattern; PRD R-1–R-3).
6. **Trust is typographic.** Serif headings carry legal gravitas; generous whitespace and large type signal "we are not hiding anything"; prices, caps, and policies render in full before payment, styled as content, not fine print.
7. **The phone is the primary device.** Every layout is designed at 390px first and adapted up. Touch targets ≥ 44px. The upload experience assumes the camera, not the scanner.
8. **Accessible is the baseline, not the audit.** WCAG 2.1 AA contrast on every token pair; full keyboard paths; `prefers-reduced-motion` honored; i18n-ready strings from day one (NFR-2).

## 3. The Daybreak design system

### 3.1 Color tokens

Light-first (families), with a calm dark mode driven by `prefers-color-scheme`. Law Gold survives as the brand accent but is darkened for AA contrast on light ground.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `db-bg` | `#FAF7F0` (warm paper) | `#12151C` | Page ground — warm, not clinical white |
| `db-surface` | `#FFFFFF` | `#1A1F29` | Cards, sheets |
| `db-ink` | `#1F2937` | `#E8EBF0` | Body text (AA on both grounds) |
| `db-muted` | `#5B6472` | `#96A0AE` | Secondary text |
| `db-line` | `#E5DFD2` | `#2B323E` | Hairline borders |
| `db-accent` | `#8A6D1D` (deep gold) | `#D4AF37` (Law Gold) | Links, primary buttons, focus rings |
| `db-accent-soft` | `#F4ECD6` | `#2A2410` | Accent washes, selected states |
| Semantic: signal | `#1E7A3D` / `#3FB950` | | "Strong signal" findings |
| Semantic: review | `#8A6206` / `#D29922` | | "Possible issue" findings |
| Semantic: none | `#5B6472` / `#96A0AE` | | "Nothing found" — **neutral gray, never red**: absence of a claim is not an error state |
| Semantic: urgent | `#B3382C` / `#F85149` | | Deadline urgency only — red is reserved exclusively for time |

**Semantic rule (differs from Industrial Authority deliberately):** the professional traffic-light scorecard maps green/amber/red to claim strength. For families, red on a legal finding reads as "something is wrong / my fault." Daybreak uses **signal / review / neutral** for findings and reserves red for deadline urgency alone.

### 3.2 Typography

| Role | Face | Rationale |
|---|---|---|
| Headings & report display | **Source Serif 4** (variable) | Legal gravitas without the typewriter stiffness of IBM Plex Serif; warm, highly readable large |
| UI & body | **Public Sans** (variable) | Designed by USWDS for government-grade plain-language legibility — precisely this audience; excellent at small sizes, tabular figures available |
| Data (page counts, prices, dates) | **IBM Plex Mono** | Continuity with brand; `tabular-nums` everywhere digits align |

Scale (mobile-first): body 17px/1.6 (larger than app-default 16 — reading under stress), wizard question 24px/1.3 serif, section h2 21px, caption 14px, minimum text 14px. Line length ≤ 34rem. All strings externalized (`next-intl`) with Spanish keys stubbed at v1.0 (NFR-2).

### 3.3 Shape, depth, motion

- Radius 12px on cards/sheets, 999px on pills — soft, not sharp (Industrial Authority's 4px sharpness reads as severity; Daybreak rounds it).
- Depth by border + subtle wash, one shadow level max (`0 1px 3px rgb(0 0 0 / .06)`); no glassmorphism, no gradients-as-decoration.
- Motion: 150–250ms ease-out transitions; wizard steps slide 16px + fade; the only signature animation is the **tracker breathing dot** on the active stage (a calm 2s pulse in `db-accent`, honoring the Listening Pulse lineage at 10% of its drama). Everything gated by `prefers-reduced-motion`.

## 4. Information architecture & routes

Next.js App Router (existing stack: Next 14+, Tailwind, shadcn/ui, Zustand, TanStack Query), new route group isolating the consumer surface and its theme:

```
apps/web/app/
  (daybreak)/                 ← consumer surface, Daybreak theme, public + consumer-auth
    page.tsx                  ← landing: value prop, price framing, "Check if this fits" CTA
    check/                    ← S0 eligibility wizard (no auth, no case)
    buy/                      ← S1 checkout (Stripe) + account creation
    case/[caseId]/
      interview/              ← S2 case interview wizard
      documents/              ← S2/S3 checklist + upload + echo-back
      status/                 ← S4/S5 tracker
      report/                 ← S6 interstitial + report viewer + downloads
      next-steps/             ← S7 referral consent, directory, re-run
    help/                     ← records how-to guides (county lookup), FAQ
  dashboard/ …                ← existing professional surface (Industrial Authority), untouched
  qa/                         ← US-8 QA console (Industrial Authority, ADMIN/ATTORNEY roles)
```

Consumer auth = the existing NextAuth email/password in a single-member tenant; no role UI, no tenant switcher, no professional nav ever renders in `(daybreak)`.

## 5. Screen-by-screen specification

### 5.1 Landing (`/`)
Mobile-first single column. Serif headline states the job, not the tech: **"Find out what's really in the court record — before you spend thousands."** Price block styled as content: `$299 · one price · no per-page fees` with the ~$3,000 attorney-review anchor beneath. Three-step how-it-works (Answer questions → Send documents → Get your report, with the human-review sentence). Trust row: named reviewer role, information-not-advice statement, refund policy link. Single CTA → `/check`. No stock-photo gavels; imagery is warm abstract paper/light motifs.

### 5.2 S0 — Eligibility wizard (`/check`)
- One question per screen, ~8 screens (PRD US-0 list), progress dots plus a "Question N of ~8" caption (dots alone don't tell a first-time user how long this is), and reassurance that "I'm not sure" is always an acceptable answer that leads somewhere.
- **"There was no appeal" branches, never ends:** the follow-up asks why; a lawyer who never filed a requested appeal is itself a strong writ claim (PRD FR-11) — the outcome screen for this path says so in plain words.
- Each answer is a full-width tappable card (44px+; radio semantics; keyboard arrows + enter).
- Jargon terms carry a tap-to-expand plain definition ("What's a PDR?").
- Outcome screens are distinct layouts, not toasts: *fit* (gold wash, "This looks like a fit — here's what happens next"), *not a fit* (neutral, resources list, never apologetic boilerplate), *capital exclusion* (serious tone, appointed-counsel resources), *appeal pending* (email capture card), *subsequent-writ warning* (review-amber panel explaining the §4 bar in plain words **before** any payment CTA).
- Tech: client component, `react-hook-form` + `zod` state machine, zero network until outcome logging (anonymous beacon).

### 5.3 S1 — Checkout (`/buy`)
Everything disclosed above the pay button as styled content cards: price + cap, clock rule ("your review clock starts when your documents are complete"), who reviews, information-not-advice, refund policy. Stripe Checkout hosted page for PCI simplicity; return URL lands in the interview. Account creation is one screen (email + password) folded into the flow.

### 5.4 S2 — Interview → checklist (`/case/[id]/interview`, `/documents`)
- Interview reuses the S0 wizard shell (~6 screens: county typeahead, year, court, trial length, appeal history, prior writ).
- The checklist is the **home screen of the case** — a vertical list of document cards, each with: plain name + "what this is" expander, state chip (Needed / Uploaded / Confirmed / Problem), and a **"Don't have this?"** expander with county-specific how-to (clerk address/phone, re:SearchTX link, expected cost, the direct-appeal-transcript reassurance).
- Overall completeness is a serif headline ("3 of 6 document types received"), not a percentage.
- Save-and-resume implicit: the checklist *is* the resume point; a returning user lands here.

### 5.5 S3 — Upload & echo-back (within `/documents`)
- **Shoebox path first-class:** a standing card — "Not sure what a paper is? Upload it anyway — we'll figure out what it is." Families start with a box of mixed papers; classification is the pipeline's job, not theirs. Echo-back assigns shoebox uploads to checklist items.
- Per-card upload button → file picker or camera. Phone-capture coach (one overlay: flat surface, fill the frame, good light) shown once, re-shown on low-confidence results.
- Upload: direct presigned-S3 PUT (existing flow) with resumable/multi-file queue, per-file progress, offline-tolerant retry (TanStack Query mutation queue) — prison-family research says networks are unreliable.
- **Echo-back card** after processing: "This looks like **Reporter's Record, Vol. 3** — 214 pages, *State v. ___*." [That's right] / [No, let me fix it]. Correction opens a simple picker of checklist types.
- Page meter: pinned footer bar `2,140 / 5,000 pages` (IBM Plex Mono, tabular) that becomes an inline overage offer card at the cap — never a modal ambush. The "duplicates ignored: N" note's expander states the reassurance the data rule earns: *"Duplicates don't count toward your pages — but we still read every page you send"* (ENG-3 amendment: dedup reduces billing, never analysis).
- **"Records complete"** is a full-screen moment: gold wash, serif headline ("Your documents are complete. Your review has started."), the clock promise restated with a date.

### 5.6 S4/S5 — Tracker (`/case/[id]/status`)
- Five named stages vertically (mobile) with the breathing dot on the active stage: Documents received → Digitizing your records → Analyzing the record → **Quality review** → Ready.
- Active stage shows honest live sub-detail from SSE events ("Volume 3 of 7 read · 412 pages analyzed"). No percentages, no fake ETAs; the commitment restated as a date range.
- Quality-review stage copy names the role: "A trained legal reviewer is checking every citation in your report against your documents."
- Empty of any legal content — findings never leak pre-QA (US-8).
- Tech: server component shell + small SSE client island; email transitions handled by the API.

### 5.7 S6 — Interstitial + report (`/case/[id]/report`)
- **Interstitial** (full screen, must be dismissed by choice): what the report can/can't tell you, "it may not contain the news you hoped for," [Read it now] / [Come back later]. Choice is remembered; no shame in later.
- **Summary first:** Part A opens with one plain sentence before any section ("In short: we found things in this record a lawyer should look at" / its honest negative counterpart) — the TL;DR a stressed reader needs before structure.
- **Deadline copy states tolling in the correct direction** (PRD FR-5): "a state court filing can pause this clock, but only while it's pending — a lawyer should confirm these dates." Never "does not pause every clock" (legally backwards).
- **Reading it isn't solitary:** the interstitial may note that some families read the report together — a humane, zero-cost line validated by the second-opinion delivery research.
- **Report viewer** (web) mirrors the PDF: Part A sections as cards grouped **Strong signals / Possible issues / Nothing found** (semantic colors per §3.1 — "nothing found" is neutral, never red). Each finding: plain-English sentence, "what this means" expander, and a "see it in the record" link that opens the cited page image with the passage highlighted — the family can *see* the evidence, which is the trust ceiling of the whole product.
- Deadline panel renders dates in mono with the urgency color reserved for genuinely near dates; laches note on old convictions.
- Every section ends with its next step (counsel guidance, §501.0081 note on time-credit findings, etc. per workflow S6).
- Downloads: Part A PDF, Part B PDF, and a "share with a lawyer" packet link. Part B viewer is intentionally plain — it's for the attorney; don't consumerize it.
- New-evidence flag (FR-10) renders as its own card: "You told us about evidence that was never presented — this review can't evaluate it, but your attorney must see it."

### 5.8 S7 — Next steps (`/case/[id]/next-steps`)
- Consent card for clinic sharing: who, exactly what, revocable; default off; single explicit toggle + confirm (R-6/R-7 language reviewed by counsel).
- Attorney directory (structure per R-6 resolution) and State Bar LRIS link.
- Re-run card ($99) appears only after report delivery.

### 5.10 Ops console (`/ops`) — Industrial Authority, ADMIN role
The administrator's surface (PRD US-9, `../specifications/internal_operations_spec.md`): a dense case-queue table (stage, lane, days-in-stage, QA state, deadline-urgent and stall chips), a guardrail stat row (cases in QA, stalled >7d, rolling COGS/case, refunds this week), and a pipeline-health rail (worker liveness, queue depth, OCR-confidence trend, provider errors) serving the SRE summary view. Case rows open the full event timeline with the audited actions: refund, disclosure-archive export, deletion workflow, SLA-delay marking (which flips the customer tracker to the honest "this delay is on us" state — the two surfaces are one mechanism). Bento density, semantic chips, Geist/IBM Plex per the Industrial Authority system.

### 5.9 QA console (`/qa`) — Industrial Authority, not Daybreak
Professional deep-work surface: reuses the existing side-by-side workspace (Parchment source left, findings right), adds a queue view (high-density table, adjudication-flagged findings sorted first), per-finding verify/edit/reject controls, Part A reading-level linter warnings, and an approve action that requires every finding checked. Audit-logged per US-8. This console is the v3 attorney workspace's daily dogfood.

## 6. Component inventory (shadcn/ui base + new)

| Component | Base | Notes |
|---|---|---|
| `WizardShell` | new | Question screens, progress dots, slide transitions, RHF+zod wiring — shared by S0 and S2 |
| `ChoiceCard` | `RadioGroup` | Full-width tappable answer card |
| `DocChecklistCard` | `Card` | State chip, expanders, upload slot |
| `EchoBackCard` | `Card` | Classification confirm/correct |
| `PageMeter` | new | Pinned footer, mono digits, overage state |
| `StageTracker` | new | Vertical stages, breathing dot, SSE sub-detail |
| `FindingCard` | `Card` + `Collapsible` | Semantic edge, plain sentence, record-link |
| `RecordPeek` | `Sheet`/`Dialog` | Cited page image w/ highlight overlay |
| `Interstitial` | `Dialog` (full-screen) | Gated results entry |
| `ConsentToggle` | `Switch` + confirm | R-6/R-7 copy slots |
| `DefinitionPopover` | `Popover` | Inline jargon definitions |
| `NextStepFooter` | new | Every screen's "what happens next" |

## 7. Engineering notes

- **Theming:** Daybreak tokens as CSS variables scoped to the `(daybreak)` route group layout; Tailwind `db-*` palette alongside existing `hg-*`; light default + `prefers-color-scheme` dark. **Governance:** both token sets live in one shared package; all Daybreak strings are externalized copy-canon files mapping to the specs; the design canvas is the screen-state source of truth and updates in the same cycle as merged UI changes (`../specifications/internal_operations_spec.md` UXG-1–3).
- **RSC split:** wizards, upload, tracker are client islands; landing/report shells are server components; report data fetched server-side (it's post-QA static per version).
- **State:** wizard state in RHF; case/upload state via TanStack Query with mutation retry queue; Zustand only for the upload queue UI.
- **Progress:** SSE (existing `sse_streaming.md` infra) for tracker sub-events; email via Resend on stage transitions.
- **i18n:** `next-intl`, all Daybreak strings keyed at v1.0, `es` locale stubbed (NFR-2).
- **Analytics:** the complete event taxonomy is the `snl.*` contract in `../specifications/analytics_experimentation_plan.md` §2 — implement those names exactly; no third-party ad pixels anywhere, no session replay on report or upload surfaces (records and findings are on screen). Experiment flags are server-driven and cookie-sticky (no client flicker); the S6 interstitial and disclosure surfaces are experiment red lines per that plan's §4.3.
- **Accessibility gates in CI:** axe-core on every Daybreak route; contrast checked at token level; reading-level lint (Flesch-Kincaid) on Part A template strings.

## 8. The other personas (so Daybreak doesn't paint us into a corner)

- **v2 Clinic Director:** stays Industrial Authority (bento triage dashboard already built). One new seam: consented referral packets arrive as cards in the intake queue rendering the same `FindingCard` data — the component's data contract is shared even though its skin differs.
- **v3 Attorney/Investigator:** the QA console *is* the workspace beta; Part B's structure is the drafting surface's input. The record-peek highlight overlay built for S6 becomes the professional cite-to-record viewer.
- **Brand bridge:** Law Gold, the serif voice, and the semantic system are the shared DNA; a clinic director who first saw a referral packet PDF and later opens the professional dashboard should feel one company at two altitudes.

## 9. Design QA checklist (per release)

Every Daybreak screen ships only if: readable at 390px with 200% text zoom; operable keyboard-only; AA contrast on all pairs; every string ≤ 8th-grade level (linted) and externalized; every failure state pairs news with a next step; no legal content visible pre-QA; R-5 tone check passed on new copy.


### 5.9 S8 — "Your reviews" home (`/cases`) *(added 2026-08-31, US-11)*

The signed-in landing for families — one account, any number of reviews. A vertical list of review cards, newest first: human name (county + conviction year when the interview has run, else "Review started <date>"), the customer-visible stage chip (same mapping as the tracker — internal loops never leak), and ONE primary action per card by stage: *Continue your checklist* (AWAITING_DOCS), *Watch progress* (in-flight), *See your report* (READY/DELIVERED). Below the list, a single secondary CTA: **"Start another review"** → S0 wizard (`/check`); checkout skips account creation for a live session (already built). Sign-in default routes by role (`/go`): CLIENT → `/cases`, ATTORNEY → `/qa`, ADMIN → `/ops` — a family must never land on a professional surface.

**Document return (US-11):** on the case documents page and the report page, every non-quarantined upload gets a *Download* action (short-TTL signed link, access-checked). The report page carries an **"Everything for your lawyer"** block: themed report PDF + link to the documents + *"Add documents & re-run ($99)"* (checkout `kind=rerun`). Printing = the PDF (no separate print stylesheet).