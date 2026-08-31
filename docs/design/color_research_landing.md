# Color, Emotion, and Conversion — Landing Page Research

**Prepared:** 2026-08-31 · **Scope:** the Daybreak landing page and consumer funnel · **Output:** two evidence-ranked color schemes + a live A/B test (§6)

## 1. Who is looking at this page (the context that decides everything)

Color psychology's one replicated meta-finding is that **color effects are context-dependent** — the same hue is hospitable in one setting and hostile in another (Elliot & Maier's *color-in-context theory*). So the analysis starts from our viewer, not from a color wheel:

- A family member of an incarcerated Texan — most often a mother, wife, or sister — **under chronic stress**, reading on a phone, frequently at night or in waiting rooms.
- **Low institutional trust**, often earned: they have been failed by a lawyer once already. This is a $299 trust purchase, not an impulse buy.
- **Prison-loaded color associations that generic marketing research never accounts for:** orange (jumpsuits/DOC), institutional gray-green (facility interiors), harsh red (alerts, denial stamps). Color-in-context theory predicts these act as hostile primes for exactly this audience.
- The copy canon already bans urgency theater; the palette must not smuggle it back in.

## 2. What the evidence says

**Blue is the best-documented trust hue.** Labrecque & Milne's *Journal of the Academy of Marketing Science* studies ("Exciting red and competent blue") map blue to trust/competence; ~46% of consumers associate blue with trust and security; blue-trust holds cross-culturally more consistently than any other hue association, and it is the entrenched convention of legal and financial services. Caveat from the same literature: what drives outcomes is **congruence between color and brand personality**, not the hue in isolation.

**Warm palettes carry comfort, hope, and human warmth — and recent conversion work favors them for engagement.** Warm/high-contrast treatments outperform on click-through in 2025-cycle studies; warmth is also the brand's own positioning (Daybreak: dawn, hope, "your family, not a case number"). A warm palette *differentiates* — every incumbent legal site is blue.

**High-arousal red is contraindicated for an anxious audience.** Red reliably raises arousal regardless of context, while its *valence* is context-dependent; in threat-adjacent contexts it activates avoidance motivation and anxiety. For readers already carrying stress about a loved one's freedom, red as a dominant or accent color is a hostile prime. (Current canon — red reserved exclusively for deadline urgency — is exactly right and survives both schemes.)

**For the CTA, contrast beats hue — decisively.** The famous HubSpot "red beats green by 21%" result re-analyzed is an *isolation effect* (Von Restorff): red won because the page was green. Contrast ratio is ~3× more predictive of CTA success than hue choice, and CTAs above 7:1 contrast measure ~26% higher conversion than sub-4.5:1 regardless of color. **Design implication: both schemes must give the CTA ≥7:1 effective contrast and make it the only saturated element in its region — then the A/B test measures palette emotion, not button visibility.**

**Accessibility is a conversion feature here, not a compliance one:** old phones, sunlight, stress-degraded reading. Body contrast at WCAG AAA-ish levels; 17px/1.6 body (already in place); color never the only signal.

## 3. The two schemes

### Scheme A — “Daybreak Amber” (incumbent, warm)

The current palette: warm paper `#faf7f0`, ink `#1f2937`, deep amber accent `#8a6d1d`, amber-soft `#f4ecd6`. **Emotional bet:** hope, dawn, human warmth, a kitchen-table conversation — differentiated from the sea of legal blue. Risks: gold can read "expensive law firm"; warmth is less conventionally coded for *competence*.

### Scheme B — “Steady Harbor” (challenger, trust blue)

Cool paper `#f6f8fb`, navy ink `#1a2433`, muted `#55637a`, line `#dbe2ec`, accent `#1f5c99` (white-on-accent ≈ 5.4:1), accent-soft `#e3edf8`. **Emotional bet:** calm, steadiness, institutional competence — the evidence-heavy trust hue, softened (low-saturation navy, never corporate cobalt) to avoid coldness. Signal green, review amber, and urgent red are retained unchanged in both schemes (semantic colors are canon, not brand).

