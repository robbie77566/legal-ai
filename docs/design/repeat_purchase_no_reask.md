# Repeat purchase — never ask twice (PO, 2026-09-12)

**Ask:** "When re-running it should not prompt for the case information again if we already have it on file."

Two situations, one rule:

| Situation | What happens |
|---|---|
| **Paid re-run ($99)** on a finished case | Reopens the *same* case for documents (`/case/:id/documents?rerun=1`). Facts and checklist stay; the interview is never shown. (Unchanged.) |
| **Second full purchase** on the same account | A new case is created. At fulfillment (`payments.service` → `case-setup.service`), the buyer's most recent other case supplies **county, conviction year, trial days and judgment date** wherever the free check did not; the free check supplies the shaping answers (trial/plea, appeal, prior writ, custody). When nothing is left to ask, the **checklist is seeded right there** and an `interview.completed` event is written by `system`. The success page then says *"we used the details already on file — nothing to answer again"* and continues to **Documents**, not the interview. |

Everything carried over is labelled: `facts.source.carriedFromCaseId`, and the documents page's *About this case* block says "County, year and dates were carried over from your earlier review — Not the same case? Change the details" (the interview stays reachable and rewrites the un-started checklist). A different person's case on the same account is therefore one click away from correction, never a silent mistake.

`GET /checkout/fulfillment` (and the free promo path's `url`) return `interviewNeeded`; the interview is still needed when the lane, county, year or appeal answer is unknown — a first purchase, or a free check that skipped a question.

Tests: `fulfillment-heal.integration` (repeat buyer: carried facts, seeded checklist, event, poll says no interview), `BuySuccess` (documents link), `DocumentsPage` (carried-over note).
