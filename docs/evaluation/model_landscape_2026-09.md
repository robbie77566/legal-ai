# Model landscape review — can anything cheaper or faster match Fable on this workload?

**Date:** 2026-09-11 · **Question (PO):** as an LLM researcher, survey current models including free ones, find the most accurate relative to Fable, and reduce cost and turnaround. · **Method:** the repo's own measurements (token profile, cost records, the two head-to-head comparisons, the local-model trial) plus primary-source pricing and data-use terms, plus the two public benchmarks that resemble this job. Desk research only; no model was run for this review. Recommendations end in an experiment, not a switch.

## 1. What this workload actually is (the constraints any candidate must meet)

| Constraint | Measured / required | Why it eliminates candidates |
|---|---|---|
| **Record size per call** | Gary: ~696k tokens per screen call (Opus tokenizer); dev records 155k–285k chars-estimated, 280k–700k tokens real | Anything under a usable 1M window is out (Haiku 4.5 at 200k; GPT-5.5/5.4 at 272k; anything "128k") |
| **Verbatim grounding (FR-6)** | Every finding must carry an exact quote re-checked against the record; non-verbatim quotes are dropped before QA | Models that paraphrase produce zero surviving findings — measured: llama 3.1/3.2 produced **0** grounded findings on a hand-picked 7.8k-token window |
| **Recall over precision** | The first writ is effectively the only writ; a human QA step filters. PO decision 2026-09-11: recall over cost | Selective/decisive models score worse on the product's own objective even when "more accurate" per finding |
| **Legal reasoning** | Six screens a Texas post-conviction lawyer would run; issue-spotting across 1,000+ pages | Public proxy: LegalBench (Vals AI) |
| **Data handling** | Court records of named defendants; the disclosures promise no training on their documents | Any tier that trains on inputs or allows human review is **disqualified**; first-party APIs hosted outside the US need a residency decision |
| **Refusals** | Fable/Opus can decline a request (`stop_reason: refusal`); the worker handles it with server-side fallbacks live and empty-sample salvage in batch | Providers without an equivalent need a retry design |

## 2. What the cost is made of (the finding that matters most)

The recorded Gary run on Opus 5 (batch, 10 calls, 2026-08-30): 11k uncached input, **4.87M cache-write**, 2.09M cache-read, 126k output — **$17.34**. Cache writes cost 4× more than reads and dominated the bill because parallel batch items raced the prompt cache (the runbook's known caveat). A cache-efficient run (record written once per screen sequence, read nine times) costs a third as much on the same model. The projection reproduces the recorded $17.34 exactly, so the numbers below are trustworthy.

**Projected analysis cost per Gary-sized case** (six screens × two samples; Fable output ≈ 3× Opus per the head-to-head; batch = 50% where offered):

| Model | Price in / cache-read / out ($/MTok) | As measured (batch, cache race) | Cache-efficient, batch | Cache-efficient, live |
|---|---|---|---|---|
| **Fable 5.1** (current) | 10 / 0.25 / 50 | $40 | **$15** | $29 |
| Opus 5 | 5 / 0.50 / 25 | $17 (recorded) | $5 | $11 |
| Sonnet 5 | 2 / 0.20 / 10 | $7 | **$2** | $4 |
| GPT-5.6 Sol (promo to Nov 21) | 4 / 0.40 / 20 | $11 | $4 | $8 |
| Gemini 3.1 Pro (>200k tier) | 4 / 0.40 / 18 | $11 | $4 | $8 |
| DeepSeek V4 Pro (first-party API, off-peak) | 0.66 / 0.022 / 1.98 | $3.5 | $0.9 | $0.9 |
| Kimi K3 (hosted open weight, no cache) | 3 / – / 15 | $23 | $23 | $23 |

Two conclusions before any model changes: (1) **Fable's own cache-read price ($0.25, a quarter of Opus's) makes a cache-efficient pipeline worth 2.7× on Fable** — from $40 to $15 a case; (2) at 4–5% of a $299 price the analysis is not the cost problem people assume, and no model switch can save more than about $13 a case.

In production today, records over `ANALYSIS_BATCH_MAX_RECORD_TOKENS` (400k) already run live-sequential where caching is certain; Gary at 696k does. Records under 400k still take the batch path with the cache race.

## 3. Accuracy evidence

**LegalBench (Vals AI, mirrored snapshot 2026-09-10, 143 models):** Fable 5 88.56 · Fable 5.1 88.51 · Gemini 3.1 Pro 87.40 · Gemini 3.7 Flash 87.26 · Opus 5 86.97 · GPT-5.6 Sol 86.97 · MiniMax M3 (open weight) 85.42 · **Sonnet 5 83.92** · Qwen3.8 Max 83.61 · DeepSeek V4 Pro 82.36 · Sonnet 4.6 82.12 · Haiku 4.5 81.24 · Llama 4 Maverick 77.81 · DeepSeek V4 Flash 77.71. Human lawyers are cited at ~71 on the same tasks. Fable is the top of the board; the gap to Sonnet 5 is 4.6 points; to Gemini 3.1 Pro 1.1.

**Long-context reliability (MRCR v2 8-needle, the hardest published retrieval test):** at 1M tokens, Opus 4.6 76.0 · Sonnet 4.6 65.8 · GPT-5.4 36.6 · Gemini 3 Pro 24.5 · Gemini 2.5 Pro 16.4 (March 2026 report); on the September MRCR-1M mirror, DeepSeek V4 Pro 83.5 and V4 Flash 78.7 lead, Gemini 3.5 Flash 26.6; Fable 5.1, Opus 5, Sonnet 5, Gemini 3.1 Pro and GPT-5.6 are not yet listed. Reading: **Gemini and GPT lineages degrade sharply past 256k; Claude and DeepSeek hold.** A 700k-token record is exactly where that matters.

