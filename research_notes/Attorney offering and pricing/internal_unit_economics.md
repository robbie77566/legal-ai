# Snot Nose Legal — internal unit economics and existing business case (repo-only reconstruction, 2026-10-18)

Scope: cost per record review under the production configuration in `render.yaml` (commit cba356e, 2026-09-27) and the analysis code (commit ddb2e03, 2026-09-27), the live price list, the assumptions in the business-case documents, and contribution margins at candidate attorney price points. Every figure is cited to a repo path and line. Figures I computed are labelled **[computed]** with the formula; inputs I had to assume are labelled **[assumption]**. All paths are relative to `/home/user/legal-ai/`.

Conventions used throughout: Fable 5.1 list price $10/MTok input, $50/MTok output ([render.yaml L89-92](render.yaml)); cache read 0.025× input = $0.25/MTok ([render.yaml L95-96](render.yaml)); 5-minute cache write 1.25× input = $12.50/MTok ([apps/api/src/services/costs.service.ts L9, L31](apps/api/src/services/costs.service.ts)); 1-hour cache write 2× input = $20/MTok ([apps/api/src/services/analysis-model.ts L140](apps/api/src/services/analysis-model.ts)); Message Batches 0.5× ([analysis-model.ts L192](apps/api/src/services/analysis-model.ts)); 2.3 chars/token ([apps/api/src/services/analysis.service.ts L699-702](apps/api/src/services/analysis.service.ts)); Textract $1.50 per 1,000 pages ([render.yaml L99-100](render.yaml)); Stripe 2.9% + $0.30 ([docs/operations/external_services.md L24](docs/operations/external_services.md)).

---

## 1. What one record review actually costs the engine under production settings

### Takeaway
Under the shipped configuration (Fable 5.1, prompt set v2 = 7 TRIAL screens × 2 samples, context pre-pass + case-summary call, 1h cache pre-warm, batch below 400k tokens / live-sequential above) the engine cost per record is roughly **$7.5–11 at 150k tokens, $16–20 at 400k, $16–23 at 700k** [computed], with an upside tail to ~$56 at 700k if Fable fills the 32k output cap on every call. The repo's own figure of "$5–15 per case" (2026-09-11) was built for six screens, not seven, and the eval gate has still not been re-run on Fable 5.1, so no post-switch, post-v2 production CostRecord figure exists in the repo.

### Cited Findings

**Production configuration (what runs today)**
- Engine `ANALYSIS_MODEL=claude-fable-5-1` ("PO decision 2026-09-11 — recall over cost") — [render.yaml L73-76](render.yaml)
- `ANALYSIS_PROMPT_SET=v2` ("PO go-ahead 2026-09-27"), `ANALYSIS_SAMPLES=2`, `ANALYSIS_BATCH=1`, `ANALYSIS_BATCH_MAX_RECORD_TOKENS=400000` — [render.yaml L77-87](render.yaml)
- Cost-telemetry rates `MODEL_USD_PER_MTOK_IN=10`, `MODEL_USD_PER_MTOK_OUT=50`, `DOC_CLASSIFIER_USD_FACTOR=0.1`, `MODEL_CACHE_READ_MULT=0.025` ("Fable 5.1 cache hits are 0.025× base (Opus/Sonnet: 0.1)"), `ANALYSIS_CACHE_PREWARM=1` ("1-token live request writes the record to a 1h cache before each batch") — [render.yaml L88-98](render.yaml)
- `SCREENS_BY_LANE_V2.TRIAL = ['preserved_error','iac','brady','junk_science','sentencing','voir_dire','identification']` — **seven** TRIAL screens; PLEA lane = `['plea_lane','sentencing']` (two) — [analysis.service.ts L102-105](apps/api/src/services/analysis.service.ts). v1 had five TRIAL screens — [analysis.service.ts L87-90](apps/api/src/services/analysis.service.ts)
- Samples clamp: `Math.min(3, Math.max(1, ANALYSIS_SAMPLES))`; batch request count = `screensTotal * samples` — [analysis.service.ts L688, L714](apps/api/src/services/analysis.service.ts). So a TRIAL run = 7 × 2 = **14 screen calls** [computed].
- Two extra model calls precede the screens on every run: a context pre-pass ("one cached-read call", instruction asks for ≤~150 words) and a case-summary call — [analysis.service.ts L123-135, L663-676](apps/api/src/services/analysis.service.ts); both go through `model.invoke` = the **live** path ([analysis.service.ts L529, L552](apps/api/src/services/analysis.service.ts); [analysis-model.ts L232](apps/api/src/services/analysis-model.ts))
- The whole record is one cached text block: `buildRecord` concatenates every chunk as `[Excerpt i | file p.N] …` — [analysis.service.ts L289-296](apps/api/src/services/analysis.service.ts); the per-screen instruction after the cache breakpoint is small (context header ≤2,000 chars, screen prompt, a list of ≤60 anchor indices, output spec) — [analysis.service.ts L354-356, L384-394](apps/api/src/services/analysis.service.ts); [analysis-request.ts L27-37](apps/api/src/services/analysis-request.ts)
- Live calls use the **5-minute** cache ("screens 2..n read") — [analysis-model.ts L36-38](apps/api/src/services/analysis-model.ts); batch items and the pre-warm use the **1-hour** cache; pre-warm is recorded at `usdFactor: 1.6` because "the 1h write is 2× base vs the estimator's 1.25× default" — [analysis-model.ts L128-141, L153](apps/api/src/services/analysis-model.ts); [analysis-request.ts L52-67](apps/api/src/services/analysis-request.ts)
- `max_tokens: 32000` per screen call ("Fable comparison hit 16k mid-array") — [analysis-model.ts L34](apps/api/src/services/analysis-model.ts)
- Batch gate rationale: "parallel batch items RACE the prompt cache — on a 695k-token record 7/10 items re-wrote the cache and the '50% price' run cost ~2× live-sequential. Below the threshold batch wins clearly (282k record: perfect hits, ~$1.75/run)" — [analysis.service.ts L693-697](apps/api/src/services/analysis.service.ts)
- Token density: "2.3 chars/token, MEASURED on real transcripts (Brian: 1.6M chars → 695,332 actual cached tokens)" — [analysis.service.ts L699-702](apps/api/src/services/analysis.service.ts)
- A single live screen call is described as "a 15–20 minute call" — [analysis.service.ts L768](apps/api/src/services/analysis.service.ts)

