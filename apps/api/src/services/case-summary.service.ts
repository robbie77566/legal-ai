import prisma from '@hg/database';
import { CaseFactsSchema, summaryRows, type CaseSummary, type SummaryRow } from '@hg/case-lifecycle';

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
