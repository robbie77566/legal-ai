# Internationalization & Localization (Spanish) + Plain-Language Education

**Prepared:** 2026-09-01 · **Status:** Phase 0 implemented with this document · **Persona anchor:** families of incarcerated Texans — often lower-income, often limited formal education, a large share Spanish-dominant. Language and reading level are not polish; they are access.

## 1. Requirements (i18n/l10n specialist)

- **R1** Target locale: **US Spanish (es)** — neutral Latin American register, no regional slang, *usted* form (respect for an audience under stress).
- **R2** A **clearly visible language selector** on the sign-in/sign-up page, the landing nav, and the site footer — text-labeled ("Español"/"English"), never a flag icon (flags encode nationality, not language, and this audience is largely US-resident).
- **R3** Choice persists across the whole session (storage + `?lang=` override for links/emails), never flips mid-funnel.
- **R4** Reading level governs both languages: ~8th grade, short sentences, jargon glossed on first use in-line ("writ — a formal request to the court").
- **R5 Legal-copy rule:** the acknowledged disclosure cards may be *displayed* bilingually, but the **English text governs** until counsel signs Spanish legal copy — the governing-language note is itself shown in Spanish. The ack records the set version, unchanged.
- **R6 Coverage phases:** P0 (this change): landing, auth pages, buy-flow disclosures, the documents guide, footer, language switch. P1: eligibility wizard, case surfaces, tracker, emails. P2: the report Part A itself (model-generated Spanish — the roadmap's v1.1 item; requires its own QA/eval pass).
- **R7 Release process (every release):** (a) the **dictionary-parity test** fails CI if any key exists in one language and not the other; (b) any PR touching user-facing strings updates both languages or explicitly marks the key English-only pending translation; (c) a Spanish smoke of the changed surface is part of the release checklist (runbook); (d) translations of *legal* copy route through the counsel queue like any disclosure change.

## 2. Design considerations & the architecture decision

**Chosen: a lightweight typed dictionary + React context (`lib/i18n.tsx`)** — not a routing-based framework (next-intl/i18n routes) — because: the app is one locale-pair with client-heavy pages; `/es/...` route duplication would touch every link, the palette A/B, and the funnel-persistence logic for zero user benefit; and content is still moving weekly, where a heavyweight extraction pipeline slows iteration. Accepted trade-offs, recorded: SEO hreflang for a Spanish landing URL is deferred to P1 (a `?lang=es` link works for ads/referrals today); first paint may briefly show English before the stored preference applies (client swap) — acceptable at MVP, revisit with SSR cookies if measured as a real bounce cause. Migration path to next-intl stays open: the dictionary keys are the extraction inventory.

**Education requirements folded in (persona review):** the landing already ran at ~8th grade; this pass glosses the remaining jargon ("post-conviction," "writ") in both languages, and adds the missing artifact — a **public documents guide** (`/how-to-get-documents`, bilingual): what each document is *in plain words*, what it looks like, exactly how to ask the clerk for it (including a say-this-on-the-phone script), what it costs, and **what formats we accept** (PDF, or phone photos — JPG/PNG/iPhone HEIC — one page per photo, straight-on, all four corners visible). Linked from the landing's "we show you how" step, the checklist page, and the footer.

## 3. Dev/test process (implemented)

- `apps/web/lib/i18n.tsx`: `LangProvider` (localStorage `snl_lang`, `?lang=` override), `useLang()`, `<LangSwitch/>`.
- Bilingual content lives beside the surface it serves (a typed `{ en, es }` object per page) — co-location keeps translations honest during edits; the parity test walks these objects structurally.
- Tests: dictionary/content parity (every `en` key has an `es` twin, recursively); Spanish landing renders the Spanish hero after toggle; switcher persists. English-default keeps all existing copy tests green.
- Runbook release checklist gains: "user-facing string changes → both languages + parity test green + Spanish smoke of the surface."

## 4. Out of scope here, tracked

P1/P2 surfaces (§R6); Spanish transactional emails (needs the same counsel-adjacent review for the report-ready wording); `hreflang`/SEO; a professional translation review pass over the machine-authored es copy before launch marketing spends against Spanish audiences (budget line: ~$200–400 one-time, worth it).