**Faithfulness (Vectara HHEM, May 2026):** the top of that board is small models summarising short documents (finix 1.8%, gpt-5.4-nano 3.1%, gemini-2.5-flash-lite 3.3%). It measures the wrong thing for us — our FR-6 filter *is* the faithfulness test, and it measured **Fable 1 dropped quote vs Opus 5** on Gary. Not a decision input.

**The repo's own head-to-heads (Gary and Brian, identical prompts/chunks/filter):** Fable found ~50% more issues than Opus with more verbatim quotes; Opus made more decisive severity calls. The attorney-adjudicated ledger is still the only way to know which extra findings are correct.

## 4. Free and open models, honestly

- **Free API tiers are disqualified**, not merely inferior: Gemini's unpaid tier "uses the content you submit … to provide, improve, and develop Google products" and "human reviewers may read, annotate, and process your API input and output." That cannot be sent a family's court record. OpenAI's API does not train by default (paid), retains 30 days for abuse monitoring, zero retention by approval only. Anthropic's commercial API does not train on inputs; note Fable 5.1 itself requires 30-day retention (no zero-retention option).
- **Local/small open weights** were tried (llama 3.1 8B, 3.2 3B): zero findings survived grounding, and they cannot hold real records. Closed.
- **Frontier open weights** now exist with 1M context: DeepSeek V4 Pro (the best MRCR-1M score published, LegalBench 82.4, ~$1/case), Kimi K3 (LegalBench 86.0, $3/$15 hosted), MiniMax M3 (LegalBench 85.4), Qwen3.8 Max (83.6). The **first-party DeepSeek API is served from China**; for US court records that is a data-residency decision the disclosures do not currently cover, so it would have to be a US-hosted deployment (Together/Fireworks/Bedrock) under that host's no-training terms, at higher prices than the first-party figures above. None has been run through FR-6; the local-model result says do not assume grounding survives.

## 5. Speed

Turnaround is set by the pipeline shape more than the model. Measured in dev on Gary: live-sequential Opus run **5 minutes** (17:00→17:05); batch run **20 minutes**; production's batch budget allows up to 4 hours per stage before falling back live. Fable writes ~3× the output per call, so each call is longer. Levers, in order: (1) live instead of batch for records where the cache is certain (cost ×2, time ÷4 or better); (2) a faster model — Sonnet 5 generates faster than Opus/Fable; (3) fewer samples (`ANALYSIS_SAMPLES=1`, halves everything, trades recall — the recall-tuned default is 2).

## 6. Recommendation

1. **Do not switch models to save money yet.** Fix the token profile first: make every record take the cache-efficient path (lower the batch gate, or serialise batch items so the cache is written once). On Fable that is $40 → $15 a case with zero quality risk. This is a config/code change, not a model decision.
2. **Run one real comparison before believing any leaderboard: Sonnet 5.** Same vendor, same data terms, same 1M window, same refusal semantics, one-fifth the price. `compare-models.ts <garyCaseId> claude-sonnet-5` on the executeScreen seam, then score against `ledgers/gary.json` and `ledgers/brian.json`. Decision rule: recall ≥ Fable's on the ledger **and** FR-6 drop ratio ≤ Fable's. Cost of the experiment ≈ $5–10.
3. **Second candidate if a non-Anthropic engine is wanted: Gemini 3.1 Pro on the paid tier** (LegalBench within 1.1 of Fable; 2M window) — but its lineage collapses on MRCR past 256k, so it must be tested on the 700k Gary record specifically, not a small window. Needs a Google Cloud key and a data-terms check.
4. **DeepSeek V4 Pro only as a US-hosted deployment**, and only after the grounding test; the numbers are attractive, the residency and grounding are unproven.
5. **Free tiers: never**, for this data.

The union mode already in the code (`ANALYSIS_ENGINES=claude-fable-5-1,claude-sonnet-5`) is the cheap way to get a second engine's recall if Sonnet proves close: Fable's findings plus Sonnet's for about $2 more per case.

## Sources

Anthropic pricing (platform.claude.com/docs/en/about-claude/pricing, fetched 2026-09-11); OpenAI pricing (developers.openai.com/api/docs/pricing) and data policy (developers.openai.com/api/docs/guides/your-data); Gemini pricing (ai.google.dev/gemini-api/docs/pricing) and terms (ai.google.dev/gemini-api/terms); DeepSeek pricing (api-docs.deepseek.com/quick_start/pricing); LegalBench mirror of Vals AI (benchlm.ai/benchmarks/valslegalbench, snapshot 2026-09-10); MRCR-1M mirror (benchlm.ai/benchmarks/mrcr1m, 2026-09-10); long-context report (yage.ai, 2026-03-15); Vectara HHEM leaderboard (github.com/vectara/hallucination-leaderboard, 2026-05-11); OpenRouter "open weight models that matter" (June 2026). Aggregator prices for GPT-5.6 Sol's 1.05M context and Kimi K3 hosting were not confirmed on a primary page and are marked as such. In-repo: `model_comparison_gary.md`, `CostRecord` rows for case cmtfzvo5m000219djjmj3qe3i, `docs/operations/runbook.md` batch caveat.
