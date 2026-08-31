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