**Measured token and cost evidence in the repo**
- Recorded Gary run on Opus 5 (batch, 10 calls, 2026-08-30): 11k uncached input, 4.87M cache-write, 2.09M cache-read, **126k output**, **$17.34**; cache writes "dominated the bill" — [docs/evaluation/model_landscape_2026-09.md L18](docs/evaluation/model_landscape_2026-09.md)
- Output tokens, Gary, 4 screens, 1 sample: Opus 5 ~15.3k vs **Fable 5 ~46k** (≈11.5k per screen call) [computed 46k/4]; "Fable produced ~3× the output tokens and initially overflowed the 16k max_tokens cap (now 32k)" — [docs/evaluation/model_comparison_gary.md L12, L25](docs/evaluation/model_comparison_gary.md)
- Repo projection for a Gary-sized case on Fable 5.1 (six screens × two samples): **$40 as measured (cache race), $15 cache-efficient batch, $29 cache-efficient live**; Opus 5 $17/$5/$11; Sonnet 5 $7/$2/$4 — [model_landscape_2026-09.md L20-26](docs/evaluation/model_landscape_2026-09.md)
- Pre-warm cost model: "Fable $40 → ~$24 pre-warmed batch" per Gary-sized case — [analysis-request.ts L15](apps/api/src/services/analysis-request.ts); [docs/operations/environment_reference.md L53](docs/operations/environment_reference.md)
- PO decision note: Fable "~2× input and ~6× output cost versus Opus, i.e. roughly $5–15 per case — still under 5% of price" — [model_comparison_gary.md L69](docs/evaluation/model_comparison_gary.md)
- Instrumented Opus-era costs: Gary **$4.66 all-in** (model $3.75 + OCR $0.91, 602 pp scanned), Brian **$9.42** (born-digital, all model); "$1.75 Gary harness run" on batch — [docs/business_case/business_case_12mo.md L15, L65](docs/business_case/business_case_12mo.md); configuration at that time "6 screens, context pre-pass, 2-sample union" — [business_case_12mo.md L60](docs/business_case/business_case_12mo.md)
- "The production engine is now Fable 5.1 and the eval gate has not yet been re-run on it" — [docs/evaluation/manual_vs_engine_gary_2026-09-27.md L5](docs/evaluation/manual_vs_engine_gary_2026-09-27.md); same open item at [model_comparison_gary.md L71, L75](docs/evaluation/model_comparison_gary.md)
- Record sizes: "Gary: ~696k tokens per screen call (Opus tokenizer); dev records … 280k–700k tokens real" — [model_landscape_2026-09.md L9](docs/evaluation/model_landscape_2026-09.md); Gary is a 602-page, 5-volume record, Brian 1,013 pp / 8 volumes — [model_comparison_gary.md L1, L33](docs/evaluation/model_comparison_gary.md)

**Reconstruction [computed]** — per TRIAL record, formulas:
- Context pre-pass (live, writes 5m cache): `R × $10/M × 1.25 + 300 × $10/M + 200 × $50/M`
- Case summary (live, reads cache): `R × $0.25/M + 400 × $10/M + 700 × $50/M`
- If R ≤ 400k (batch path): pre-warm `R × $20/M`, then 14 items × `0.5 × (R × $0.25/M + 2,000 × $10/M + O × $50/M)`
- If R > 400k (live path): 14 calls × `(R × $0.25/M + 2,000 × $10/M + O × $50/M)`, assuming every call after the first reads the 5m cache
- O = output tokens per screen call: low 6k, base 11.5k (Fable 5 measured, Gary), high 16k (the old cap it overflowed), cap-bound 32k. Instruction tokens (2,000) and pre-pass outputs (200/700) are [assumption].

| Record size | Low (6k out) | Base (11.5k out) | High (16k out) | Cap-bound (32k out) | Breakdown at base |
|---|---:|---:|---:|---:|---|
| 150k tokens (~345k chars; ≈220 pp at Brian density) | **$7.47** | **$9.39** | **$10.97** | $18.94 | pre-pass $1.89 + summary $0.08 + pre-warm $3.00 + 14 batch items $4.43 |
| 400k tokens (batch-gate edge; ≈580 pp) | **$16.09** | **$18.02** | **$19.59** | $31.49 | pre-pass $5.01 + summary $0.14 + pre-warm $8.00 + 14 items $4.87 |
| 700k tokens (live path; ≈1,020 pp, Brian-sized) | **$15.91** | **$19.76** | **$22.91** | $56.15 | pre-pass $8.76 + summary $0.21 + 14 live calls $10.78 |
| 700k, every live call re-writes the 5m cache (cache expiry between 15–20 min calls) | — | — | **$142.96** | — | 14 × 700k × $12.50/M = $122.50 of writes |

- Output tokens are 23–43% of engine cost at base; cache **writes** are 55–72% on the batch path (two full writes: the pre-pass writes a 5m entry, the pre-warm writes a separate 1h entry) [computed from table].

### Inferences
- The production cost curve is **not monotonic in record size**: a 400k record on the batch path (~$18) costs about the same as a 700k record on the live path (~$20) because the batch path pays for the record twice (5m write in the pre-pass, then 2× 1h write in the pre-warm) before the 50% batch discount applies to the small remainder. Routing the context pre-pass and summary through the same 1h breakpoint as the pre-warm would remove ~$1.9–5.0 per record at 150k–400k (the 5m write), if the API serves the 1h entry to those calls — not verifiable from the repo.
- The single largest cost risk is not the model choice but **cache expiry on the live path**: with "15–20 minute" screen calls ([analysis.service.ts L768](apps/api/src/services/analysis.service.ts)) and a 5-minute TTL ([analysis-model.ts L36-38](apps/api/src/services/analysis-model.ts)), each subsequent live call may re-write the record at $12.50/MTok; at 700k that is ~$8.75 per call and ~$143 per record. The repo's own measured live-sequential run was 5 minutes total on Opus ([model_landscape L54](docs/evaluation/model_landscape_2026-09.md)), so this may not bite in practice, but Fable "writes ~3× the output per call, so each call is longer" (same line). No Fable live-path CostRecord is cited anywhere in the docs to rule it out.
- The repo's "$5–15 per case" and "under 5% of price" framing ([model_comparison_gary.md L69](docs/evaluation/model_comparison_gary.md)) predates prompt set v2 (7 screens vs 6: +17% screen calls) and assumes a $299 price; at a $99–149 attorney price the same engine cost is 6–20% of price (see §5).
- For a PLEA-lane record the engine cost is roughly 2/7 of the screen-call line (2 screens × 2 samples = 4 calls) plus the same fixed pre-pass/pre-warm overhead: ≈$6.9 at 150k, ≈$14.6 at 400k, ≈$12.1 at 700k at base output [computed from the same formulas with 4 calls].

### Gaps
- **No production CostRecord for Fable 5.1 + v2 is cited anywhere in the repo.** All instrumented dollar figures ($4.66, $9.42, $1.75, $17.34) are Opus 5 on 4–6 screens. The repo projections ($15/$24/$29/$40) are models, not measurements.
- Conflict on which record is ~696k tokens: [model_landscape L9](docs/evaluation/model_landscape_2026-09.md) says Gary; [analysis.service.ts L699-700](apps/api/src/services/analysis.service.ts) says Brian (1.6M chars); [analysis.service.ts L696](apps/api/src/services/analysis.service.ts) and [business_case_12mo.md L15](docs/business_case/business_case_12mo.md) imply Gary ≈ 282k ("$1.75 Gary harness run"). The per-page token density therefore ranges 468–1,156 tokens/page across the two reference records [computed: 282k/602, 696k/602, 695k/1,013].
- Fable 5.1 output tokens per call under v2 (which asks for more fields per finding — [analysis.service.ts L139](apps/api/src/services/analysis.service.ts)) are unmeasured; v1 Fable 5 measured ~11.5k/call with a 16k cap that it overflowed.
- Whether the API serves a 5m-TTL cache entry to a later 1h-TTL request (or vice-versa) is not stated in the repo; the code comment "same 1h breakpoint as the pre-warm → reads" ([analysis-model.ts L153](apps/api/src/services/analysis-model.ts)) implies TTLs must match.

