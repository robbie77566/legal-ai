# Mobile UX Review — Daybreak Consumer Surfaces

**Prepared:** 2026-08-31 · **Method:** code-level audit of every consumer page (not a checklist exercise — each finding cites the file it came from) · **Frame:** the primary device IS the phone. This audience uploads court records as phone photos, reads reports in bed, and texts the PDF to a lawyer. Mobile is not a viewport; it is the product.

## 1. Baseline: what was already right (keep doing this)

The Daybreak surfaces were built mobile-first and it shows:

- **Fluid single-column layouts** (`max-w-xl/2xl` + `px-5`), no fixed widths, no horizontal scroll anywhere.
- **17px/1.6 body type** ("reading under stress") — above the 16px iOS threshold, so form fields never trigger focus-zoom (Tailwind preflight makes controls inherit it).
- **Generous tap targets by construction:** wizard answers are full-width `p-4` buttons (~56px); interview radios wrap the whole labeled row, not the 16px control.
- **`prefers-color-scheme` dark mode** (night reading) and **`prefers-reduced-motion`** both respected.
- One CTA per screen, repeated — no competing actions to mis-tap.

## 2. Findings → fixes (all implemented in this change)

| # | Finding (file) | Why it matters on a phone | Fix |
|---|---|---|---|
| 1 | Upload accepted **one file per picker trip** (`documents/page.tsx`) | Eight record volumes = eight rounds of the OS picker; the single likeliest abandonment point for the core task | `multiple` + sequential upload loop (mid-batch failure keeps its progress). Deliberately **no `capture` attribute** — forcing the camera removes the gallery/files options on Android pickers; the OS sheet already offers the camera |
| 2 | Year/days inputs were `type="number"` only (`interview/page.tsx`) | iOS shows the full keyboard, not the digit pad; spinners invite mis-taps | `inputMode="numeric"` + `pattern="[0-9]*"` |
| 3 | **No PDF download anywhere in the report UI** (`report/page.tsx`) | The report's whole endgame is "show a lawyer" — on a phone that means text/email the file; the route existed, the UI never linked it | Prominent download button: *"Download the PDF — easy to text or email to a lawyer"* |
| 4 | Toasts at `bottom-right` (`app/layout.tsx`) | Bottom-right is under the thumb and the iOS home indicator; on narrow screens it overlaps the primary action zone | `top-center` |
| 5 | Wizard options had **hover-only** affordance (`check/page.tsx`) | Hover doesn't exist on touch; taps gave no feedback | `active:` border + soft background — instant press response |
| 6 | Landing CTAs scroll out of reach; nav pill ~36px tall (`page.tsx`) | Thumb-zone research: the primary action should stay reachable; 44px is the HIG minimum | **Sticky bottom CTA bar on mobile only** (`sm:hidden`, safe-area-inset padding, tracked as `position: "sticky"` in the A/B funnel) + nav pill raised to ≥44px; content bottom-padded so nothing hides behind the bar |
| 7 | `min-height: 100vh` and no `viewport-fit` (`daybreak.css`, layout) | Mobile URL-bar resize causes background jump; notched phones need safe-area insets for the new sticky bar | `100dvh` progressive enhancement + `viewportFit: 'cover'` |

Also fixed in copy: the upload page now says several files can be selected at once and warns that big files take minutes on cell service — **honest feedback beats silent spinners on cellular**.

## 3. Recommendations beyond this change (prioritized)

1. **Real device pass before launch (P0, one afternoon):** iPhone SE (smallest live viewport) + a mid-range Android on real cellular, walking check → buy → upload → tracker → report → PDF. Emulators don't show keyboard-overlap, picker, or share-sheet behavior.
2. **Upload progress on cellular (P1):** presigned `fetch` PUTs expose no progress events. When the deferred multipart/resume work happens (plan §M3 deferral), switch to XHR or chunked PUTs and show per-file percentage — cellular uploads of 50MB scans need visible progress, not faith.
3. **Web Share API for the report PDF (P1, small):** `navigator.share({ files })` puts "text it to the lawyer" one tap away instead of download → find file → attach.
4. **PWA shell (P2):** installable icon + offline tracker snapshot. Families check status compulsively; an icon on the home screen is retention. Defer until post-launch analytics justify it.
5. **SMS notifications (P2, product):** this audience lives in SMS more than email. When Twilio-class spend is justified, status transitions by text will outperform email opens.
6. **Do not add:** carousels, bottom-sheet modals, or hamburger navigation — the single-column, one-CTA structure is the right mobile pattern for this audience and this decision weight.

## 4. Explicit non-goals

`/qa` and `/ops` (Industrial Authority) are operator desktop tools — dense tables are correct there; making them thumb-friendly is not a goal. The A/B palette experiment is orthogonal: both schemes ship identical layout/tap-target metrics, and the sticky CTA reports its own `position` tag so it never confounds the palette comparison.
