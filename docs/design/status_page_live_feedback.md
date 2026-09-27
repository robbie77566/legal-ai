# Status page: live feedback on what the system is doing

*2026-09-27 · owner: engineering · scope: `/case/[caseId]/status`, the analysis and digitize workers, the checklist endpoint*

## The problem

A family on the status page watched a breathing dot and a line like "Check 1 of 6 in progress" for long stretches with nothing else moving. The silences were real gaps in what the system said about itself, not gaps in the work:

| Where the silence was | How long | Why nothing was said |
|---|---|---|
| Before the first check (context pre-pass, case summary) | minutes on a big record | no event existed for these phases; the page guessed "Check 1 of N" |
| Inside one live check (Fable 5.1 on a 500k-token record) | 15–20 min | `analysis.progress` is recorded once, before the call; nothing until `screen.completed` |
| The production batch path (`ANALYSIS_BATCH=1`) | up to hours | every check is submitted at once; no per-check event until the batch ends and results are processed together |
| A scanned volume in Textract | minutes | `doc.ocr_done` is the first event for a document |
| A cold page load mid-check | — | the "now checking" line only existed from a live stream event; a reload dropped back to "Check 1 of N" |

"Still working — 14 minutes ago it started one of the checks" was true and useless.

## Design

### Two classes of signal

**Facts** are `CaseEvent`s: durable, registry-validated (`packages/case-lifecycle/events.ts`), append-only, published by the transactional outbox, which remains the only publisher on `case-progress:{caseId}` (the M1 exit criterion still holds). Two facts were added, both additive:

- `analysis.phase` v1 `{ phase: 'context' | 'summary' | 'batch', screensTotal, requestsTotal? }` — the phases before the first check, so a cold load can name them.
- `doc.ocr_started` v1 `{ documentId }` — the start marker a scanned volume never had.

**Pulses** are liveness between facts: which step the worker is on, in which phase (`reading` the record, `writing` up what it found, `waiting` on a batch, `saving`), since when. They are not facts: not persisted, not in the registry, never replayed. `apps/api/src/services/progress-pulse.service.ts` publishes them on a separate channel, `case-pulse:{caseId}`, and mirrors the newest one to `case-pulse:{caseId}:last` with a five-minute TTL so a cold load can show the same line. The SSE route subscribes to both channels; the page tells them apart by `kind: 'pulse'`.

Pulses are throttled (four seconds apart unless something changed) and a silent step repeats its last pulse every fifteen seconds, so the "last signal" clock on the page reads in seconds even in the middle of a twenty-minute model call. Every pulse call is fire-and-forget and swallows failures: feedback never breaks paid model work, and a missing Redis means no pulses, nothing else.

### Where the pulses come from

- `analysis-model.ts`: `reading` when a live call starts; the first streamed token flips it to `writing`. On the batch path, each 30-second poll pulses `waiting` with the batch's own `request_counts` (passes returned so far out of submitted) and `saving` when results are being read.
- `analysis.service.ts`: a step per phase (`context`, `summary`, `batch`) and per check sample, each with a durable marker where one is needed. `runAnalysis` ends the case's step in a `finally`, so a crashed run cannot keep saying "reading the record" until the retry.
- `digitize.service.ts`: a `doc.ocr_started` fact and a step per document, keyed per document so two concurrent digitizations of one case coexist; the Textract poll loop pulses each iteration; the step ends when the document's transaction settles.

### What the page learns on a cold load

`GET /cases/:id/checklist` → `progressFacts` now also carries: `screensPlanned` (the lane's whole plan), `runEvents` (this run's analysis events projected to enums and counts — never `findingCount`), the derived `checks` / `nowChecking` / `phase`, `documentInProgress`, `recentActivity` (the last 30 customer-safe events), and `livePulse` (the mirrored pulse if under two minutes old). The derivation is pure and shared: `packages/case-lifecycle/progress.ts` (`analysisTimeline`, `typicalCheckMinutes`, `activityItem`, `runEventItem`) — the api uses it to build the facts, the page uses it to re-fold the timeline as live events arrive.

### What the page shows

`apps/web/lib/progress-feed.ts` is the pure model; the page renders from it.

- **Right now** — the worker's own account: "Check 4 of 7: sentencing problems, pass 1 of 2 · Now writing up what it found (6 min so far)". Batch: "All 7 checks are running at the same time. 5 of 14 passes have come back." Pre-check phases and the document being read have their own plain-words lines.
- **The whole plan of checks** — every planned check with its state: finished (with how long it took), running (how long so far), still to come. Before, only finished checks were listed.
- **Typical check time** — "On this record, finished checks have taken about 14 min each", the median of this run's finished checks. Measured, never promised.
- **Last signal** — seconds since the newest pulse or fact.
- **Taking longer than usual** — after a generous per-stage silence (digitizing 20 min, analyzing 45 min): what is true (the system retries on its own; an email follows if anything needs the family) and nothing more.
- **Everything the system has done so far** — a collapsible log of the durable events in plain words, newest first.

### Rules kept

- No finding counts before QA. `screen.completed` carries `findingCount`; neither the run-event projection nor the activity projection copies it, and the tests assert it.
- No legal content on the customer channel. Pulses carry step identity, phase, and timestamps only.
- The outbox is the only publisher on `case-progress`; pulses have their own channel.
- Every model call still runs outside any transaction; pulses add no database writes.

## Verification

- `packages/case-lifecycle/tests/progress.test.ts` — the timeline on the live and batch paths, the median, the projections, the registry.
- `apps/api/tests/progress-pulse.unit.test.ts` — publish and mirror, throttle and heartbeat, per-key steps, cold-load read with TTL, failure isolation.
- `apps/web/tests/unit/progress-feed.test.ts` and `StatusPage.test.tsx` — the model and the rendered page: cold load mid-check, live pulses, the batch wait, digitizing, the stall line, and the pre-existing contracts.
