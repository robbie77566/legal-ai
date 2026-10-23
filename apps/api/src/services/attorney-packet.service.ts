import prisma, { withTenant } from '@hg/database';
import { computeDeadlinePosture, caseLabel, caseRef, type DeadlineInputs } from '@hg/case-lifecycle';
import type { AttorneyPacketInput, ReportFinding } from '@hg/reports';
import { summaryRowsForReport } from './case-summary.service';
import { bottomLineFor } from './bottom-line.service';
import { verifyFindings } from './analysis.service';
import { attachConfidence } from './finding-confidence.service';

/**
 * The sealed attorney packet's input (UPL review 2026-10-23, E2;
 * recommendation 5). Built from the SAME verified snapshot the family
 * report serves — the caller has already run FR-7 at this render and hands
 * over the visible findings — so the packet the family downloads
 * (`GET /cases/:id/attorney-packet.pdf`) and the one the lawyer opens
 * through the share link (`GET /shared/:token`) are the same sections from
 * the same input. The renderer lives in packages/reports/attorney-packet.ts.
 */

export interface AttorneyPacketCase {
  id: string;
  title: string;
  subsequentWrit: boolean;
  county?: string | null;
  convictionYear?: number | null;
  facts?: unknown;
  deadlineFacts?: unknown;
}

export interface AttorneyPacketReport {
  id: string;
  runId: string;
  versionNo: number;
  templateVersion: string;
  renderedAt: Date;
}

/**
 * FR-5: the deadline posture computed fresh on the civil "today" in
 * America/Chicago, stamped "as of", never cached into the snapshot. Null
 * when the family gave no judgment date or the stored facts are malformed —
 * a bad fact never breaks a report or a packet.
 */
export function deadlinePostureFor(kase: { deadlineFacts?: unknown }): ReturnType<typeof computeDeadlinePosture> | null {
  const facts = kase.deadlineFacts as (Omit<DeadlineInputs, 'asOf'> & { judgmentDate: string }) | null | undefined;
  if (!facts?.judgmentDate) return null;
  const asOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  try {
    return computeDeadlinePosture({ ...facts, asOf });
  } catch {
    return null;
  }
}

export async function buildAttorneyPacketInput(src: {
  kase: AttorneyPacketCase;
  report: AttorneyPacketReport;
  /** The findings that verified at this render, confidence attached. */
  visible: ReportFinding[];
  droppedByReverification: number;
  deadlinePosture?: ReturnType<typeof computeDeadlinePosture> | null;
}): Promise<AttorneyPacketInput> {
  const deadlinePosture = src.deadlinePosture === undefined ? deadlinePostureFor(src.kase) : src.deadlinePosture;
  const caseSummary = await summaryRowsForReport(src.report.runId, src.kase);
  return {
    caseTitle: src.kase.title,
    reportId: src.report.id,
    versionNo: src.report.versionNo,
    reportTemplateVersion: src.report.templateVersion,
    renderedAt: src.report.renderedAt,
    subsequentWritMode: src.kase.subsequentWrit,
    findings: src.visible,
    droppedByReverification: src.droppedByReverification,
    caseSummary,
    posture: bottomLineFor(src.visible, src.kase.subsequentWrit, deadlinePosture).forLawyer,
    deadlinePosture,
  };
}

/** The five attorney fields the family payload omits while Part B is sealed. */
export const ATTORNEY_ONLY_FIELDS = ['partBText', 'preserved', 'harmStandard', 'vehicle', 'develop'] as const;

/** A finding as the family payload carries it with Part B sealed: everything but the attorney fields. */
export function stripAttorneyFields<T extends object>(f: T): Omit<T, (typeof ATTORNEY_ONLY_FIELDS)[number]> {
  const out: Record<string, unknown> = { ...(f as Record<string, unknown>) };
  for (const k of ATTORNEY_ONLY_FIELDS) delete out[k];
  return out as Omit<T, (typeof ATTORNEY_ONLY_FIELDS)[number]>;
}

export type AttorneyPacketLoad =
  | { status: 'gone' }
  | { status: 'ok'; input: AttorneyPacketInput; versionNo: number };

/**
 * The clinic inbox's packet (UPL review 2026-10-23, P3): the attorney
 * content the consent names, read under the FAMILY's tenant exactly as the
 * share link reads it — the report the delivery points at, FR-7 re-verified
 * at this render, confidence attached — and built through the SAME input
 * builder as the family's sealed download and the share link, so the three
 * never drift. The case is labelled county · year and reference, never the
 * family's own title.
 */
export async function loadAttorneyPacket(caseId: string, reportId: string, opts: { compress?: boolean } = {}): Promise<AttorneyPacketLoad> {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.status === 'DELETED') return { status: 'gone' };
  return withTenant(kase.tenantId, async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report || report.caseId !== caseId) return { status: 'gone' as const };
    const snapshot = report.findingsSnapshot as unknown as { findings: Array<ReportFinding & { id: string }> };
    const { verified, failed } = await verifyFindings(tx, snapshot.findings.map((f) => f.id));
    const visible = (await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)))) as unknown as ReportFinding[];
    const input = await buildAttorneyPacketInput({
      kase: {
        ...kase,
        title: `${caseLabel({ county: kase.county, convictionYear: kase.convictionYear, createdAt: kase.createdAt })} · ${caseRef(kase.id)}`,
      },
      report,
      visible,
      droppedByReverification: failed.length,
    });
    return { status: 'ok' as const, versionNo: report.versionNo, input: { ...input, compress: opts.compress } };
  });
}