---

## 2. OCR cost per record

### Takeaway
OCR is a rounding error: $0.60 / $1.50 / $4.50 for 400 / 1,000 / 3,000 scanned pages, $7.50 at the 5,000-page cap, and $0 for born-digital PDFs (which attorneys are expected to upload more often than families).

### Cited Findings
- Textract rate $1.50 per 1,000 pages, `pages × rate/1000` — [render.yaml L99-100](render.yaml); [costs.service.ts L79, L89](apps/api/src/services/costs.service.ts)
- Born-digital PDFs are parsed with pdf-parse first; only pages with `confidence < 1` are Textract pages and only those are costed — [digitize.service.ts L12, L34, L457-463](apps/api/src/services/digitize.service.ts)
- Measured: Gary 602 pp scanned = $0.91; Brian born-digital = $0; "scales ~$7.50 at the 5,000-page cap" — [business_case_12mo.md L64](docs/business_case/business_case_12mo.md); "~$0.90 avg case" — [external_services.md L22](docs/operations/external_services.md)
- "Attorneys upload cleaner records (clerk PDFs), so OCR-halt rates fall" — [docs/business_case/professional_tier_expansion.md L179](docs/business_case/professional_tier_expansion.md)
- OCR cost table [computed, pages × $0.0015]: 400 pp **$0.60**; 1,000 pp **$1.50**; 3,000 pp **$4.50**; 5,000 pp $7.50; 7,500 pp $11.25.

### Inferences
- Page count is a poor proxy for engine cost: at Brian's density (1,579 chars/page → ~687 tokens/page [computed 1.6M/1,013/2.3]) the 400k batch gate is ~580 pages and the 1M-token window is ~1,460 pages; at Gary's lower density (if 282k/602 pp = 468 tok/page) the gate is ~850 pages. Token count, not page count, should drive any attorney size-tiering.

### Gaps
- No measured OCR-halt rate (E-1) or distribution of scanned vs born-digital records in the repo.

---

## 3. Fixed costs, labour lines, and Stripe fees

### Takeaway
Provisioned infrastructure is **~$88/month** (web $7, api $25, Postgres ~$20, Redis $10, ClamAV $25, domain ~$1); the solo-founder cash floor including E&O, counsel and a marketing floor is **~$1,100/month**; the staffed scenarios in the 12-month case run $3,100 (lean) to $7,600 (operating contractor) per month. Stripe takes $3.17 at $99 up to $23.47 at $799 per one-time sale.

### Cited Findings
- Render plans: Postgres `basic-1gb` with PITR ([render.yaml L22](render.yaml)); Redis `starter` ([L31](render.yaml)); ClamAV `standard` "clamd + signatures need ~2GB RAM" ([L41](render.yaml)); api `standard` "upgraded 2026-09-06 (2 GB): large records OOM'd on starter" ([L46](render.yaml)); web `starter` ([L130](render.yaml)). `render.yaml` carries no prices; the price register is [external_services.md L9-15](docs/operations/external_services.md): web $7, api $25, Postgres ~$20, Redis $10, clamav $25, domain ~$1 → **~$88/mo** ("vs. $150/mo budgeted in the business case §8c — favorable"). Same $87–88 at [business_case_12mo.md L80-83](docs/business_case/business_case_12mo.md).
- Paid-tier triggers: Resend Pro $20/mo past ~100 cases/mo; Sentry Team ~$26/mo — [external_services.md L30-31](docs/operations/external_services.md); "~$113 if the web service needs Standard" — [external_services.md L45](docs/operations/external_services.md)
- api plan concurrency: `ANALYSIS_CONCURRENCY=2`, `INGESTION_CONCURRENCY=2`, heap cap 1536 MB — [render.yaml L109-112](render.yaml); capacity target "10 cases/day (NFR-5)" — [docs/operations/go_live_readiness.md L5](docs/operations/go_live_readiness.md)
- E&O insurance $150–300/mo, "a hard launch gate" — [docs/business_case/business_case.md L177](docs/business_case/business_case.md); market study §7.4 "Non-negotiable" — [docs/business_case/snotnoselegal_market_study_mvp_gtm.docx §7.4](docs/business_case/snotnoselegal_market_study_mvp_gtm.docx)
- Solo-founder fixed cash ≈ **$1,100/mo**: hosting ~$150 budgeted (actual ~$88), E&O ~$250, counsel pay-as-you-go ~$200, $500 marketing floor; "no salaries, no office" — [business_case_12mo.md L203](docs/business_case/business_case_12mo.md)
- Staffed scenarios: part-time senior contractor $8k/mo build, $6k/mo operating; fixed infra + E&O ~$600/mo; counsel $4k one-time + $500/mo retainer; marketing = max($500/mo, CAC $60 × ~50% paid share) → opex $7,600/mo post-launch — [business_case_12mo.md L100, L173](docs/business_case/business_case_12mo.md); lean ops (founder-run + ~$1.5k/mo on-call contractor) ≈ **$3,100/mo** — [L175](docs/business_case/business_case_12mo.md)
- Original business case fixed opex $500/mo at launch → $750/mo from month 7 — [business_case.md L95, L117, L287](docs/business_case/business_case.md); market study §7.4 range $275–620, "plan on ~$500/mo"
- Hired QA when volume binds: "~$25/case" from ~50 cases/mo — [business_case_12mo.md L262](docs/business_case/business_case_12mo.md); earlier "30 min/case at $25/hr loaded" = $12.50 — market study §7.3; [business_case.md L86](docs/business_case/business_case.md)
- Stripe 2.9% + $0.30, +0.5% when Stripe Tax applies; $0 on promo-trial cases — [external_services.md L24](docs/operations/external_services.md); [business_case_12mo.md L67](docs/business_case/business_case_12mo.md); Stripe Billing adds 0.7% on subscriptions — [professional_tier_expansion.md L227](docs/business_case/professional_tier_expansion.md)
- Stripe fee per price point [computed, 0.029P + 0.30; in brackets with +0.5% tax calc]: $99 → **$3.17** [$3.67]; $149 → **$4.62** [$5.37]; $199 → **$6.07** [$7.07]; $299 → **$8.97** [$10.47]; $349 → **$10.42** [$12.17]; $499 → **$14.77** [$17.27]; $799 → **$23.47** [$27.47]; $1,500 → $43.80 [$51.30]
- Live price list in code: `review 29900`, `overage 4900`, `rerun 9900` cents, overridable by `PRICE_*_CENTS` — [apps/api/src/services/payments.service.ts L19-23](apps/api/src/services/payments.service.ts); [environment_reference.md L63](docs/operations/environment_reference.md)

