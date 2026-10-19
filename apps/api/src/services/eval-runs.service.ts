import prisma, { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import type { EvalRun, EvalRunStatus } from '@prisma/client';
import {
  classifyRecord, costPerBucket, gateVerdict, priceForBucket, DEFAULT_PRICE_BOOK,
  type RecordBucket, type CostPerBucket,
} from '@hg/case-lifecycle';
import { AuditService, LogAction } from './audit.service';
import { listLedgers, loadLedger, scoreCaseRun, type EvalGateResult } from './eval-gate.service';
import { ingestCorpus } from './eval-corpus.service';
import { caseCogs } from './costs.service';
import { recomputeMeter } from './inventory.service';

/**
 * The weekly eval gate (persona_rollout_plan.md §5 J, §7 "What runs on
 * staging" item 2, §8, §9 "eval not re-run (hard gate)"): the PRODUCTION
 * model and prompt set run against every attorney ledger on staging, the
 * scorecard is held to the ledger's rules, and the cost per record bucket
 * is written down — without a human remembering to do it.
 *
 * One EvalRun per ledger per gate run. Each creates a fresh case in the
 * dedicated eval tenant (Organisation.isTest = true, so Money and the
 * professional overview exclude it the way they already exclude every test
 * organisation), ingests the ledger's reference record from the eval-corpus
 * bucket the way the manual procedure did, walks the real pipeline
 * (digitize → DOCS_COMPLETE → the analysis queue, no model override), and
 * scores the completed run with the same scorer the console button uses.
 *
 * The driver is an in-process async loop (the api is one instance on
 * staging): it polls the database for digitization and run completion and
 * never holds a transaction open across the pipeline. A process restart
 * mid-run leaves the row RUNNING; the workflow's 90-minute poll then fails
 * the gate, which is the honest outcome.
 */

export const EVAL_ORGANISATION_NAME = 'Eval gate — reference records';
export const EVAL_TENANT_NAME = 'eval';

/** Poll cadence and ceilings; tests shorten them. */
export const evalGateTiming = {
  pollMs: 15_000,
  /** Every volume digitized (a 1,000-page born-digital record takes minutes; Textract, far longer). */
  digitizeTimeoutMs: 90 * 60_000,
  /** The analysis run completed (production model, every screen, live-sequential). */
  analysisTimeoutMs: 120 * 60_000,
  /** A QUEUED/RUNNING row older than this no longer blocks a new run for its ledger. */
  staleAfterMs: 4 * 60 * 60_000,
};

/** The pipeline steps a test replaces: the S3 ingest and the analysis queue. */
export interface EvalRunDeps {
  ingest: typeof ingestCorpus;
  analyze: (caseId: string, tenantId: string) => Promise<void>;
}

const defaultDeps = (): EvalRunDeps => ({
  ingest: ingestCorpus,
  analyze: async (caseId, tenantId) => {
    const { enqueueAnalysis } = await import('./queue');
    await enqueueAnalysis(caseId, tenantId);
  },
});

/** The dedicated eval tenant and its test organisation, created on first use. */
export async function evalTenant(): Promise<{ tenantId: string; organisationId: string }> {
  const existing = await prisma.organisation.findFirst({ where: { name: EVAL_ORGANISATION_NAME, isTest: true }, select: { id: true, tenantId: true } });
  if (existing) return { tenantId: existing.tenantId, organisationId: existing.id };
  const tenant = await prisma.tenant.create({ data: { name: EVAL_TENANT_NAME } });
  // FAMILY kind on purpose: the analysis path asks a counsel tenant for a
  // settled quote before the first model call (quote.service), and the eval
  // record is never sold. isTest keeps it out of Money and analytics.
  const org = await prisma.organisation.create({ data: { tenantId: tenant.id, kind: 'FAMILY', name: EVAL_ORGANISATION_NAME, isTest: true } });
  return { tenantId: tenant.id, organisationId: org.id };
}

export class EvalRunConflictError extends Error {
  constructor(readonly active: { id: string; ledger: string; status: EvalRunStatus }[]) {
    super('An eval run is already queued or running for that ledger');
  }
}

export interface StartedEvalRun {
  id: string;
  ledger: string;
  caseId: string;
  status: EvalRunStatus;
  startedAt: Date;
}

/**
 * One EvalRun per requested ledger (every committed ledger by default), each
 * with its own fresh case in the eval tenant, then the driver is started
 * for each. Unknown ledger names are refused before anything is created.
 */
export async function startEvalRuns(
  opts: { ledgers?: string[]; triggeredBy: string; deps?: EvalRunDeps; drive?: boolean }
): Promise<StartedEvalRun[]> {
  const known = listLedgers().map((l) => l.name);
  const names = opts.ledgers && opts.ledgers.length > 0 ? [...new Set(opts.ledgers)] : known;
  const unknown = names.filter((n) => !known.includes(n));
  if (unknown.length) throw new RangeError(`No ledger named ${unknown.join(', ')}`);

  const active = await prisma.evalRun.findMany({
    where: { ledger: { in: names }, status: { in: ['QUEUED', 'RUNNING'] }, startedAt: { gte: new Date(Date.now() - evalGateTiming.staleAfterMs) } },
    select: { id: true, ledger: true, status: true },
  });
  if (active.length) throw new EvalRunConflictError(active);

  const { tenantId } = await evalTenant();
  const deps = opts.deps ?? defaultDeps();
  const out: StartedEvalRun[] = [];
  for (const ledger of names) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const caseId = await withTenant(tenantId, async (tx) => {
      const c = await tx.case.create({ data: { title: `Eval · ${ledger} · ${stamp}`, tenantId, lane: 'TRIAL', vehicle: '11.07' } });
      await appendCaseEvent(tx, { caseId: c.id, tenantId, type: 'case.created', payload: { lane: 'TRIAL', vehicle: '11.07' }, actor: opts.triggeredBy });
      await appendCaseEvent(tx, { caseId: c.id, tenantId, type: 'stage.entered', payload: { status: 'AWAITING_DOCS' }, actor: opts.triggeredBy, transition: 'AWAITING_DOCS' });
      return c.id;
    });
    const row = await prisma.evalRun.create({ data: { ledger, caseId, tenantId, triggeredBy: opts.triggeredBy } });
    out.push({ id: row.id, ledger, caseId, status: row.status, startedAt: row.startedAt });
    if (opts.drive !== false) {
      void driveEvalRun(row.id, deps).catch((e) => console.error(`[eval-gate] run ${row.id} driver crashed: ${(e as Error).message}`));
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(label: string, timeoutMs: number, probe: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const got = await probe();
    if (got !== null) return got;
    if (Date.now() >= deadline) throw new Error(`${label} did not finish within ${Math.round(timeoutMs / 60_000)} min`);
    await sleep(evalGateTiming.pollMs);
  }
}

/**
 * Dropped at verification: the share of the findings the screens returned
 * that the verbatim grounding filter refused (screen.completed v2 carries
 * `dropped`). Null when no screen reported a count.
 */
async function droppedAtVerification(caseId: string, runStartedAt: Date, runId: string) {
  const events = await prisma.caseEvent.findMany({
    where: { caseId, type: 'screen.completed', createdAt: { gte: runStartedAt } },
    select: { payload: true },
  });
  let reported = 0;
  let dropped = 0;
  for (const e of events) {
    const p = e.payload as { findingCount?: number; dropped?: number };
    reported += Number(p?.findingCount ?? 0);
    dropped += Number(p?.dropped ?? 0);
  }
  const persisted = await prisma.finding.count({ where: { runId } });
  return { reported, persisted, dropped, ratio: reported > 0 ? dropped / reported : null };
}

function bucketFromInventory(inv: { meteredPages: { reporter: number; clerk: number; exhibit: number; unknown: number; total: number }; bucket: RecordBucket }) {
  // The reference corpora are reporter's-record volumes; when no volume was
  // recognised from the filenames the bucket would read SHORT on zero
  // reporter pages. Count the unlabelled pages as reporter pages instead,
  // and say so on the run.
  if (inv.meteredPages.reporter === 0 && inv.meteredPages.unknown > 0) {
    const c = classifyRecord({ reporterPages: inv.meteredPages.unknown, clerkPages: inv.meteredPages.clerk, exhibitPages: inv.meteredPages.exhibit });
    return { bucket: c.bucket, note: `${inv.meteredPages.unknown} unlabelled pages counted as reporter's record for the bucket` };
  }
  return { bucket: inv.bucket, note: null as string | null };
}

export function priceCentsFor(bucket: RecordBucket | null | undefined): number | null {
  if (!bucket) return null;
  const p = priceForBucket(DEFAULT_PRICE_BOOK, bucket, 'ATTORNEY', new Date().toISOString());
  return p.kind === 'PRICE' ? p.cents : null;
}

/** The whole pipeline for one EvalRun; every outcome lands on the row. */
export async function driveEvalRun(evalRunId: string, deps: EvalRunDeps = defaultDeps()): Promise<EvalRun> {
  const row = await prisma.evalRun.findUniqueOrThrow({ where: { id: evalRunId } });
  const { caseId, tenantId, ledger: ledgerName } = row;
  const actor = row.triggeredBy;
  try {
    await prisma.evalRun.update({ where: { id: evalRunId }, data: { status: 'RUNNING' } });
    const ledger = loadLedger(ledgerName);
    if (!ledger) throw new Error(`No ledger named ${ledgerName}`);

    // 1. The reference record, into the case, through the real digitizer.
    const ingest = await deps.ingest(caseId, tenantId, ledgerName, actor);
    if (ingest.documents === 0) throw new Error('corpus ingest produced no documents');
    await waitFor('digitization', evalGateTiming.digitizeTimeoutMs, async () => {
      const pending = await prisma.document.count({ where: { caseId, quarantined: false, pages: { none: {} } } });
      const total = await prisma.document.count({ where: { caseId, quarantined: false } });
      return pending === 0 && total > 0 ? total : null;
    });

    // 2. Records complete (the family's button, without the family), then the meter.
    const [billablePages, duplicatesIgnored] = await Promise.all([
      prisma.documentPage.count({ where: { document: { caseId }, billable: true } }),
      prisma.documentPage.count({ where: { document: { caseId }, billable: false } }),
    ]);
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, { caseId, tenantId, type: 'docs.complete', payload: { billablePages, duplicatesIgnored }, actor, transition: 'DOCS_COMPLETE' })
    );
    const inventory = await recomputeMeter(caseId, tenantId);
    const { bucket, note: bucketNote } = bucketFromInventory(inventory);
    const { total: _total, ...meteredPages } = inventory.meteredPages;
    await prisma.evalRun.update({ where: { id: evalRunId }, data: { bucket, meteredPages: meteredPages as Prisma.InputJsonObject } });

    // 3. The analysis on the production model and prompt set — no override.
    const runStartedAt = new Date();
    await deps.analyze(caseId, tenantId);
    const run = await waitFor('analysis', evalGateTiming.analysisTimeoutMs, () =>
      prisma.analysisRun.findFirst({ where: { caseId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' } })
    );

    // 4. Score, cost, verdict.
    const scored = await scoreCaseRun(caseId, ledgerName, run.id);
    if ('error' in scored) throw new Error(`scoring failed: ${scored.error}`);
    const cogs = await caseCogs(caseId, tenantId);
    const costCents = Math.round(cogs.totalUsd * 100);
    const drops = await droppedAtVerification(caseId, runStartedAt, run.id);
    const verdict = gateVerdict(ledger, scored.card, { bucket, costCents, priceCents: priceCentsFor(bucket) });
    const scorecard = {
      ...scored.card,
      run: { ...scored.run, startedAt: scored.run.startedAt.toISOString(), completedAt: scored.run.completedAt?.toISOString() ?? null },
      droppedAtVerification: drops,
      cost: { model: cogs.model, ocr: cogs.ocr, totalUsd: cogs.totalUsd },
      margin: verdict.margin,
      priceCents: priceCentsFor(bucket),
      bucketNote,
      ingest: { folder: ingest.folder, documents: ingest.documents, bytes: ingest.bytes },
    };
    const done = await prisma.evalRun.update({
      where: { id: evalRunId },
      data: {
        status: 'SCORED', runId: run.id, scorecard: scorecard as unknown as Prisma.InputJsonObject,
        pass: verdict.pass, reasons: verdict.reasons, costCents, finishedAt: new Date(),
      },
    });
    await AuditService.log({
      tenantId, caseId, action: LogAction.CASE_ACCESS, userId: actor,
      details: { op: 'eval_gate_scored', evalRunId, ledger: ledgerName, runId: run.id, recall: scored.card.recall, pass: verdict.pass, bucket, costCents },
    });
    return done;
  } catch (e) {
    const message = (e as Error).message?.slice(0, 500) ?? 'unknown error';
    console.error(`[eval-gate] run ${evalRunId} (${ledgerName}) FAILED: ${message}`);
    const failed = await prisma.evalRun.update({ where: { id: evalRunId }, data: { status: 'FAILED', error: message, finishedAt: new Date() } });
    await AuditService.log({
      tenantId, caseId, action: LogAction.CASE_ACCESS, userId: actor,
      details: { op: 'eval_gate_failed', evalRunId, ledger: ledgerName, error: message },
    }).catch(() => {});
    return failed;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

type StoredScorecard = Partial<EvalGateResult['card']> & {
  run?: { id: string; runNo: number; model: string | null; promptSet: string | null; promptHash: string | null; findings: number };
  droppedAtVerification?: { reported: number; persisted: number; dropped: number; ratio: number | null };
  margin?: number | null;
  priceCents?: number | null;
  bucketNote?: string | null;
};

export function summarizeEvalRun(r: EvalRun) {
  const card = (r.scorecard ?? {}) as StoredScorecard;
  return {
    id: r.id,
    ledger: r.ledger,
    caseId: r.caseId,
    runId: r.runId,
    status: r.status,
    pass: r.pass,
    reasons: (r.reasons as string[] | null) ?? [],
    bucket: r.bucket,
    meteredPages: r.meteredPages,
    costCents: r.costCents,
    error: r.error,
    triggeredBy: r.triggeredBy,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    summary: r.status === 'SCORED'
      ? {
          mustFindTotal: card.mustFindTotal ?? 0,
          found: card.found?.length ?? 0,
          missed: card.missed?.map((m) => m.id) ?? [],
          recall: card.recall ?? null,
          precision: card.precision ?? null,
          droppedAtVerification: card.droppedAtVerification?.ratio ?? null,
          model: card.run?.model ?? null,
          promptSet: card.run?.promptSet ?? null,
          promptHash: card.run?.promptHash ?? null,
          findings: card.run?.findings ?? null,
          margin: card.margin ?? null,
          priceCents: card.priceCents ?? null,
          bucketNote: card.bucketNote ?? null,
        }
      : null,
  };
}

export type EvalRunSummary = ReturnType<typeof summarizeEvalRun>;

export async function listEvalRuns(opts: { since?: Date; limit?: number } = {}): Promise<{ runs: EvalRunSummary[]; costPerBucket: CostPerBucket; ledgers: ReturnType<typeof listLedgers> }> {
  const rows = await prisma.evalRun.findMany({
    where: opts.since ? { startedAt: { gte: opts.since } } : {},
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(opts.limit ?? 200, 1), 1000),
  });
  return { runs: rows.map(summarizeEvalRun), costPerBucket: costPerBucket(rows.filter((r) => r.status === 'SCORED')), ledgers: listLedgers() };
}

export async function getEvalRun(id: string) {
  const row = await prisma.evalRun.findUnique({ where: { id } });
  if (!row) return null;
  return { ...summarizeEvalRun(row), scorecard: row.scorecard, ledgerSummary: listLedgers().find((l) => l.name === row.ledger) ?? null };
}

export interface EvalGateStatus {
  lastRunAt: string | null;
  /** null until every ledger has a finished run. */
  pass: boolean | null;
  failedLedgers: string[];
  /** Ledgers with no finished run at all. */
  neverRun: string[];
}

/** The Today page's line: the latest finished run per committed ledger. */
export async function evalGateStatus(): Promise<EvalGateStatus> {
  const ledgers = listLedgers().map((l) => l.name);
  const failedLedgers: string[] = [];
  const neverRun: string[] = [];
  let lastRunAt: Date | null = null;
  for (const ledger of ledgers) {
    const latest = await prisma.evalRun.findFirst({ where: { ledger, status: { in: ['SCORED', 'FAILED'] } }, orderBy: { startedAt: 'desc' } });
    if (!latest) { neverRun.push(ledger); continue; }
    if (!lastRunAt || latest.startedAt > lastRunAt) lastRunAt = latest.startedAt;
    if (latest.status === 'FAILED' || latest.pass !== true) failedLedgers.push(ledger);
  }
  const pass = ledgers.length === 0 || neverRun.length === ledgers.length ? null : failedLedgers.length === 0 && neverRun.length === 0;
  return { lastRunAt: lastRunAt?.toISOString() ?? null, pass, failedLedgers, neverRun };
}
