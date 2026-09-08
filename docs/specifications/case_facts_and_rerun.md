# Case facts and the re-run (as built, 2026-09-08)

Source: [Customer Journey UX Review](https://claude.ai/code/artifact/c658996c-3134-4780-8c39-89d78da0cbcb) — the five P0s.

## Case facts — ask once, show back

- `Case.facts` (JSON) holds what the family told us. Schema and helpers: `packages/case-lifecycle/facts.ts` (`CaseFactsSchema`, `factsFromCheckAnswers`, `vehicleForCustody`, `describeFacts`).
- **At purchase** (`payments.service.fulfillCheckoutSession`): the free-check draft's answers are copied into `facts` *before* the draft is deleted, and `vehicle` is derived from custody (probation → Art. 11.072; the old code hardcoded 11.07).
- **Interview** (`POST /cases/:id/interview`): merges county, conviction year, trial days, judgment date into `facts`; `hadAppeal` is optional and only sent when the check didn't answer it. `judgmentDate` also lands in `deadlineFacts`, which is what makes the report's time-limits section render.
- **Read-back**: `GET /cases/:id/checklist` returns `facts`, `factLines` (label/value/derived/shapesReview — the same lines Support could show), and `rerun`.
- **UI**: the interview prefills, shows "From your free check", hides the appeal question when known, and is titled "Confirm the details" on a return visit. The documents page has an "About this case" panel with "Not right? Change the details" while awaiting documents, and a lock note afterwards.
- Existing cases have `facts = null`; the panel falls back to case columns (lane, vehicle, subsequentWrit, county, year) and shows nothing it doesn't know.

## Re-run (US-6)

- A `RERUN` payment on a `READY` or `DELIVERED` case appends `rerun.purchased` **with a transition to `AWAITING_DOCS`** (`machine.ts` gained `READY → AWAITING_DOCS`, `DELIVERED → AWAITING_DOCS`). Facts, checklist items and documents stay. The family is emailed `sendRerunPurchased` with the documents link.
- Stripe's `success_url` for a re-run is `/case/:id/documents?rerun=1`. The documents page shows a re-run banner ("Your report from … still stands") and relabels the run buttons; `records-complete` works again and the pipeline runs as run 2 → QA → Report v2. v1 remains (reports are versioned).
- Mid-pipeline re-run purchases only record the payment (no transition).
- Still open: report version switcher and "what changed since v1" on the customer report (P1).

## Success page

`GET /checkout/fulfillment?session_id=` (owner-only) returns `{ caseId, kind }` once fulfilled, `404 { pending: true }` before. `/buy/success` polls it, so a family with several reviews always lands on the case the payment created.

## Links added

Report → next steps ("Send your lawyer a secure link"); report not-ready → tracker; tracker delivered → report.

## Tests

`apps/api/tests/facts.integration.test.ts` (facts survive purchase, 11.072, interview merge, checklist read-back, re-run reopen + records-complete), `apps/web/tests/unit/BuySuccess.test.tsx`, `InterviewPage.test.tsx`, and a re-run case in `DocumentsPage.test.tsx`.