### Inferences
- With ~$88/mo infra and even a $99 attorney record, infrastructure break-even is ~1.2 records/month; the binding fixed line is whatever labour the operator chooses to count (see §5).
- `ANALYSIS_CONCURRENCY=2` on a single 2 GB api instance, with 15–20 minute live calls × 16 calls per 700k record, implies a throughput ceiling on the order of a few large records per hour per instance — relevant to an office licence with 20 records/month only if deliveries cluster; not a cost issue.

### Gaps
- No stated support-ticket rate, hold-triage rate, or founder hours per record anywhere in docs/operations or docs/specifications; the 24-hour hold-triage SLA ([docs/specifications/auto_qa_hold_workflow.md L27](docs/specifications/auto_qa_hold_workflow.md)) is a promise, not a measured load.
- No actual Render invoice figures; $88 is a register of list prices (dated 2026-08-31).

---

## 4. Human QA: what fraction of records a human reads, and what it is assumed to cost

### Takeaway
Three different answers coexist. The market study and original business case budget **100% human QA at $12.50/report**; the 12-month case says QA is **$0** because `AUTO_APPROVE=1` is "armed"; the professional-tier plan assumes **10% sampled QA at $1.25/record**. The code's default spot-check is 10% of *auto-approved* cases, but **`render.yaml` does not set `AUTO_APPROVE` at all**, so as the blueprint stands every production report goes to human `QA_REVIEW`, and the runbook says to keep it that way until counsel signs off.

### Cited Findings
- Auto-approval is "OFF by default — AUTO_APPROVE=1 enables"; `autoApproveEnabled()` is `process.env.AUTO_APPROVE === '1'` — [apps/api/src/services/auto-qa.service.ts L7-11, L35-37](apps/api/src/services/auto-qa.service.ts)
- `render.yaml` contains no `AUTO_APPROVE*` key — [render.yaml L62-125](render.yaml) (full api envVars block); `.env.example` sets `AUTO_APPROVE=0`, `AUTO_APPROVE_SPOTCHECK_PERCENT=10` — [.env.example L104-107](.env.example)
- Runbook: "**GO-LIVE GATE: keep AUTO_APPROVE=0 in production until (a) validation testing passes and (b) counsel signs off on the founder's rewritten disclosures/policy copy** (the current pages still describe human review of every report)" — [docs/operations/runbook.md L100-104](docs/operations/runbook.md)
- Business case 12mo: "`AUTO_APPROVE=1` is armed. This deletes the ~$12.50/report QA cost line" — [business_case_12mo.md L12](docs/business_case/business_case_12mo.md); Human QA "$0 — automated QA gates + founder spot-check sample" — [L68](docs/business_case/business_case_12mo.md)
- Gates that hold a run for a human even when enabled: every screen completed; ≥ `AUTO_APPROVE_MIN_FINDINGS` (default 1); grounding drop ratio ≤ `AUTO_APPROVE_MAX_DROP_RATIO` (default 0.5; "the fresh-regression RED run measured 0.40 vs the healthy 0.125"); FR-7 verification — [auto-qa.service.ts L13-21, L53-54](apps/api/src/services/auto-qa.service.ts)
- Spot-check: `Math.random() * 100 < AUTO_APPROVE_SPOTCHECK_PERCENT` (default **10**) of auto-approved cases flagged for after-the-fact review; "delivery is never delayed" — [auto-qa.service.ts L23-25, L97](apps/api/src/services/auto-qa.service.ts); [runbook.md L103](docs/operations/runbook.md)
- Cost assumptions by document: $12.50/case = "~30 min/case at $25/hr loaded — a spot-check on every consumer report is a UPL and quality control, not optional" — market study §7.3; [business_case.md L86](docs/business_case/business_case.md); PRD "Target ~30 min/case (COGS line)" and "Human QA on 100% of reports (US-8)" — [docs/specifications/mvp_v1_prd.md L94](docs/specifications/mvp_v1_prd.md); [business_case.md L223](docs/business_case/business_case.md). Professional tier: "sampled (10%) rather than 100% human QA" and "10% sampled QA $1.25" — [professional_tier_expansion.md L132, L182, L226](docs/business_case/professional_tier_expansion.md). Hired QA at scale "$25/case" — [business_case_12mo.md L262](docs/business_case/business_case_12mo.md)
- Human-review share if `AUTO_APPROVE=1` [computed]: `10% × (1 − hold rate) + hold rate`; at a 0% hold rate 10%, at 10% holds 19%, at 20% holds 28%. At the $12.50/report labour rate that is **$1.25 / $2.38 / $3.50 per record**; at $25/report, $2.50 / $4.75 / $7.00.
- Human-review share with `AUTO_APPROVE` unset (the current blueprint): **100%**, i.e. $12.50–25 per record of founder time or hired labour.

### Inferences
- The attorney offer's margin arithmetic in the professional-tier doc ($1.25 QA) is only true once `AUTO_APPROVE=1` is actually set in `render.yaml` **and** the hold rate is near zero. Neither is documented as done.
- For attorneys specifically the FR-7 citation re-verification "remains 100% and blocking" ([professional_tier_expansion.md L182, L284](docs/business_case/professional_tier_expansion.md)); that is code, not labour, so it does not change the cost line.

### Gaps
- No measured hold rate, QA rejection rate, or spot-check finding rate in the repo (the KPI target is "QA rejection < 10%" — [docs/specifications/analytics_experimentation_plan.md L57](docs/specifications/analytics_experimentation_plan.md); [business_case.md L254](docs/business_case/business_case.md)).
- Whether production currently has `AUTO_APPROVE=1` set out-of-band (Render dashboard) is not knowable from the repo; the blueprint and runbook say no, the 12-month case says yes.

---

## 5. Contribution margin at candidate price points, break-even, seats, office licence, page cap and overage

### Takeaway
At a base record ($18 engine + $1.50 OCR + $1.25 sampled QA) every one-time price from $99 up clears 70% gross margin; **$149 is ~81%, $199 ~85%, $299 ~88%** [computed]. Per-seat subscriptions invert quickly with usage: a **$149 seat is loss-making above ~5 base records/month**, a $299 seat above ~12, and a $499 seat holds ≥46% at 12. An office licence at $1,500 for 20 records runs 58–69% gross margin at high/base records but only ~14% if Fable saturates its output cap. The 5,000-page cap is above the engine's context window at either reference record's density, so the overage block never actually prices the engine's heavy tail.

