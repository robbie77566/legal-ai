# Model Evaluation Strategy: Recall-First, Ground-Truth Anchored

Manual runs of the two reference case files through Gemini and Claude produced **major output differences** on the same records. That divergence is expected on long-record legal analysis — different attention over ~2M tokens of transcript, different thresholds for flagging an issue — and it must be resolved with measurement, not anecdote. This doc defines the harness.

## 1. Reference corpus

| Case | Contents | Notes |
| :--- | :--- | :--- |
| **Gary** (`Test Case Files/Gary`) | 5 reporter's-record volumes (SANJAC-13893), ~268MB | Document-only case — exercises the core MVP path |
| **Brian Spinks** (`Test Case Files/Brian Spinks`) | 8 RR volumes (Brazoria-78734) + jail-call audio, interview video, photos, ~2GB | Documents evaluated now; A/V is out of MVP scope (confirms the launch-model deferral) and joins the eval when transcription ships |

## 2. Ground truth

For each case, a human reviewer (attorney or trained reviewer) produces a **findings ledger**: every genuine issue in the record, each with

- category (IAC / Brady / 11.073 / sentencing-time-credit / deadline posture / other),
- the supporting record cites (volume, page, line),
- a severity judgment (dispositive / supportive / background).

The ledger is the fixed answer key. It lives outside the pipeline (not derived from any model output) and is versioned alongside this doc.

## 3. Metrics — recall first

For a $299 family-tier viability report, the two error types are asymmetric:

- **A missed finding (false negative) is the product failing.** The family makes a no-go decision on wrong information, or a real claim dies unraised.
- **An extra flagged finding (false positive) is cheap.** The budgeted human QA pass (~30 min/case) reviews every report and filters it.

Therefore rank models by:

1. **Recall on the findings ledger** (primary; report per-category — a model strong on IAC but blind to Brady is not "close").
2. **Citation fidelity** — of the findings a model reports, what fraction cite real, correct volume/page locations. A right conclusion with a fabricated cite fails.
3. Precision (secondary — it sets QA workload, not product correctness).
4. Cost and latency per case (from the pipeline's own usage accounting).

## 4. Protocol

1. Run the full three-tier pipeline (`cost_optimization_ollama.md`) per candidate configuration — model swaps happen at the router config level, everything else held constant.
2. Score against the ledger blind (the scorer sees findings, not which model produced them).
3. Record per-category recall, citation fidelity, precision, tokens, and dollars in a results table committed next to the ledger.
4. The cross-model adjudication step is also scored: measure how often Gemini/Claude disagreement correlates with ledger errors — that calibrates how much weight the "consensus" flag deserves in the report.

## 5. Decision rules

- No change to the default routing ships unless it improves per-category recall or citation fidelity on the reference corpus without regressing the other.
- New reference cases are added as real (consented, redacted as required) records become available; two cases is a smoke test, not a benchmark — treat early numbers accordingly.
- When A/V transcription ships, the Spinks media becomes a second ledger (statements in jail calls that contradict trial testimony) and the same recall-first rules apply.
