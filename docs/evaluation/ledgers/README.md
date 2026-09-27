# Attorney Eval Ledgers

One JSON per reference case: the ground truth the eval harness scores runs
against (model_evaluation.md §4; recall-first launch gate).

- `mustFind[]` — issues the engine MUST surface. Matching: every term in
  `allOf` (case-insensitive) must appear in a finding's partB/partA/category,
  and when `pageWindow` is given, at least one citation page must fall in it.
- `verdicts[]` — transcribed attorney packet responses (agree/partly/disagree)
  against a specific reviewed run; drives precision + severity calibration.
- `provenance` — who labeled it. `canary` entries were verified against the
  record by engineering pending attorney sign-off; the launch gate requires
  attorney-signed ledgers (plan §M4/M7).

## Running the gate without a developer box (2026-09-27)

The ops console runs the same scorer against the same ledgers. On a case's
page in `/ops/cases/<id>` (Ops administrators only):

1. **Run the analysis again** — on a finished (READY / DELIVERED) reference
   case, queues a fresh run on the prompt set and engine production is
   configured with. It walks the legal re-run path (→ AWAITING_DOCS →
   DOCS_COMPLETE) on the record already digitized; auto-QA releases a new
   report version and emails the account holder when it is ready, so use it
   on reference cases (Gary, Brian) or for a deliberate quality re-run.
   Progress shows on the pipeline card and on the family's status page.
2. **Score latest run** — pick the ledger, press the button: `EVAL GREEN` /
   `EVAL RED`, recall, found and missed canaries, and the run's identity
   (run number, engine, prompt set, prompt hash). The rule is unchanged:
   every canary found. The score is audit-logged.

API: `GET /ops/eval/ledgers`, `GET /ops/cases/:id/eval?ledger=gary`,
`POST /ops/cases/:id/reanalyze { reason: 'eval' | 'quality' }`. The CLI
(`scripts/eval-run.ts`) remains for developers.