### Cited Findings
- Price list and packaging inputs: review $299, overage $49 per 2,500 pages, re-run $99 — [payments.service.ts L19-23](apps/api/src/services/payments.service.ts); [business_case_12mo.md L50-52](docs/business_case/business_case_12mo.md); Counsel Review $199 (5,000-page cap; +$49/2,500), Advocate $99/seat/mo (annual $79) with one review included and "additional at $99", Chambers $249/seat/mo — [professional_tier_expansion.md L132-134](docs/business_case/professional_tier_expansion.md); expected usage "3–8 records/month" (PD appellate) and "1–3 records/month" (writ practitioner) — [L118](docs/business_case/professional_tier_expansion.md)
- Overage gate: allowance = `5000 + overageBlocks × 2500`; above it the endpoint returns 402 with `blocksNeeded = ceil((billable − allowance)/2500)` and `blockPriceCents: 4900`; "a partial block is never charged for pages not received" — [apps/api/src/routes/intake.ts L442-456](apps/api/src/routes/intake.ts); `pageMeter` cap 5000 — [digitize.service.ts L543](apps/api/src/services/digitize.service.ts)
- Refund reserve: 5% of revenue for consumers ([business_case.md L87, L300](docs/business_case/business_case.md)); 2% assumed for Counsel Review ([professional_tier_expansion.md L226](docs/business_case/professional_tier_expansion.md))
- Existing margin claims to compare against: consumer $299 → ~$54 COGS → 83% GM ([business_case.md L88](docs/business_case/business_case.md)), measured ~$29–34 → ~89% ([business_case_12mo.md L70](docs/business_case/business_case_12mo.md)); Counsel Review $199 → $29.30 COGS → $169.70, 85% ([professional_tier_expansion.md L226](docs/business_case/professional_tier_expansion.md)); Advocate $99 → $25.46 → $73.54, 74% ([L227](docs/business_case/professional_tier_expansion.md)); Chambers $249 → $30 → $219, 88% ([L228](docs/business_case/professional_tier_expansion.md))

**Per-record contribution [computed]** — COGS = engine + OCR + sampled QA $1.25 + Stripe(0.029P + 0.30) + 2% reserve. Cost scenarios: low = 150k tokens born-digital, 6k out ($8.72 before Stripe/reserve); base = 400k tokens, 1,000 scanned pp, 11.5k out ($20.77); high = 700k tokens, 3,000 scanned pp, 16k out ($28.66); cap = 700k, 3,000 pp, 32k out/call ($61.90).

| Price | Low: contrib / GM | Base: contrib / GM | High: contrib / GM | Cap-bound: contrib / GM |
|---:|---|---|---|---|
| $99 | $85.13 / 86.0% | $73.08 / 73.8% | $65.19 / 65.8% | $31.95 / 32.3% |
| $149 | $132.68 / 89.0% | $120.63 / 81.0% | $112.74 / 75.7% | $79.50 / 53.4% |
| $199 | $180.23 / 90.6% | $168.18 / 84.5% | $160.29 / 80.5% | $127.05 / 63.8% |
| $299 | $275.33 / 92.1% | $263.28 / 88.1% | $255.39 / 85.4% | $222.15 / 74.3% |
| $349 | $322.88 / 92.5% | $310.83 / 89.1% | $302.94 / 86.8% | $269.70 / 77.3% |
| $499 | $465.53 / 93.3% | $453.48 / 90.9% | $445.59 / 89.3% | $412.35 / 82.6% |
| $799 | $750.83 / 94.0% | $738.78 / 92.5% | $730.89 / 91.5% | $697.65 / 87.3% |

(With 100% human QA at $12.50 instead of $1.25, subtract $11.25 from every contribution cell; with the consumer 5% reserve instead of 2%, subtract a further 3% of price.)

**Break-even records per month [computed, base record, 2% reserve]**

| Price | Contribution | vs infra $88 | vs solo cash floor $1,100 | vs lean ops $3,100 | vs staffed $7,600 |
|---:|---:|---:|---:|---:|---:|
| $99 | $73.08 | 1.2 | 15.1 | 42.4 | 104.0 |
| $149 | $120.63 | 0.7 | 9.1 | 25.7 | 63.0 |
| $199 | $168.18 | 0.5 | 6.5 | 18.4 | 45.2 |
| $299 | $263.28 | 0.3 | 4.2 | 11.8 | 28.9 |
| $499 | $453.48 | 0.2 | 2.4 | 6.8 | 16.8 |

Fixed-cost tiers from [external_services.md L15](docs/operations/external_services.md), [business_case_12mo.md L203, L175, L173](docs/business_case/business_case_12mo.md).

**Seat subscriptions [computed]** — Stripe 2.9% + 0.7% Billing + $0.30 on the seat ([professional_tier_expansion.md L227](docs/business_case/professional_tier_expansion.md)); per-record cost base $20.77 / high $28.66; no reserve.

| Seat | Records/mo | Base contrib / GM | High contrib / GM | Effective price per record |
|---:|---:|---|---|---:|
| $149 | 1 | $122.57 / 82% | $114.68 / 77% | $149.00 |
| $149 | 3 | $81.03 / 54% | $57.36 / 38% | $49.67 |
| $149 | 6 | $18.72 / 13% | **−$28.62** | $24.83 |
| $149 | 12 | **−$105.90** | **−$200.58** | $12.42 |
| $299 | 1 | $267.17 / 89% | $259.28 / 87% | $299.00 |
| $299 | 3 | $225.63 / 75% | $201.96 / 68% | $99.67 |
| $299 | 6 | $163.32 / 55% | $115.98 / 39% | $49.83 |
| $299 | 12 | $38.70 / 13% | **−$55.98** | $24.92 |
| $499 | 1 | $459.97 / 92% | $452.08 / 91% | $499.00 |
| $499 | 3 | $418.43 / 84% | $394.76 / 79% | $166.33 |
| $499 | 6 | $356.12 / 71% | $308.78 / 62% | $83.17 |
| $499 | 12 | $231.50 / 46% | $136.82 / 27% | $41.58 |

Usage at which a seat reaches 70% GM [computed, base record]: $149 seat ≈ 1.9 records/mo; $299 ≈ 3.8; $499 ≈ 6.4. The professional-tier doc's own Advocate assumption (1.2 reviews used per $99 seat, $18 LLM) — [professional_tier_expansion.md L227](docs/business_case/professional_tier_expansion.md) — gives 74% GM at the $18 LLM line it used; at the reconstructed $20.77 base record it is $99 − $3.86 − $24.92 = $70.22 (71%) and at the high record $99 − $3.86 − $34.39 = $60.75 (61%) [computed].

**Office licence $1,500/mo, 20 records [computed]**: records at low $174 / base $415 / high $573 / cap $1,238 + Stripe $54.30 → contribution **$1,271 (85%) / $1,030 (69%) / $873 (58%) / $208 (14%)**; effective $75/record. If invoiced and paid by ACH rather than Stripe card, the $54 fee line falls — not modelled in the repo.

