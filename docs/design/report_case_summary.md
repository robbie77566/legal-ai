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

## The bottom line (PO, 2026-09-12)

Right after "What we found": a headline and two or three short paragraphs answering the question a family actually has — *is this worth my time and money with a lawyer?* It is **deterministic**, computed from the visible findings and the posture (`case-lifecycle/bottom-line.ts`), so the PDF, the report page, and the attorney packet's one-line "Posture" never disagree, and no model ever writes it.

| Tier | When | Headline |
|---|---|---|
| strong | ≥1 dispositive finding | There is a real reason to talk to a lawyer. |
| consult | supportive findings only | Worth a consultation — nothing here stands alone yet. |
| limited | nothing dispositive or supportive | This review did not find a path in the record itself. |

Modifiers add a paragraph: the §4 subsequent-writ bar; an estimated-expired federal window; a running clock (≤180 days or laches urgency). The ROI framing is qualitative — "a first consultation costs a small fraction of a full writ; this report is built to make that hour count" — no dollar figures. Every version ends with the not-legal-advice sentence, and the unit test forbids "you should file", "we recommend filing", "will win", "guarantee". **This wording is in the counsel review queue** (UPL): it is the closest the product comes to an opinion.

## Not done

QA editing of a summary line (today a reviewer can only remove findings); a cause-number lookup against the county clerk; Spanish for the labels (the report is English-only today).
