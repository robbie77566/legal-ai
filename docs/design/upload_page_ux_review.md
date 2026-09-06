# Upload Page UX Review & Analysis-Progress Feedback

**Prepared:** 2026-09-01 · **Reviewer role:** modern web-app UX pass over S2/S3 (documents) and S4/S5 (status) · **Persona anchor:** stressed, often first-generation-online family member on a phone; every extra decision on this page costs completions.

## 1. Findings (documents page, as shipped through 4699b0e)

| # | Finding | Severity | Disposition |
|---|---|---|---|
| F1 | **Three competing upload entry points** (ZIP card, "shoebox" card, a button on every checklist item) force a *where do I click* decision before the first file moves. Modern pattern is ONE upload zone that takes anything. | High | Fixed: single "Add your documents" zone (takes PDFs, photos, **and ZIPs** through one picker; drag-and-drop on desktop); shoebox card folded into it ("not sure what a paper is? add it anyway"); per-item buttons demoted to a small link on **still-needed items only** |
| F2 | **No sense of overall progress.** The checklist is a flat list; the user can't see "how close am I?" at a glance — the single highest-leverage motivator on a multi-visit task. | High | Fixed: "Documents found: X of N" header with a progress bar, always at the top |
| F3 | **Page order buried the mental anchor.** Files list and echo-back cards rendered above the checklist the customer is actually working. | Medium | Fixed: progress → add zone → confirmations → what's-still-needed → your files (collapsed) → meter → start button |
| F4 | **Per-file processing state was invisible** — after an upload the file just sat in a list; "did it work?" was unanswerable during digitization. | Medium | Fixed: status chip per file — "Reading it now…" while classification is in flight, "Recognized" once matched |
| F5 | **Received/Needed binary hid the PROBLEM state** (a flagged item read as "Received"). | Medium | Fixed: chip map now distinguishes Needed / Received / Confirmed / Needs attention |
| F6 | Echo-back cards appeared as unexplained interruptions. | Low | Fixed: grouped under one heading — "Quick check — did we name these right?" |
| F7 | Intro paragraph carried four instructions in one breath. | Low | Fixed: one line; operational guidance lives in the add zone |
| F8 | 402 overage response renders as raw error text with no purchase path | Medium | **Deferred** — needs the in-flow overage purchase UI (tracked in mobile_ux_review.md) |
| F9 | No upload progress % for large files on slow connections (fetch PUT has no progress events) | Low | **Fixed (2026-09-01, PO request):** the S3 PUT moved to XHR — per-file progress bar with % and "file N of M" in the add zone, plus the keep-page-open reassurance |

## 2. Analysis-progress feedback (status page)

**Problem:** during ANALYZING the tracker showed a breathing dot and, at best, "Volume 3 of 7 read." For a 10-day-SLA product whose analysis runs hours, silence reads as "nothing is happening" — the #1 driver of where-is-it support mail.

**What ships now** (all client-side; the `screen.completed` / `doc.ocr_done` events and the SSE outbox channel already carried everything needed):

