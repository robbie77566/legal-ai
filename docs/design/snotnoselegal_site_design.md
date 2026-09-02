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
/about                 Who we are: Tangent Software LLC, why this exists (new)
/faq                   Expanded FAQ (landing keeps its short accordion) (new)
/contact               admin@snotnoselegal.com + response expectation (new)
/disclosures /privacy /accessibility   (exist)
```

## 3. Page briefs

- **Home (`/`)** — a calm, credible front door, ~5 blocks: (1) hero stating plainly what we do for whom ("We read your loved one's court record and show you what's really in it — $299, in plain English"), single CTA to the free check; (2) the three-step how-it-works strip; (3) the trust block — what makes this different: every finding quoted from the record and re-verified, automated quality gates, attorney-signed evaluation methodology, we tell you when we find nothing; (4) education teaser (3 learn cards + documents guide); (5) the honesty filter ("this is not for every case") + footer CTA. Tone: calmer than the landing — fewer exclamation points of urgency, more institutional steadiness.
- **How it works (`/how-it-works`)** — the five tracker stages narrated with the same plain-language copy the status page uses, what the customer does vs. what the system does, the 10-business-day promise, and what arrives (Part A / Part B explained). Screens/mock imagery from our own UI only.
- **Pricing (`/pricing`)** — the $299 anatomy (what's included, the 5,000-page cap, +$49 overage blocks, $99 re-run with new documents), the two-phase upload/run model (uploading is free, iterate as long as you like), payment options (installments), and the anchor comparison ($3,000 attorney file review) stated factually. No dark patterns, no countdowns — pricing honesty IS the brand.
- **Learn (`/learn`)** — P2 article set chosen for search intent + persona need, each bilingual, 8th-grade level, UPL-safe (information about the law, never advice about their case): *What is an 11.07 writ, in plain words* · *The one-year federal deadline (AEDPA) explained* · *Why the first writ matters so much (the subsequent-writ bar)* · *What "ineffective assistance of counsel" actually means* · *What is Brady evidence* · *The junk-science law (11.073)* · *Glossary of court words*. The existing documents guide joins the hub with its URL preserved.
- **Sample report (`/sample-report`)** — a redacted Part A built from a SYNTHETIC case (the JOHN FIXTURE corpus, extended), so a family sees exactly what $299 buys before paying. Highest-leverage trust artifact on the site; **counsel review required before publish** (it demonstrates output claims).
- **About (`/about`)** — operated by Tangent Software LLC; why a software company built this (the access gap: $3,000 to have someone read a file); the human+AI method stated the way the landing already frames it; what we are not (not a law firm, no legal advice — linked to /disclosures). No stock-photo team pages, no invented credentials.
- **FAQ (`/faq`)** — superset of the landing accordion + operational questions (how long, what formats, refunds, Spanish, data handling/retention, what if you find nothing).
- **Contact (`/contact`)** — email, expected response time, and what support can/can't discuss (no legal advice — UPL guardrail restated gently).

## 4. Shared chrome

- **Site nav** (brand pages): How it works · Pricing · Learn · About · FAQ + the persistent "Start the free check" button. **The conversion landing keeps its minimal nav** (logo + CTA + language switch only) — its job is focus.
- **Footer** (all pages, exists today): legal line, Tangent Software LLC, admin@, © , links to disclosures/privacy/accessibility + new pages.
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
