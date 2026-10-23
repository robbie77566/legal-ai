# snotnoselegal.com Site Design — Brand Site vs. Conversion Landing

**Prepared:** 2026-09-02 · **Status:** DESIGN (implementation on PO approval) · **PO framing:** the current landing page is the *marketing/conversion* tool; snotnoselegal.com is the *site* — overlapping content, different jobs.

## 1. The two-surface model

| | Conversion landing | Brand site |
|---|---|---|
| **Job** | Turn a motivated visitor into a free eligibility check, now | Earn trust and teach — for the ~90% not ready today, for the skeptical relative doing due diligence, and for search |
| **Visitor** | Clicked an ad, a community link, a referral | Typed the domain, googled a question, was told "check them out first" |
| **Shape** | One page, one CTA repeated, minimal nav (nowhere to leak attention) | Multi-page, full nav, education-heavy, every page still funnels to the same free check |
| **URL** | `/review` (current landing content moves here; ads/campaigns point here) | `/` becomes the brand home + the pages below |
| **Metric** | landing→check ≥ 25% (existing KPI) | organic sessions, learn-page→check assist rate, branded-search growth |

Timing is right: DNS isn't live yet, so moving the conversion page from `/` to `/review` breaks zero external links. The palette A/B, CtaLink analytics, and sticky-CTA behavior move with it unchanged.

## 2. Sitemap

```
/                      Brand home (new)
/review                Conversion landing (today's / — content unchanged)
/how-it-works          The product walkthrough, honestly told (new)
/pricing               $299 anatomy + overage/re-run + what's NOT sold (new)
/learn                 Education hub index (new)
  /learn/<article>     P2 articles (below)
/how-to-get-documents  (exists — becomes a /learn feature, URL kept)
/sample-report         Redacted synthetic sample of Part A (new, P2, counsel-gated)
/about                 Who we are: Tangent Solutions LLC, why this exists (new)
/faq                   Expanded FAQ (landing keeps its short accordion) (new)
/contact               admin@snotnoselegal.com + response expectation (new)
/terms                 Terms of service — DRAFT pending counsel (added 2026-10-23, UPL review rec 10)
/refund-policy         Refund policy — DRAFT pending counsel (added 2026-10-23, UPL review rec 10)
/disclosures /privacy /accessibility   (exist)
```

## 3. Page briefs

