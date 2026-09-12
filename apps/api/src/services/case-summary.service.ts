import prisma from '@hg/database';
import { CaseFactsSchema, summaryRows, summaryGaps, type CaseSummary, type SummaryRow, type SummaryGap } from '@hg/case-lifecycle';

/**
 * The "About this case" rows for a given report: the summary stored on the
 * run that produced the report's findings, with the family's intake facts
 * as labelled fallbacks. Owner client — the run row carries no tenant data.
 */
export async function summaryRowsForReport(
  runId: string,
  kase: { county?: string | null; convictionYear?: number | null; facts?: unknown; deadlineFacts?: unknown }
): Promise<SummaryRow[]> {
  const run = await prisma.analysisRun.findUnique({ where: { id: runId }, select: { summary: true } });
  const parsed = CaseFactsSchema.safeParse(kase.facts ?? {});
  const f = parsed.success ? parsed.data : {};
  const deadline = (kase.deadlineFacts ?? {}) as { judgmentDate?: string };
  return summaryRows((run?.summary ?? null) as CaseSummary | null, {
    county: kase.county ?? f.county ?? null,
    convictionYear: kase.convictionYear ?? f.convictionYear ?? null,
    trialOrPlea: f.trialOrPlea ?? null,
    appeal: f.appeal ?? null,
    priorWrit: f.priorWrit === 'unsure' ? null : (f.priorWrit ?? null),
    judgmentDate: deadline.judgmentDate ?? null,
  });
}

/**
 * Rows the record did not confirm, and which still-needed checklist
 * documents would usually state them (PO, 2026-09-12: "if some missing
 * documents are needed to know this, tell the family which").
 */
export async function summaryGapForReport(caseId: string, rows: SummaryRow[]): Promise<SummaryGap | null> {
  const needed = await prisma.checklistItem.findMany({ where: { caseId, state: 'NEEDED' }, select: { kind: true, label: true }, orderBy: { createdAt: 'asc' } });
  return summaryGaps(rows, needed);
}

export interface SummaryRebuild {
  runId: string | null;
  /** true when a model call ran and something was stored. */
  rebuilt: boolean;
  facts: number;
  reason?: string;
}

/**
 * Backfill: extract the case summary for the latest completed run when it
 * has none (runs before 2026-09-12 never had one). One live model call on
 * the record — the same model, caching and cost recording as the pipeline.
 * Never throws: a failure is reported, not raised.
 */
export async function rebuildCaseSummary(caseId: string): Promise<SummaryRebuild> {
  const run = await prisma.analysisRun.findFirst({ where: { caseId, completedAt: { not: null } }, orderBy: { runNo: 'desc' } });
  if (!run) return { runId: null, rebuilt: false, facts: 0, reason: 'no completed run' };
  if (run.summary) return { runId: run.id, rebuilt: false, facts: Object.keys(run.summary as object).length, reason: 'already extracted' };
  const chunks = await prisma.documentChunk.findMany({
    where: { document: { caseId, quarantined: false } },
    select: { id: true, documentId: true, content: true, metadata: true },
    orderBy: [{ documentId: 'asc' }, { id: 'asc' }],
  });
  if (chunks.length === 0) return { runId: run.id, rebuilt: false, facts: 0, reason: 'no digitized text' };
  const engine = (process.env.ANALYSIS_ENGINES ?? process.env.ANALYSIS_MODEL ?? 'claude-opus-5').split(',')[0].trim();
  const { buildModel } = await import('./analysis-model');
  const model = buildModel(caseId, run.tenantId, engine);
  if (!model) return { runId: run.id, rebuilt: false, facts: 0, reason: 'no model configured' };
  try {
    const { buildCaseSummary, buildRecord } = await import('./analysis.service');
    const summary = await buildCaseSummary(model, buildRecord(chunks), chunks);
    if (!summary) return { runId: run.id, rebuilt: false, facts: 0, reason: 'nothing grounded' };
    await prisma.analysisRun.update({ where: { id: run.id }, data: { summary: summary as object } });
    console.log(`[summary] case ${caseId} run ${run.runNo}: ${Object.keys(summary).length} fact(s) extracted (backfill)`);
    return { runId: run.id, rebuilt: true, facts: Object.keys(summary).length };
  } catch (e) {
    return { runId: run.id, rebuilt: false, facts: 0, reason: (e as Error).message.slice(0, 160) };
  }
}
