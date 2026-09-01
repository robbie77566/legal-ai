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

---

# Second record — Brian (Brazoria 78734, 1,013 pp., 8 RR volumes)

**Champion:** claude-opus-5 run `cmtg2ac23000cr20ttisswbmt` · **Challenger:** claude-fable-5 · 2026-08-30

| | Opus 5 | Fable 5 |
|---|---|---|
| Grounded findings | 10 | 15 |
| Dispositive / supportive / background | 0 / 8 / 2 | 0 / 11 / 4 |
| Dropped by grounding filter | 9 | 5 |

**The Gary pattern replicates.** Fable finds ~50% more (here: same-counsel-on-appeal conflict, a § 9.32(b) presumption-instruction issue, an undisclosed APD video placed on the record, the sentencing court misstating the statutory range); Opus is more selective. **Both** models independently assessed this case as supportive-only (zero dispositive) — a meaningfully different profile from Gary — and both converged on the strongest single issue: the oral pronouncement imposed 60 years but not the jury's $5,000 fine (judgment-variance/reformation), the run's only exact-quote overlap.

**Cross-record read:** on two records the models' *portfolio judgments* agree (which case is strong, which issue leads) while coverage differs — supporting a recall-first single-engine + QA posture now, and making cross-model adjudication (M4 remainder) look valuable mostly as a coverage union, not a disagreement arbiter. Brian's higher Opus grounding-drop rate (9/19 vs Gary's 5/27) is flagged for investigation: his line-break-heavy formatting may be defeating verbatim matching on real quotes — candidate fix is whitespace-normalized grounding comparison (hash anchors unchanged).

*Note:* this record also exercised the parser hardening end to end — the run only succeeded after the control-character escape fix (`c153d12`); the live salvage path dropped exactly one malformed finding while keeping its siblings.

---

# Local-model (Ollama) canary evaluation — 2026-09-01

**Question:** can local models cut analysis COGS? **Setup:** llama3.2:3b and llama3.1:8b (Ollama, 8GB laptop GPU) vs claude-opus-5 as control, all on the IDENTICAL 29-chunk / ~7.8k-token Brian voir-dire window containing the Willetts canary (disclosure p30 + seating p140-141), same screen instruction, same grounding filter.

| Model | Time | Grounded findings | Willetts |
|---|---|---|---|
| llama3.2:3b | 40s | 0 (2 ungrounded + 3 malformed) | no |
| llama3.1:8b | 56s | 0 (truncated; all 5 salvaged findings ungrounded) | no |
| claude-opus-5 | 79s | 7 (0 dropped) | **YES, dispositive 0.72** (incl. the excusal-list cross-reference) |

**Verdict:** local models produced ZERO findings surviving FR-6 verbatim grounding even on a hand-picked small window — their quotes paraphrase or fabricate, which the trust architecture rightly rejects. They also cannot hold real records (280k–700k tokens). Economics were the ceiling anyway: measured analysis COGS is $1.75–4.50/case (~1% of price, batch+cache already captured), so the maximum theoretical saving is ~$50–140/mo at base volumes against material quality risk on a one-shot legal product. **Recommendation: no local models on the analysis path; revisit only for auxiliary tasks (classification/embeddings) if ever needed.** Harness: session scratchpad `ollama-compare.ts` (executeScreen seam — rerunnable against any future model in minutes).

**Addendum (2026-09-01, zero-spend rerun):** re-scored against the PERSISTED Opus findings as control (no API calls). llama3.1:8b showed a real flicker on the 14k-token voir-dire window — 3 grounded findings including the Willetts canary (~1/3 of control's in-window coverage, 50s local) — correcting the earlier "zero grounded" absolute; but it grounded nothing on the sentencing window and missed that canary, and llama3.2:3b grounded nothing anywhere. Aggregate: 3/15 control findings, 1/2 canaries, and the full-record capacity impossibility stands. Verdict unchanged: not on the analysis path. Harness: `ollama-vs-persisted.ts` (persisted-control pattern — the correct zero-cost way to test any future local model).