- **Home (`/`)** — a calm, credible front door, ~5 blocks: (1) hero stating plainly what we do for whom ("We read your loved one's court record and show you what's really in it — $299, in plain English"), single CTA to the free check; (2) the three-step how-it-works strip; (3) the trust block — what makes this different: every finding quoted from the record and re-verified, automated quality gates, attorney-signed evaluation methodology, we tell you when we find nothing; (4) education teaser (3 learn cards + documents guide); (5) the honesty filter ("this is not for every case") + footer CTA. Tone: calmer than the landing — fewer exclamation points of urgency, more institutional steadiness.
- **How it works (`/how-it-works`)** — the five tracker stages narrated with the same plain-language copy the status page uses, what the customer does vs. what the system does, the 10-business-day promise, and what arrives (Part A / Part B explained). Screens/mock imagery from our own UI only.
- **Pricing (`/pricing`)** — the $299 anatomy (what's included, the 5,000-page cap, +$49 overage blocks, $99 re-run with new documents), the two-phase upload/run model (uploading is free, iterate as long as you like), payment options (installments), and the anchor comparison ($3,000 attorney file review) stated factually. No dark patterns, no countdowns — pricing honesty IS the brand.
- **Learn (`/learn`)** — P2 article set chosen for search intent + persona need, each bilingual, 8th-grade level, UPL-safe (information about the law, never advice about their case): *What is an 11.07 writ, in plain words* · *The one-year federal deadline (AEDPA) explained* · *Why the first writ matters so much (the subsequent-writ bar)* · *What "ineffective assistance of counsel" actually means* · *What is Brady evidence* · *The junk-science law (11.073)* · *Glossary of court words*. The existing documents guide joins the hub with its URL preserved.
- **Sample report (`/sample-report`)** — a redacted Part A built from a SYNTHETIC case (the JOHN FIXTURE corpus, extended), so a family sees exactly what $299 buys before paying. Highest-leverage trust artifact on the site; **built 2026-09-02 (PO: proceed; counsel reviews the whole site batch at once)** — the fictional-case banner leads the page; it demonstrates output claims, so it stays high on the review batch.
- **About (`/about`)** — operated by Tangent Solutions LLC; why a software company built this (the access gap: $3,000 to have someone read a file); the human+AI method stated the way the landing already frames it; what we are not (not a law firm, no legal advice — linked to /disclosures). No stock-photo team pages, no invented credentials.
- **FAQ (`/faq`)** — superset of the landing accordion + operational questions (how long, what formats, refunds, Spanish, data handling/retention, what if you find nothing).
- **Contact (`/contact`)** — email, expected response time, and what support can/can't discuss (no legal advice — UPL guardrail restated gently).
- **Terms (`/terms`)** and **Refund policy (`/refund-policy`)** — added 2026-10-23 (`../compliance/upl_review_2026-10-23.md` rec 10). Each is headed "DRAFT — pending review by licensed counsel", carries the statement, and assembles the promises the buy cards and the landing already make: what the service is and is not, no outcome promised, price and scope, refund if records cannot be read, the re-run price, data handling, sharing. Both languages through the content-object pattern (`lib/content/terms.ts`, `lib/content/refund-policy.ts`, one `PolicyPage` component); linked from the site footer and from the buy page's disclosure step.

## 4. Shared chrome

- **Site nav** (brand pages): How it works · Pricing · Learn · About · FAQ + the persistent "Start the free check" button. **The conversion landing keeps its minimal nav** (logo + CTA + language switch only) — its job is focus.
- **Footer** (all pages, exists today): the statement from `packages/case-lifecycle/brand.ts` (`NOT_A_LAW_FIRM`, rendered by `<NotASubstitute />` in the current language), Tangent Solutions LLC, admin@, © , links to terms/refund-policy/disclosures/privacy/accessibility + the brand pages. Every page body also carries the statement (UPL review 2026-10-23, rec 1; `tests/unit/NotASubstitute.test.tsx`).
- **Bilingual everywhere** (i18n R1–R7): every new page ships as an `{en, es}` content object with parity-test coverage; text-labeled language switch in nav; English governs legal copy pending counsel.
- **Design language:** the existing Daybreak token system as-is. The palette A/B experiment stays **confined to `/review` + `/check`** (conversion surfaces) so brand pages render stable.

## 5. SEO (now it matters — the landing deliberately deferred it)

Per-page `metadata` (title/description) · `hreflang` en/es alternates via `?lang=es` canonicalization at P1, path-based `/es` only if Spanish traffic proves it · `sitemap.xml` + `robots.txt` · FAQ structured data on /faq · OpenGraph cards. Also the standing DNS item: the GoDaddy apex placeholder currently advertises "a law firm offering legal advice" — a UPL liability that must die at cutover (runbook item, unchanged).

## 6. Guardrails

Every page passes the same filters as the landing: information-report framing (never "we'll win your case"), no urgency theater, reading level ~8th grade in both languages, and any page that characterizes legal processes or our output joins the **counsel review queue** (learn articles, sample report, pricing claims). Analytics: one `snl.page_view`-level event per brand page + a `site→check` attribution property so the assist rate is measurable.

## 7. Phasing

- **P1 (pre-launch, ~1 dev-day):** move landing to `/review`, new home, /pricing, /about, /faq, /contact, site nav/footer wiring, metadata + sitemap, bilingual + parity tests. Launch can proceed with this alone.
- **P2 (post-launch weeks):** /learn hub + first 4 articles, /how-it-works, /sample-report (after counsel), FAQ schema.
- **Explicitly out:** blog machinery/CMS (articles are content objects in-repo until volume justifies more), testimonials (none exist yet — never fabricate; the feedback program will supply real ones with consent), multi-state content (joins the §12 expansion gates).

## 8. Professional surfaces (2026-10-19)

Workstream F of `../implementation/persona_rollout_plan.md` (§3 "audiences never see each other's copy", §5 F, §7 "Flags, not branches"). The four professional audiences — attorneys, public defender offices, clinics, investigators — get their own routes, navigation, sign-in landing and voice. The Daybreak tokens stay (`app/(daybreak)/daybreak.css`, the same fonts); the tone changes. The 2025 mocked build (`/dashboard`, `/workspace`) is removed; the staff Team page moved to `/ops/team`.

**Routes.**

| Route | Group | What it is | Auth / flag |
|---|---|---|---|
| `/for-counsel` | `(professional)` | The nine sections of `professional_tier_expansion.md` §6.2 in order (hero, the packet — a static sample Part B page as HTML with a volume · page · line cite and the verbatim excerpt —, how it fits the work, what it is not, pricing, trust, the PD pilot with its form, sign-up, FAQ) on the ADOPTED ladder: $149 / $249 / $349 by reporter's-record length, Long by quote from $499, five-pack 10% off, first review free with a verified bar number, re-run $99 | public, indexable |
| `/for-counsel/signup` | `(professional)` | Email, password (the api's rules, mirrored live), name, Texas bar number, practice type, organisation name → `POST /counsel/signup`, then the credentials sign-in, then `/counsel`. A duplicate email gets the family flow's neutral line. Says "Sign-ups open January 2027" while the GLOBAL `counsel_surfaces` flag is off (public `GET /counsel/signup` → `{ open }`) | public, not indexed |
| `/for-offices`, `/for-offices/security` | `(professional)` | The PD office page (pilot 15 records / 90 days / free; Office 50 / 120 / 250 by quote; unlimited users, investigator and viewer seats free; ACH invoicing; the pilot form) and the security one-pager (`docs/security/security_one_pager.md` without the founder's bracketed items) | public, indexable |
| `/for-investigators` | `(professional)` | Free membership inside an office or firm; the chronology as a Record Desk service; the request form explained; prices "on request" by design (set by mid-December) | public, indexable |
| `/counsel/join?token=` | `(professional)` | Accepts an organisation invitation (`POST /counsel/org/invitations/:token/accept`), then sign-in. Public: the middleware matcher leaves `/counsel/join` out | public, token-verified by the api |
| `/counsel` | `(counsel)` | Matters (title, vehicle, status in professional wording, bucket, opened), "Open a matter", the first-time empty state, the allowance / credits summary | PROFESSIONAL; `counsel_surfaces` |
| `/counsel/matters/new` | `(counsel)` | The matter form: `MatterCreateSchema` validated in the browser; vehicle picker with label and court per `VEHICLES`; initials only, never a name; the capital refusal inline from the 422 | same |
| `/counsel/matters/[caseId]` | `(counsel)` | Matter header; TRAP clock with the `unsignedCount` "proposed until counsel signs" disclaimer; record inventory (`GET /cases/:id/inventory`); the labelled uploader; quote card per decision kind (`counsel_checkout`); running status; the packet (`GET /counsel/matters/:caseId/packet.pdf`, probed through `packet.json` — "Packet arrives when analysis completes" until E2 lands) | same |
| `/counsel/org` | `(counsel)` | Members, pending invitations, invite (OWNER), remove seat; allowance panel for offices and clinics (`offices`); packs and credits for firms (`counsel_checkout`) | same |
| `/counsel/inbox` | `(counsel)` | CLINIC organisations only: deliveries newest first, open → `report.pdf` | `clinic_inbox` |
| `/counsel/record-desk` | `(counsel)` | Investigation requests and the new-request form | `record_desk` |
| `/counsel/account` | `(counsel)` | Name, email, password on the `/me` routes; the professional profile read-only | `counsel_surfaces` |

The api route table is `../specifications/staff_console.md` §10–§11; F adds `GET /counsel/signup` and the public, rate-limited `POST /counsel/pilot-interest` (`apps/api/src/routes/counsel-public.ts`: emails every admin with `sendPilotInterest`, one `PILOT_INTEREST` audit row with the office and county only).

**Navigation.** The professional site has its own nav (`components/professional/ProfessionalSiteNav.tsx`: For counsel · For offices · For investigators · Sign in · Open an account; the logo goes to `/for-counsel`) and footer (operator, the work-product line, Security, Disclosures, Privacy, Accessibility). The signed-in app has `ProfessionalNav` (`components/counsel/ProfessionalNav.tsx`): Matters · Organisation · Inbox (CLINIC with `clinic_inbox`) · Record Desk (`record_desk`) · Account — the item list is the pure `navItemsFor` in `lib/counsel.ts`. Neither ever shows the family nav or the ops nav. The family site's only crossing is one "For counsel" text link in `SiteFooter`; the family nav and home never link to `/counsel` or `/for-counsel`, and the professional pages never link to `/review` or `/check`. Sign-in lands by account kind (`lib/landing.ts`: PROFESSIONAL → `/counsel`); the professional sign-out returns to `/for-counsel`.

**Voice rules.** Plain and specific; no urgency theatre; nothing addressed to a family (no "your loved one", no Part A framing, no eligibility wizard); the persona headlines from `professional_tier_expansion.md` §5.4; "not research, not a citator, not a drafting tool" said out loud; prices are the adopted ladder and never the older $199; Record Desk, clinic triage and investigator chronology prices are "on request" until set; the work-product note on every public professional page's footer. English only in January. Copy lives in `lib/content/professional.ts`.

**Flag gating.** Every `(counsel)` page sits inside `CounselGate` (`components/counsel/CounselGate.tsx`), which reads `/counsel/me` and `/flags` once (`CounselProvider`) and renders the same "Not available" 404 page the api answers with (`NotAvailable.tsx`) when `counsel_surfaces` is off for the tenant; a page whose own flag is off (`offices`, `clinic_inbox`, `record_desk`, `counsel_checkout`) renders the same page or hides its card. The public `/for-counsel*` pages are always served; only the sign-up form closes when the global flag is off. The api guard (`requireFlag`) is the real gate; the web is UX gating only.

**Tests.** `tests/e2e/counsel.spec.ts` (F1 public pages with axe; F2 the signed-in flow against a local api with the override flipped by a seeded ADMIN through `tests/e2e/helpers/counsel.ts`, skipped on the staging run); `tests/unit/ProfessionalPages.test.tsx`, `ProfessionalNav.test.tsx`, `MatterForm.test.tsx`, `QuoteCard.test.tsx`, `CounselGate.test.tsx`, `RouteAccess.test.ts`; `apps/api/tests/counsel-public.integration.test.ts`.