1. **A "what's happening right now" panel** during the active stage, in plain words, so even a cold page load mid-analysis explains itself: reading every page, running the six named checks, then double-checking every quote against the record before anything is shown.
2. **A live activity feed**: each `screen.completed` event appends "✓ Finished checking — {plain-language name}" (e.g. *how well the defense lawyer did their job*, *evidence the State may not have turned over*), with a "check X of 6" counter; `doc.ocr_done` streams page counts during digitization.
3. **Honesty rule kept:** finding **counts are deliberately not shown pre-QA** (§5.6's zero-legal-content-pre-QA rule) — raw screen output shrinks under grounding/verification, and a number shown here that shrinks later is a broken promise. Completed *checks* are facts; counts wait for the report.

## 2b. Round 4 — proof of life and "safe to leave" (2026-09-06, PO request)

A 2 GB, 95-document record (Brian) sat on the status page with nothing changing and the PO's verdict was "seems to have locked up." Two root causes, both on the page rather than in the pipeline:

| # | Finding | Decision |
|---|---|---|
| F15 | **The live stream is silent between events.** During analysis each check reads the whole record before its one `screen.completed` event — on a large record that is tens of minutes of nothing; the SSE heartbeat is a comment the page never shows. | The checklist facts are now **polled every 20s as a floor** under the stream, and the server returns the case's newest event (`lastActivityAt`, `lastActivityType`). The page always shows **"Still working — 4 minutes ago it finished reading a document"** in the family's words (a small plain-language map from event type → phrase lives in `lib/tracker.ts`). A live event updates that line instantly. |
| F16 | **Nobody told the family they could leave.** The page implied watching was required, and never said an email with a link was coming — though the pipeline has always sent one at report-ready (and at records-complete and quality-hold). | A "**You don't need to stay on this page**" panel, shown whenever the run is active: a full review can take hours for a large record; it is safe to close the page; **we'll email `<their address>` with a link** the moment the report is ready, and again if anything needs their attention. |
| F17 | Digitizing facts hid behind the last live detail; analysis showed nothing until the first check finished. | Running totals ("N pages read so far, across X of Y documents") always show while digitizing; analysis reads "Check 1 of 6 in progress" from the start, then "2 of 6 finished · check 3 in progress." |

Not done (tracked): a per-volume event **inside** a check (the registry would gain an `analysis.progress` type) so the analyzing stage moves between checks too; an honest "this is taking longer than usual" line keyed to the record's size rather than a fixed SLA; and an instance-size review — the api runs on a 512 MB starter, which is the real ceiling for a 2 GB record.

## 3. Round 2 — density & phase separation (2026-09-01, PO request)

The checklist needs *many* documents; round 1 left each as a padded card (~80px × 12 items) and mixed the "collect documents" work with the "run the review" decision. Because **every analysis run is charged** (one included, $99 after), collect-vs-run is not presentation — it's a billing boundary the layout must teach.

| # | Finding | Disposition |
|---|---|---|
| F10 | **Card-per-item checklist burns the screen** — a phone shows ~4 items per viewport; scanning "what's left" takes scrolling, not a glance. | Fixed: dense single-line rows, split into two groups — **"Still needed (N)"** open at top (each row expands for the how-to + upload link) and **"Received (M)"** collapsed to one line. What's left IS the visible list. |
| F11 | **No phase model.** Upload actions and the run-the-review decision interleaved on one flat page, though families iterate uploads for weeks before the one charged run. | Fixed: explicit two-step frame — **Step 1 · Collect & upload** (everything upload-related) and **Step 2 · Run your review** (its own card at the end, visually distinct, disabled-feeling until files exist). |
| F12 | The "still missing" nudge **duplicated the checklist** right below it. | Fixed: merged — the Still-needed group's header carries the guidance (≤2 gaps → single files; 3+ → another ZIP). One list, one truth. |
| F13 | Add-zone copy restated what the picker already communicates. | Fixed: two lines + the collapsed ZIP explainer. |
| F14 | **The cost consequence lived only inside the confirm modal** — the $99-per-later-run fact arrived at the last click instead of shaping the iterate-then-run behavior. | Fixed: the Step 2 card states it always: "Your purchase includes one analysis run… a later run with new documents costs $99. Take your time — uploading more documents never costs anything." The modal remains the final gate when items are missing. |

## 4. Round 3 — the "quick check" audited (2026-09-01, PO question)

The PO asked what the echo-back quick check actually accomplishes. Honest answer: it delegated quality control of a crude regex classifier to the person least equipped to audit legal document types — most users tap "That's right" to dismiss it, producing noise, not signal. **Shipped fix (option 1): the Tier-1 model classifier** (Haiku, ~fraction of a cent per document, cost-recorded) replaces the regex as the primary classifier with a confidence policy:

- **high** → filed silently; the item checks off and no card ever shows
- **medium** → the old contract: suggestion + confirm/correct card
- **low / no match** → no suggestion at all (a wrong guess is worse than none)

Any model failure (no key, network, unparseable output) falls back to the regex at medium confidence — the pipeline never depends on the model being up, and tests stay hermetic (no injected classifier = regex only). Env knobs: `DOC_CLASSIFIER_MODEL` (default claude-haiku-4-5), `DOC_CLASSIFIER_USD_FACTOR` (Haiku-vs-analysis-model price ratio for the cost estimate, default 0.2). Deferred from that discussion: the "I don't know / none of these" option in the correction picker.

## 5. Out of scope, tracked

F8/F9 above; Spanish for both surfaces (the recorded i18n P1 gap); replaying missed activity-feed lines on reconnect (needs a customer-safe events endpoint — today a mid-analysis page load gets the panel, new lines from the next event on).
