# Brand — Snot Nose Legal (PO, 2026-09-13)

**The logo.** "Snot Nose" hand-lettered in black marker; "LEGAL" in a heavy serif, charcoal, struck through by a neon highlighter stroke, the final "L" dissolving into binary digits; the tagline *Post-Conviction Case File Analytics* in a clean sans. White ground. It says: the legal establishment, marked up and digitized by someone irreverent enough to do it and serious enough to get it right.

## The system, derived from the logo

| Token | Value | Use |
|---|---|---|
| ink `--db-accent` | `#111318` | Calls to action (white text, 18:1), links, the report's headings |
| charcoal `--db-charcoal` | `#2b2f36` | "LEGAL" in the lockup, secondary headings |
| highlighter `--db-highlight` | `#e6ff3b` | **A mark, never text on white** (fails contrast): the `.db-hl` stroke behind a phrase, the rule under the PDF's cover name, the lockup's underline. Dark mode flips it into the CTA fill with dark text. |
| pale highlighter `--db-accent-soft` | `#f6ffb8` | Soft panels behind the CTA cards |
| semantic signal / review / urgent | unchanged | Report severity colors stay their own system |

Type: Source Serif 4 (headings, "LEGAL"), Public Sans (body), IBM Plex Mono (citations); **Permanent Marker** only inside the lockup's "Snot Nose" fallback. Voice: plain, warm, no legalese; the highlighter is the only playful note — one per page.

## Where the brand appears

| Surface | How |
|---|---|
| Web nav (brand site, family pages, landing, auth) | `BrandLogo` — `/brand/logo.png` at nav height, or the typographic lockup until the file exists / if it fails to load |
| Brand home hero | tagline kicker above the headline; the price carries the `.db-hl` stroke |
| Footer, auth, privacy, about | "Snot Nose Legal · Post-Conviction Case File Analytics — operated by Tangent Solutions LLC" + the no-advice line |
| PDF cover | the logo image when `packages/reports/assets/logo.png` exists, else the name; a highlighter rule under it; tagline + site; footer on every page; PDF metadata Title/Author |
| Email | From "Snot Nose Legal <noreply@snotnoselegal.com>"; footer with the tagline; subjects say "case review" |
| Stripe | product name "Snot Nose Legal case review — up to 5,000 pages…" |
| Ops console | keeps its dark Industrial Authority skin; header reads "Snot Nose Legal · Operations" |

The product is called a **case review** ("your case review is ready"); the company is **Snot Nose Legal**. "Family Case Review" is retired everywhere in the app; test fixtures that used it as a case title are just data.

## Installing the logo file

The PNG is not in the repository yet. Drop the same file in two places and commit:

```
apps/web/public/brand/logo.png       # web: BrandLogo renders it at every size
packages/reports/assets/logo.png     # PDF cover (pdfkit draws PNG directly)
```

White background as supplied; ~2000 px wide is fine (the web serves it unoptimized, ≈ nav height 36 px, hero 88 px). A transparent-background version would let the dark theme show it on the dark surface — until then the lockup handles dark mode. **Favicon and touch icon (done 2026-09-13):** the mark is the logo's serif **L** with the highlighter band behind it and the foot dissolving into pixel squares — the one element of the logo that survives 16 px. `apps/web/app/icon.svg` (crisp in modern browsers), `favicon.ico` (16/32/48), `apple-icon.png` (180), and `public/brand/icon-512.png` (for a future manifest) share one geometry; regenerate the rasters with `python3 scripts/brand-icon.py` (Pillow, no fonts).

All constants live in `packages/case-lifecycle/brand.ts` (`BRAND`, `NOT_A_LAW_FIRM`).
