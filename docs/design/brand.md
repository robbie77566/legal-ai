# Brand — Snot Nose Legal (PO, 2026-09-13)

**The logo.** "Snot Nose" hand-lettered in black marker; "LEGAL" in a heavy serif, charcoal, struck through by a neon highlighter stroke, the final "L" dissolving into binary digits; the tagline *Post-Conviction Case File Analytics* in a clean sans. White ground. It says: the legal establishment, marked up and digitized by someone irreverent enough to do it and serious enough to get it right.

## The system, derived from the logo

| Token | Value | Use |
|---|---|---|
| ink `--db-accent` | `#111318` | Calls to action (white text, 18:1), links, the report's headings |
| charcoal `--db-charcoal` | `#2b2f36` | "LEGAL" in the lockup, secondary headings |
| highlighter `--db-highlight` | `#e6ff3b` | **A mark, never text on white, and never behind letters** (2026-09-13: with the stroke behind the price, dark mode put near-white text on yellow — 1.07:1, unreadable). The `.db-hl` stroke is an underline that sits under the baseline; the PDF's cover rule sits under the name; the lockup's stroke under "LEGAL". Dark mode flips it into the CTA fill with dark text (14.9:1). |
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

White background as supplied; ~2000 px wide is fine (the web serves it unoptimized, ≈ nav height 36 px, hero 88 px). Then run `python3 scripts/brand-logo-variants.py`: it writes `logo-transparent.png` (white ground removed) and `logo-dark.png` (ink lifted to paper, highlighter kept) beside it and copies the PDF asset. `BrandLogo` serves the dark variant on dark surfaces and the transparent one on light, via a `<picture>` element; until the variants exist the browser falls back to `logo.png`, and if that is missing too, to the lockup. **Favicon and touch icon (done 2026-09-13):** the mark is the logo's serif **L** with the highlighter band behind it and the foot dissolving into pixel squares — the one element of the logo that survives 16 px. `apps/web/app/icon.svg` (crisp in modern browsers), `favicon.ico` (16/32/48), `apple-icon.png` (180), and `public/brand/icon-512.png` (for a future manifest) share one geometry; regenerate the rasters with `python3 scripts/brand-icon.py` (Pillow, no fonts).

All constants live in `packages/case-lifecycle/brand.ts` (`BRAND`, `NOT_A_LAW_FIRM`).

## Readability audit (2026-09-13)

WCAG contrast of every token pairing the site actually uses (`scripts` snippet in the commit); all pass 4.5:1 in both themes after the fix:

| Pairing | Light | Dark |
|---|---|---|
| body text on cards / page | 15.6 / 14.7 | 14.0 / 15.4 |
| muted text on cards / page / soft panels | 6.1 / 5.7 / 5.8 | 6.4 / 7.0 / 5.3 |
| text on soft panels (bottom line, CTA cards) | 14.8 | 11.7 |
| button label on the CTA | 18.6 | 14.9 |
| links / accent text on cards; name pill on soft | 18.6 / 17.6 | 14.9 / 12.5 |
| severity text: green / amber / red / grey | 5.4 / 5.5 / 6.0 / 6.0 | 6.6 / 6.6 / 5.0 / 6.3 |
| text ON the highlighter — before the fix | 13.9 | **1.07 (fail)** → no longer occurs: the stroke never overlaps text |

Output documents: the PDF paints text only in ink, charcoal, the severity colors, and greys on white; the highlighter appears once, as a rule under the cover name. Emails are plain text.
