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
| F9 | No upload progress % for large files on slow connections (fetch PUT has no progress events) | Low | **Deferred** — needs XHR/tus swap; revisit if support tickets show it |

## 2. Analysis-progress feedback (status page)

**Problem:** during ANALYZING the tracker showed a breathing dot and, at best, "Volume 3 of 7 read." For a 10-day-SLA product whose analysis runs hours, silence reads as "nothing is happening" — the #1 driver of where-is-it support mail.

**What ships now** (all client-side; the `screen.completed` / `doc.ocr_done` events and the SSE outbox channel already carried everything needed):

1. **A "what's happening right now" panel** during the active stage, in plain words, so even a cold page load mid-analysis explains itself: reading every page, running the six named checks, then double-checking every quote against the record before anything is shown.
2. **A live activity feed**: each `screen.completed` event appends "✓ Finished checking — {plain-language name}" (e.g. *how well the defense lawyer did their job*, *evidence the State may not have turned over*), with a "check X of 6" counter; `doc.ocr_done` streams page counts during digitization.
3. **Honesty rule kept:** finding **counts are deliberately not shown pre-QA** (§5.6's zero-legal-content-pre-QA rule) — raw screen output shrinks under grounding/verification, and a number shown here that shrinks later is a broken promise. Completed *checks* are facts; counts wait for the report.

## 3. Out of scope, tracked

F8/F9 above; Spanish for both surfaces (the recorded i18n P1 gap); replaying missed activity-feed lines on reconnect (needs a customer-safe events endpoint — today a mid-analysis page load gets the panel, new lines from the next event on).
