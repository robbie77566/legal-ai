import { RECORD_BUCKETS, type RecordBucket } from './pricing/buckets'

/**
 * The eval gate as a pure function (persona_rollout_plan.md §5 J "weekly
 * eval gate in CI with cost per bucket", §7 go-live gates, §8 "eval gate is
 * the only approval for an engine change").
 *
 * A ledger (docs/evaluation/ledgers/<name>.json) names the canaries the
 * engine MUST surface and, once an attorney packet is transcribed, the
 * verdicts on a reviewed run. The scorer (apps/api eval.service.ts
 * `scoreRun`) turns a run into a scorecard; this module turns the scorecard
 * into the one answer the console, the workflow and the promotion checklist
 * read: pass or fail, with the reasons spelled out.
 *
 * No model calls, no database — deterministic and replayable in CI.
 */

/** The ledger fields the gate reads (a structural subset of the api's EvalLedger). */
export interface GateLedger {
  case: string
  mustFind: ReadonlyArray<{ id: string }>
  verdicts?: ReadonlyArray<{ verdict: 'agree' | 'partly' | 'disagree' }>
  /**
   * Optional per-ledger thresholds. Neither committed ledger sets them today;
   * when an attorney-adjudicated ledger does, the ledger wins over the
   * constants below.
   */
  thresholds?: {
    /** Share of mustFind entries that must be found (0..1). */
    minRecall?: number
    /** Share of attorney verdicts that must be agree or partly (0..1). */
    minPrecision?: number
  }
}

/** The scorecard fields the gate reads (a structural subset of the api's EvalScorecard). */
export interface GateScorecard {
  mustFindTotal: number
  found: ReadonlyArray<{ id: string }>
  missed: ReadonlyArray<{ id: string; note?: string }>
  recall: number
  precision: number | null
}

/**
 * Every canary found — the launch rule scripts/eval-run.ts and the ops
 * console have always applied (`--min-recall 1.0`; "EVAL RED" on one miss).
 */
export const MUST_FIND_RECALL_FLOOR = 1

/**
 * Attorney-verdict precision floor, applied only once a ledger carries
 * verdicts. Not named in any ledger yet: it reuses the plan's one numeric
 * floor (§7 "70%") until the attorney-adjudicated ledgers set their own
 * `thresholds.minPrecision`.
 */
export const VERDICT_PRECISION_FLOOR = 0.7

/**
 * Plan §7 go-live gates: "cost per bucket measured and Extended above the
 * 70% floor" — the Extended rung ($349, price-book COUNSEL_EXTENDED) must
 * keep a gross margin of at least 70% on the measured per-record cost. The
 * gate applies it to the bucket the eval record classified into when both
 * the cost and the rung price are known.
 */
export const EXTENDED_MARGIN_FLOOR = 0.7

export interface GateCostInput {
  bucket: RecordBucket | null | undefined
  /** CostRecord total for the eval case, in cents. */
  costCents: number | null | undefined
  /** The rung price for that bucket, in cents (null when the bucket has no price, e.g. LONG). */
  priceCents?: number | null
}

export interface GateVerdict {
  pass: boolean
  /** Machine-readable reasons, empty on a pass. Order is stable. */
  reasons: string[]
  recall: number
  precision: number | null
  /** Gross margin on the rung price when the cost check ran, else null. */
  margin: number | null
}

const share = (n: number) => `${Math.round(n * 100)}%`

/**
 * The gate. Pure: the same ledger and scorecard always give the same answer.
 *
 *  - must-find: `recall >= minRecall` (ledger threshold, else every canary);
 *    each missed canary is its own reason so the step summary can list them.
 *  - verdicts: when the ledger carries attorney verdicts, `precision >=
 *    minPrecision` (ledger threshold, else VERDICT_PRECISION_FLOOR).
 *  - cost: when `cost` names an EXTENDED bucket with a price and a measured
 *    cost, the margin must clear EXTENDED_MARGIN_FLOOR.
 *
 * A ledger with no canaries cannot pass: there is nothing to prove.
 */
export function gateVerdict(ledger: GateLedger, scorecard: GateScorecard, cost?: GateCostInput): GateVerdict {
  const reasons: string[] = []
  const minRecall = ledger.thresholds?.minRecall ?? MUST_FIND_RECALL_FLOOR
  const minPrecision = ledger.thresholds?.minPrecision ?? VERDICT_PRECISION_FLOOR

  if (scorecard.mustFindTotal === 0 || ledger.mustFind.length === 0) {
    reasons.push('no_canaries: the ledger names nothing the engine must find')
  }
  if (scorecard.recall < minRecall) {
    reasons.push(`recall_below_floor: ${share(scorecard.recall)} found, floor ${share(minRecall)}`)
    for (const m of scorecard.missed) reasons.push(`missed:${m.id}`)
  }

  const verdicts = ledger.verdicts ?? []
  if (verdicts.length > 0) {
    if (scorecard.precision == null) {
      reasons.push('precision_missing: the ledger carries verdicts but the scorecard has no precision')
    } else if (scorecard.precision < minPrecision) {
      reasons.push(`precision_below_floor: ${share(scorecard.precision)} agree or partly, floor ${share(minPrecision)}`)
    }
  }

  let margin: number | null = null
  if (cost && cost.bucket === 'EXTENDED' && cost.costCents != null && cost.priceCents != null && cost.priceCents > 0) {
    margin = (cost.priceCents - cost.costCents) / cost.priceCents
    if (margin < EXTENDED_MARGIN_FLOOR) {
      reasons.push(`cost_margin_below_floor: EXTENDED margin ${share(margin)} on ${cost.costCents}¢ against ${cost.priceCents}¢, floor ${share(EXTENDED_MARGIN_FLOOR)}`)
    }
  }

  return { pass: reasons.length === 0, reasons, recall: scorecard.recall, precision: scorecard.precision, margin }
}

export interface BucketCost {
  /** Runs with a measured cost in this bucket. */
  n: number
  /** Mean cost per run in cents; null until a run has a cost. */
  meanCents: number | null
  totalCents: number
  /** Runs that landed in this bucket but have no cost yet (queued, running, failed before telemetry). */
  unpriced: number
}

export type CostPerBucket = Record<RecordBucket, BucketCost>

/**
 * Cost per record bucket over a set of eval runs (plan §7 "cost per bucket
 * measured"). Every bucket is present so the table never has a missing row;
 * runs without a bucket are ignored; runs with a bucket but no cost are
 * counted as `unpriced` and never pull the mean down.
 */
export function costPerBucket(runs: ReadonlyArray<{ bucket?: string | null; costCents?: number | null }>): CostPerBucket {
  const out = {} as CostPerBucket
  for (const b of RECORD_BUCKETS) out[b] = { n: 0, meanCents: null, totalCents: 0, unpriced: 0 }
  for (const r of runs) {
    const bucket = r.bucket as RecordBucket | null | undefined
    if (!bucket || !(RECORD_BUCKETS as readonly string[]).includes(bucket)) continue
    const row = out[bucket]
    if (r.costCents == null || !Number.isFinite(r.costCents)) {
      row.unpriced++
      continue
    }
    row.n++
    row.totalCents += r.costCents
  }
  for (const b of RECORD_BUCKETS) {
    const row = out[b]
    row.meanCents = row.n > 0 ? Math.round(row.totalCents / row.n) : null
  }
  return out
}
