import { computeDeadlinePosture, type DeadlineInputs } from '@hg/case-lifecycle';
import type { AttorneyPacketInput, ReportFinding } from '@hg/reports';
import { summaryRowsForReport } from './case-summary.service';
import { bottomLineFor } from './bottom-line.service';

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