**Page cap and overage [computed + cited]**
- A $49 overage block carries $1.72 Stripe and at most $3.75 of Textract (2,500 scanned pages) → ≥$43.53 contribution per block before engine cost — [intake.ts L449-456](apps/api/src/routes/intake.ts); [render.yaml L99-100](render.yaml)
- But 5,000 pages ≈ **3.4M tokens** at Brian's density (687 tok/page) or ≈ 2.3M at 468 tok/page [computed]; the long-context survey treats a "usable 1M window" as the requirement ([model_landscape L9](docs/evaluation/model_landscape_2026-09.md)); `buildRecord` sends the entire record in one block ([analysis.service.ts L289-296](apps/api/src/services/analysis.service.ts)) and the only size gate in the analysis path is the 400k batch/live switch ([analysis.service.ts L698-706](apps/api/src/services/analysis.service.ts)) — no truncation, splitting, or refusal for records above the context window appears in `analysis.service.ts` or `analysis-model.ts`.
- The business case positions the cap as the cost "tail guard" — [docs/architecture/cost_optimization_ollama.md L40](docs/architecture/cost_optimization_ollama.md); [business_case.md L226](docs/business_case/business_case.md); market study §7.5 guardrail (1).

### Inferences
- The engine's effective heavy-record limit is the model context window (~1,450 pages at transcript density, ~2,100 at Gary's), not the 5,000-page commercial cap. A multi-volume PD appellate record above ~1,500 pages is either going to fail at the API or need a code path that does not exist yet; the $49 block prices pages the engine may not be able to read. For attorney packaging this argues for a token-based (or volume-based) size tier rather than the family-tier page cap.
- Per-record one-time pricing is margin-safe at any candidate price ≥ $99 for ordinary records; the risk concentrates in **unmetered seats** — a $149 seat used 6×/month is break-even at base and negative at high records. If a seat is offered, it needs an included-record count (as the Advocate design already has: one included, "additional at $99" — [professional_tier_expansion.md L133](docs/business_case/professional_tier_expansion.md)).
- An office licence at $1,500/20 records (effective $75/record) sits below the $84 price floor computed in §7 for a base record at 70% GM once Stripe is included, and well below it on high records; a 15-record allowance or a $1,995 price would restore ≥70% at base [computed: $1,995 − $72 − $415 = $1,508, 76%].

### Gaps
- No repo evidence on attorney usage distribution per seat; the 3–8 / 1–3 records/month figures are `[estimated]` in the professional-tier doc ([professional_tier_expansion.md L118, L297-299](docs/business_case/professional_tier_expansion.md)).
- No model of re-run economics for attorneys (re-run = another full analysis run at full engine cost against a $99 price — [docs/specifications/case_facts_and_rerun.md L56](docs/specifications/case_facts_and_rerun.md); margin at base record $99 − $3.17 − $20.77 = $75 [computed], but zero if a seat includes re-runs).
- Behaviour for records above the model context window is unverified (no test or code path found; "Gaps" in §1 apply).

---

## 6. What the existing 12-month business case assumed for the professional tier, and what the current code or newer notes contradict

### Takeaway
The professional-tier plan (2026-09-15) assumes a $199 Counsel Review with $12 of LLM cost, five running screens with preserved-error "not yet running", a 100%-human consumer QA gate relaxed to 10% for attorneys, 114 reviews + 59 Advocate seat-months + 15 Chambers seat-months in year one, and ~$10k of TCDLA channel spend. Since then the engine moved to Fable 5.1 (2026-09-11, ~2× input / ~6× output price vs Opus), prompt set v2 added the preserved-error and identification screens (2026-09-27, seven screens), and the QA line has gone to $0 on paper but not in the blueprint. The volume and channel assumptions have no observed data behind them anywhere in the repo.

### Cited Findings

**Prices, packaging and volumes assumed**
- Counsel Review $199/record (5,000-page cap, +$49/2,500), "sampled (10%) rather than 100% human QA", "48-hour target from records-complete", on existing Stripe Checkout — [professional_tier_expansion.md L132](docs/business_case/professional_tier_expansion.md)
- Advocate $99/seat/mo (annual $79), one review included, additional $99; Chambers $249/seat/mo with free investigator/viewer seats; Stripe Billing subscriptions — [L133-134](docs/business_case/professional_tier_expansion.md); the same tier prices originate in the market study §6 ("Advocate ~$99/user/mo (annual ~$79)… Chambers ~$249/user/mo") and [business_case.md L295](docs/business_case/business_case.md) (blended seat ARPU $130/mo, seat COGS 25% of revenue — [L296](docs/business_case/business_case.md))
- "$199 is deliberately below the consumer $299: the attorney is their own QA, receives no human review of Part A, and carries none of the consumer's chargeback risk — the unit economics hold at $199 with an 85% margin" — [L136](docs/business_case/professional_tier_expansion.md)
- Volumes: Counsel Reviews 2 → 26/mo over M4–M12 (114/yr); Advocate seats 3 → 18 (M7–M12, 59 seat-months); Chambers 5 seats from M10 (15 seat-months); three free PDO pilots M5–M8 at 8 records/mo each — [L237-249, L296-301](docs/business_case/professional_tier_expansion.md)
- Financials: professional revenue $32,262, cost $17,943 (COGS $5,293 · pilots $2,400 · channel $10,250), contribution $14,319; bear −$3,176, bull $36,552 — [L249-259](docs/business_case/professional_tier_expansion.md)
- Conversion mechanics: M4 gate "10 paid Counsel Reviews; ≥2 from the referral loop"; M7 "per-case buyers converting to seats"; M9 "≥1 office commits to Chambers" — [L148-155](docs/business_case/professional_tier_expansion.md); base case one PDO conversion in year one — [L301](docs/business_case/professional_tier_expansion.md)
- Channels (in order): consumer referral loop (neutral directory, no fees), TCDLA seminars (Post-Conviction $4,000 exhibitor M6; Appellate $2,500 M9), the ~134 board-certified list, three PDO pilots, CLE content — [L138-145, L251](docs/business_case/professional_tier_expansion.md)
- CAC: no explicit professional CAC; channel spend $10,250 ÷ (114 reviews + 74 seat-months) ≈ $55 per paid unit [computed]. Consumer CAC ceiling $100 ([business_case.md L288](docs/business_case/business_case.md)), 12-month case blended $60 on ~50% paid share ([business_case_12mo.md L100](docs/business_case/business_case_12mo.md))
- Payroll-coverage mix: "50 consumer cases + 40 Counsel Reviews + 60 Advocate + 20 Chambers seats (98%)" of a $28,750/mo two-engineer payroll — [L269](docs/business_case/professional_tier_expansion.md); original case: 114 consumer cases/mo, or 456 seats for 3 FTE — [business_case.md L150-155](docs/business_case/business_case.md)
- Family-tier year-one base: 273 cases, $96,694 revenue, $58,877 contribution; 12-month case base: 30 cases/mo by Aug-27, $42,050 revenue — [business_case.md L115](docs/business_case/business_case.md); [business_case_12mo.md L138](docs/business_case/business_case_12mo.md)

