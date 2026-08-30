# Model Comparison — Gary (602-page record, 4 TRIAL screens)

**Date:** 2026-08-30 · **Champion:** claude-opus-5 (persisted run `cmtfyttxy000qgzi8zcay7h87`) · **Challenger:** claude-fable-5 (live via `compare-models.ts`, identical prompts/chunks/grounding filter)

## Headline numbers

| | Opus 5 | Fable 5 |
|---|---|---|
| Grounded findings | 22 | 39 |
| Dispositive / supportive / background | 3 / 17 / 2 | 1 / 28 / 10 |
| Dropped by grounding filter | 5 | 1 |
| Output tokens (4 screens) | ~15.3k | ~46k |

Verbatim-quote overlap was 0 — the models cite different spans of the same events, so exact-quote matching is a weak convergence metric. Substantive (issue-level) comparison below is the meaningful one.

## Convergent core (both models, independently)

Both surfaced every load-bearing issue: the preserved double-jeopardy / lesser-included objection (indecency vs. sexual assault counts), the surrogate DNA analyst Confrontation Clause objection (Solis testifying to Patnaik's bench work), unqualified cell-site testimony (Sheikh, self-conceded non-expert, consumer-grade "Batchego.com" plotting), the 1986 pen-packet identity linkage underpinning the § 12.42(c)(2) automatic-life enhancement (Goodwin's declined fingerprint comparison), the unidentified-caller recantation lead (903-452-4609), the Burke Center counseling records, the improper "same subpoena power" jury argument, and the consecutive-life cumulation order.

## Divergences

- **Fable is broader and more granular** (+17 findings), adding: never-analyzed trace evidence from the complainant's underwear, the empty vulvar-swab envelope, undisclosed SANE SDFI photographs, ~20 pages of raw AT&T data described but apparently not produced, the CDR timeline's conflict with McDonald's surveillance video, the prosecutor converting likelihood ratios to categorical source attribution ("1 in 16.8 septillion"), facial-recognition-based suspect development, and several improper-argument variants.
- **Opus is more selective and more decisive**: 3 dispositive calls (double jeopardy, cumulation, § 12.42(c)(2) + fine) vs. Fable's 1 (the fine). Fable rates the same sentencing issues supportive/background.
- **Grounding discipline**: Fable had 1 filter drop vs. Opus's 5 — Fable's quotes were more reliably verbatim.
- **Cost/verbosity**: Fable produced ~3× the output tokens and initially overflowed the 16k `max_tokens` cap (now 32k, with truncated-array salvage) — findings b30bbfe/65f29d1.

## Calibration caveat

Differences are differences, not correctness. Which model's severity calls and extra findings are *right* requires the attorney-adjudicated eval ledger (M4 remainder). On this single record: Fable looks better for recall (QA-reviewed pipeline where a human filters), Opus for precision/decisiveness (fewer, harder calls). Full machine-readable diff: `compare_claude-fable-5_1788105664619.json`.