**Explicitly rejected:** orange-led (jumpsuit prime), institutional greens/grays (facility prime), red-led or countdown-styled anything (arousal/avoidance on an anxious audience), high-saturation "SaaS gradient" palettes (incongruent with the gravity of the subject — congruence is what Labrecque & Milne actually found matters).

## 4. Ranked hypothesis

1. **B (Harbor) wins on conversion** if the audience's dominant decision mode is *"can I trust these people with money and my family's records?"* — the literature's weight.
2. **A (Amber) wins** if the dominant mode is *"do these people see us as humans?"* — the differentiation/congruence bet, and the founder's brand instinct.

Both are defensible; that is precisely what an A/B test is for. Honest power note: color effects are typically small-to-moderate; at launch traffic, read no verdict before **≥200 landing views per variant**, and treat anything under a 20% relative difference in check-start rate as noise until volume grows.

## 5. Test design (implemented — see §6)

- **Assignment:** 50/50 at first visit, persisted (`localStorage`), stable across the whole funnel session so the palette never flips mid-journey.
- **Primary metric:** landing → eligibility-check start (`snl.landing_view` → `snl.check_cta_click`, both tagged `palette`). This is the page's declared conversion event (the FREE check, not the sale).
- **Secondary (PostHog funnel):** check completion and ack→paid by palette — watch that a palette doesn't win clicks but lose trust deeper in the funnel.
- **Guardrails:** CTA ≥7:1 contrast in both variants; semantic colors identical; no copy differences — one variable.

## 6. Implementation map

- Palette tokens: `apps/web/app/(daybreak)/daybreak.css` — `data-palette="harbor"` overrides (light + dark).
- Assignment + capture: `apps/web/lib/ab.ts` (no dependencies; silent no-op without `NEXT_PUBLIC_POSTHOG_KEY`).
- Applier: `components/ab/PaletteExperiment.tsx` (sets the attribute funnel-wide, pings `snl.landing_view` on the landing only).
- CTA instrumentation: `components/ab/CtaLink.tsx` (all three landing CTAs).

## Sources

- [Color-in-Context Theory — Elliot & Maier](https://www.sciencedirect.com/science/article/abs/pii/B9780123942869000020) · [Color and psychological functioning: review](https://www.researchgate.net/publication/275049913_Color_and_psychological_functioning_a_review_of_theoretical_and_empirical_work) · [Direct effects of red on arousal, context-dependent valence](https://peerj.com/articles/2515/)
- [Exciting red and competent blue — Labrecque & Milne](https://www.researchgate.net/publication/251277565_Exciting_red_and_competent_blue_The_importance_of_color_in_marketing) · [Trustworthy Blue or Untrustworthy Red](https://www.researchgate.net/publication/334550253_Trustworthy_Blue_or_Untrustworthy_Red_The_Influence_of_Colors_on_Trust) · [Colour in Online Advertising: Which Blue is a Must?](https://www.researchgate.net/publication/337926535_Colour_in_Online_Advertising_Going_for_Trust_Which_Blue_is_a_Must)
- [CXL: Which color converts best (isolation effect / HubSpot reanalysis)](https://cxl.com/blog/which-color-converts-the-best/) · [CTA contrast vs. hue evidence](https://heurilens.com/blog/trust-conversion/cta-design-placement-copy-color-converts) · [OptinMonster button-color research roundup](https://optinmonster.com/which-color-button-converts-best/)
- [UserTesting: color UX and conversion](https://www.usertesting.com/blog/color-ux-conversion-rates) · [Invesp: psychology of color in CRO](https://www.invespcro.com/blog/psychology-of-color/) · [Warm vs cool performance 2026](https://www.landingpageflow.com/post/which-performs-better-warm-vs-cool-color-psychology)