**Contradictions with current code / newer notes**
- *LLM cost line.* Professional tier assumes LLM $12 ([L226](docs/business_case/professional_tier_expansion.md)) and $18 per Advocate review ([L227](docs/business_case/professional_tier_expansion.md)), inherited from the three-tier Haiku/Sonnet/Opus routing design ([cost_optimization_ollama.md L20-24](docs/architecture/cost_optimization_ollama.md)) that was never built: production runs a single frontier model over the whole record per screen ([analysis.service.ts L289-296](apps/api/src/services/analysis.service.ts); [render.yaml L75-76](render.yaml)). Reconstructed Fable cost is ~$9–23 (§1), i.e. $12 is right only for small born-digital records.
- *Screen count.* "SCREENS_BY_LANE runs iac, brady, junk_science, sentencing, voir_dire" and "FR-1 preserved error… the pipeline does not currently run" ([professional_tier_expansion.md L84, L111, L180](docs/business_case/professional_tier_expansion.md)) — superseded by v2's seven screens including `preserved_error` and `identification` ([analysis.service.ts L102-105](apps/api/src/services/analysis.service.ts); [render.yaml L77-81](render.yaml)). The 1.5 ew "Add FR-1 preserved error" build item ([L180](docs/business_case/professional_tier_expansion.md)) is done; the TRAP brief clock ([L181](docs/business_case/professional_tier_expansion.md)) is not evidenced as built.
- *QA gate.* "Consumer today: 100% human review before release" ([L182](docs/business_case/professional_tier_expansion.md)) vs 12-month case "AUTO_APPROVE=1 is armed" ([business_case_12mo.md L12](docs/business_case/business_case_12mo.md)) vs `render.yaml` with no `AUTO_APPROVE` and runbook "keep AUTO_APPROVE=0" ([runbook.md L104](docs/operations/runbook.md)). See §4.
- *Engine identity in cost registers.* [external_services.md L21](docs/operations/external_services.md) and [business_case_12mo.md L65](docs/business_case/business_case_12mo.md) still describe "Claude Opus 5" at $1.75–3.30/case; the PO switched production to Fable 5.1 on 2026-09-11 ([model_comparison_gary.md L67-69](docs/evaluation/model_comparison_gary.md)).
- *Eval status.* The expansion's P5 risk (preserved-error screen must pass the eval gate — [L283](docs/business_case/professional_tier_expansion.md)) is now compounded: the gate has not been run on Fable 5.1 at all ([manual_vs_engine_gary L5](docs/evaluation/manual_vs_engine_gary_2026-09-27.md)); v2 prompts "are a model change under NFR-1, so re-score the Gary ledger after any change" ([analysis.service.ts L99-100](apps/api/src/services/analysis.service.ts)).
- *Turnaround.* The 48-hour attorney target ([L132](docs/business_case/professional_tier_expansion.md)) sits against a batch budget of up to 4 hours per stage before live fallback ([analysis-model.ts L125](apps/api/src/services/analysis-model.ts)) and a consumer SLA of 10 business days ([mvp_v1_prd.md L164](docs/specifications/mvp_v1_prd.md)); measured dev runs were 5 min live / 20 min batch on Opus ([model_landscape L54](docs/evaluation/model_landscape_2026-09.md)). Achievable, but Fable is slower per call (same line).
- *Original business case* ([business_case.md](docs/business_case/business_case.md), 2026-08-29) is stale on: COGS $54 incl. $12.50 QA and $18 tech ([L84-88](docs/business_case/business_case.md)); fixed $500 → $750/mo ([L287](docs/business_case/business_case.md)) vs $88 provisioned; 5 screens; the "~$720k institutional round" framing ([L16](docs/business_case/business_case.md)) that the 12-month case replaced with a $100k envelope ([business_case_12mo.md L162, L238](docs/business_case/business_case_12mo.md)); and "Human QA on 100% of reports" as the R2 mitigation ([L223](docs/business_case/business_case.md)).
- *market_analysis.md / swot_analysis.md* (undated) describe an Ollama/Llama-3 + Neo4j + LangGraph architecture ([market_analysis.md L83](docs/business_case/market_analysis.md); [swot_analysis.md L13-15](docs/business_case/swot_analysis.md)); Ollama is "off" at launch and failed the grounding test ([cost_optimization_ollama.md L61](docs/architecture/cost_optimization_ollama.md); [model_comparison_gary.md L61](docs/evaluation/model_comparison_gary.md)); Neo4j was "decommissioned pre-launch" ([external_services.md L39](docs/operations/external_services.md)). Neither document carries economic inputs beyond TAM/SAM/SOM ($30B / $1.5–2B / $50–100M — [market_analysis.md L11-17](docs/business_case/market_analysis.md)).
- *docs/architecture/prompt_specifications.md* describes four MCP-driven personas and an orchestrator that do not correspond to the shipped `SCREENS` prompts ([analysis.service.ts L80-85](apps/api/src/services/analysis.service.ts)); no cost content.

### Inferences
- The professional plan's $29.30 Counsel Review COGS is approximately right **at a base record** by accident (its $5 OCR overstates, its $12 LLM understates; reconstructed $30.82 incl. Stripe and 2% reserve at $199), but it is ~$8–9 low on a high record ($38.71) and ~$42 low if Fable runs at its output cap ($71.95) [from §5 table].
- Nothing in the repo measures attorney willingness-to-pay or conversion; every professional volume is `[estimated]` by the doc's own register ([professional_tier_expansion.md L310](docs/business_case/professional_tier_expansion.md)). The only revealed-preference data point is the family tier's price anchor ($3,000 attorney file-read — [business_case.md L54](docs/business_case/business_case.md)).

### Gaps
- No actual sales, pilot, or trial data for any professional persona; no Stripe Billing implementation evidenced in `payments.service.ts` (only one-time `review/overage/rerun` kinds — [payments.service.ts L19-25](apps/api/src/services/payments.service.ts)).
- The market study PDF/DOCX's §6 tier rationale (why $99/$249) is "priced against competitors rather than against willingness-to-pay research" by its own admission — [business_case.md L303](docs/business_case/business_case.md).

---

## 7. Price floors: 70% gross margin at the high-cost record, and the family-tier channel-conflict line

### Takeaway
To hold ≥70% gross margin on a **high-cost record** (700k tokens, 3,000 scanned pages, 16k output/call, sampled QA, Stripe, 2% reserve) the one-time price must be **≥ ~$115**; at the base record ≥ ~$84; if Fable saturates its 32k output cap on heavy records, ≥ ~$248 [computed]. Any attorney price below $299 per record undercuts the family tier by construction — the professional-tier doc already proposes $199 "deliberately below" it — and any seat priced under $299 undercuts it at one record per month.

### Cited Findings
- Floor formula [computed]: `P ≥ (C + 0.30) / (0.30 − 0.029 − r)` where C = engine + OCR + QA and r = reserve rate, from `P − C − (0.029P + 0.30) − rP ≥ 0.70P`.

| Record scenario (C) | r = 0% | r = 2% | r = 5% (consumer reserve) |
|---|---:|---:|---:|
| Low $8.72 | $33 | $36 | $41 |
| Base $20.77 | $78 | **$84** | $95 |
| High $28.66 | $107 | **$115** | $131 |
| Cap-bound $61.90 | $230 | **$248** | $281 |
| High with 100% human QA ($12.50 instead of $1.25 → C = $39.91) | $148 | $160 | $182 |

