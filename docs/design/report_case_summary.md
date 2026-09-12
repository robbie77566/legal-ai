# Report header — "About this case"

**Date:** 2026-09-12 · **Ask (PO):** a quick summary of the trial at the top of every report — person, county, dates, offense, verdict, appeals and writs.

## What it shows

Twelve lines in a fixed order: Person · County · Court · Cause number · Offense · Date of the offense · Trial dates · Verdict · Sentence · Judgment date · Direct appeal · Prior writs.

Each line is one of three things, and says which:

| Line reads | Source | How it got there |
|---|---|---|
| `GARY W. DOE (RR1 p. 3)` | the record | extracted by the model, **quote re-checked verbatim** against the record chunks (the same grounding rule as a finding); the page shown is the page the quote came from |
| `Brazoria County — as your family told us` | intake answers | county, conviction year, trial-or-plea, appeal, prior writ — only when the record did not state it |
| `not stated in the record` | — | nothing grounded, nothing told |

Nothing is inferred. A fact whose quote does not ground is dropped, logged, and the line falls back or reads "not stated" — a wrong name or date on a family's report is worse than a blank.

## Where

The customer PDF (after the cover, before "What we found"), the report page, the staff PDF, and the shared attorney packet all render the same rows. The rows come from `AnalysisRun.summary` for the run that produced the report version, so an older version keeps the summary it was built with; family fallbacks are read live from the case.

## How it is made

`buildCaseSummary` in `analysis.service.ts`: one model call on the cached record prefix (a cache read, ~no extra cost), a strict zod schema (`case-lifecycle/summary.ts`), per-fact grounding with `quoteGrounds`, persisted on the run in its own short transaction. Runs before the screens; never a gate — any failure yields no summary and the run proceeds.

## Not done

QA editing of a summary line (today a reviewer can only remove findings); a cause-number lookup against the county clerk; Spanish for the labels (the report is English-only today).