- Family tier price $299 ([payments.service.ts L20](apps/api/src/services/payments.service.ts)); the professional plan's Counsel Review at $199 is "$100 less than the family price, because you are the reviewer" and names the channel conflict explicitly: "the consumer product sells for $299 the go/no-go signal that some writ practitioners sell for $3,000" — [professional_tier_expansion.md L136, L161, L202](docs/business_case/professional_tier_expansion.md)
- Seat-vs-family crossover [computed, seat ÷ $299]: a $149 seat undercuts the family price above 0.5 records/mo; $299 above 1.0; $499 above 1.67; a $1,500 office licence above 5.0 records/mo.
- The family tier includes things an attorney record does not: Part A plain-English report, the 5% chargeback reserve, and (per the still-published pages) human review of every report — [business_case.md L86-87](docs/business_case/business_case.md); [runbook.md L104](docs/operations/runbook.md); the expansion doc's justification for the $100 gap rests on exactly those three lines — [professional_tier_expansion.md L231](docs/business_case/professional_tier_expansion.md)
- The business case's own sensitivity shows the family tier stays positive down to $199 ([business_case.md L235-241](docs/business_case/business_case.md)), and the 12-month case flags a $349 test (+17%) as worth ~$8k/yr ([business_case_12mo.md L164](docs/business_case/business_case_12mo.md)).

### Inferences
- The margin floor is far below any price the plan contemplates; price for the attorney tier is a positioning and channel-conflict decision, not a cost decision — **unless** two engineering facts turn out badly: Fable output per call near the 32k cap (floor $248) or live-path cache re-writes on long records (engine ~$143 → floor >$500). Both are measurable with one Fable 5.1 production run on Gary and Brian, which the eval-gate re-run would produce anyway.
- The honest reconciliation of the $199-vs-$299 gap, in cost terms, is only ~$26 (QA $11.25 + reserve 3% × $299 ≈ $9 + Stripe difference ~$3 + Part A rendering ≈ $0); the remaining ~$74 is a deliberate positioning discount. A per-record attorney price of $249–299 would remove the undercut while keeping ≥85% GM at base; whether attorneys will pay it is not answerable from the repo.
- Because consumer strong-signal reports are designed to route to counsel ([professional_tier_expansion.md L140, L161](docs/business_case/professional_tier_expansion.md)), a family-paid record that an attorney later re-runs under a seat is the one double-charge scenario the current code already supports (re-run $99 — [payments.service.ts L22](apps/api/src/services/payments.service.ts)) and the seat design would need to handle.

### Gaps
- No attorney price-sensitivity or willingness-to-pay evidence in the repo (the only external pricing bracket is "legal-AI pricing for solo and small firms clusters at $50–$200 per seat per month" — [professional_tier_expansion.md L62](docs/business_case/professional_tier_expansion.md), from Clio).
- Whether the Family tier's disclosures (which "still describe human review of every report" — [runbook.md L104](docs/operations/runbook.md)) will be rewritten before an attorney tier launches, which changes what the $299 actually includes and therefore the size of the conflict.

---

## 8. Stale-document register (dates in headers vs the current code)

### Takeaway
Every economics document in the repo predates at least one of the three September changes (Fable switch 2026-09-11, pre-warm 2026-09-11, prompt set v2 2026-09-27); none was re-based afterwards.

### Cited Findings
| Document | Header date / last commit | Stale against |
|---|---|---|
| [docs/business_case/business_case.md](docs/business_case/business_case.md) | "Last updated: 2026-08-29" (L3); amendment note 2026-09-15 (L6) | $54 COGS with 100% QA (L84-88); three-tier routing basis (L4); fixed $500–750 (L287); 5 screens; $720k round framing (L16) |
| [docs/business_case/business_case_12mo.md](docs/business_case/business_case_12mo.md) | "Prepared 2026-08-30 · Updated 2026-09-01" (L3); last commit 2026-09-11 | Opus 5 engine and $3.75–9.42 LLM (L65); 6 screens (L60); Anthropic $1.75–3.30 (L84); "AUTO_APPROVE=1 armed" (L12) vs blueprint |
| [docs/business_case/professional_tier_expansion.md](docs/business_case/professional_tier_expansion.md) | "Last updated: 2026-09-15" (L3) | 5 screens / FR-1 not running (L84, L180); LLM $12 (L226); 100% human consumer QA (L182); predates Fable cost reality by four days but does not mention it |
| [docs/business_case/market_analysis.md](docs/business_case/market_analysis.md), [swot_analysis.md](docs/business_case/swot_analysis.md) | undated | Ollama/Neo4j/LangGraph architecture (market_analysis L83; swot L13-15) — decommissioned/deferred |
| [docs/architecture/cost_optimization_ollama.md](docs/architecture/cost_optimization_ollama.md) | "Revision (Aug 2026)" (L3) | Haiku/Sonnet/Opus + Gemini adjudication never built; $9–12/case (L24); 5 passes (L21); 0.1× cache reads (L38) vs Fable 0.025× |
| [docs/architecture/model_evaluation.md](docs/architecture/model_evaluation.md) | undated | "~2M tokens of transcript" (L3); "budgeted human QA pass (~30 min/case)" (L29) |
| [docs/architecture/prompt_specifications.md](docs/architecture/prompt_specifications.md) | undated | MCP-persona design, not the shipped `SCREENS` prompts; no cost content |
| [docs/evaluation/model_landscape_2026-09.md](docs/evaluation/model_landscape_2026-09.md) | 2026-09-11 (L3) | six screens (L20); pre-pre-warm measurements; still the best cost evidence in the repo |
| [docs/evaluation/model_comparison_gary.md](docs/evaluation/model_comparison_gary.md) | 2026-08-30 with 2026-09-11 decision (L3, L67) | 4 screens; Fable 5 not 5.1; eval gate "open before launch" (L71) still open |
| [docs/operations/external_services.md](docs/operations/external_services.md) | "Updated: 2026-08-31" (L3) | "Claude Opus 5 analysis engine… ~$1.75–3.30/case" (L21); "$12–15/case COGS" (L45) |
| [docs/operations/environment_reference.md](docs/operations/environment_reference.md), [runbook.md](docs/operations/runbook.md) | commits through 2026-09-27 | current on engine and pre-warm; runbook still carries "$40/case as the batch path runs today" (L49) which the pre-warm was meant to fix |
| [render.yaml](render.yaml) | commit 2026-09-27 | **current** — the source of truth for this note |

### Inferences
- The one document a pricing decision should treat as authoritative for cost is `render.yaml` plus the two services files; for revenue assumptions there is no authoritative document, only the `[estimated]` registers.

### Gaps
- No post-2026-09-27 CostRecord export, `/ops/money` spend-by-week snapshot, or eval-gate result is checked into the repo; the next reconciliation of these documents has nothing measured to re-base on.
