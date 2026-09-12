import prisma, { withTenant } from '@hg/database';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { computeDeadlinePosture, type DeadlineInputs } from '@hg/case-lifecycle';
import { s3, bucket } from './storage.service';
import { verifyFindings } from './analysis.service';
import { listSupportNotes, listRequests } from './staff-requests.service';

/**
 * The staff "case file" (staff_console_access_model §5, Support): everything
 * customer-facing about one case — the uploads, the analysis, and what the
 * family has actually received — read on the owner connection because staff
 * hold no CaseAccess row. Read-only; the two download paths below audit.
 */

const caseSelect = {
  id: true, title: true, status: true, lane: true, tenantId: true, subsequentWrit: true,
  ocrHalt: true, delayOurs: true, expectedReadyAt: true, slaStartedAt: true, createdAt: true, updatedAt: true,
} as const;

export async function getCaseFile(caseId: string) {
  const kase = await prisma.case.findUnique({ where: { id: caseId }, select: caseSelect });
  if (!kase) return null;

  const [owner, documents, findings, runs, reports, shareLinks, screenEvents, notes, requests] = await Promise.all([
    prisma.caseAccess.findFirst({ where: { caseId, role: 'ADMIN' }, select: { userId: true } }),
    prisma.document.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true, s3Key: true, createdAt: true, suggestedChecklistItemId: true, classificationConfirmed: true, quarantined: true },
    }),
    prisma.finding.findMany({ where: { caseId }, include: { citations: true }, orderBy: [{ severity: 'asc' }, { confidence: 'desc' }] }),
    prisma.analysisRun.findMany({ where: { caseId }, orderBy: { runNo: 'desc' } }),
    prisma.report.findMany({ where: { caseId }, orderBy: { versionNo: 'desc' } }),
    prisma.shareLink.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' } }),
    prisma.caseEvent.findMany({ where: { caseId, type: 'screen.completed' }, select: { payload: true, createdAt: true } }),
    listSupportNotes(caseId),
    listRequests({ caseId }),
  ]);

  const pages = documents.length
    ? await prisma.documentPage.findMany({
        where: { documentId: { in: documents.map((d) => d.id) } },
        select: { documentId: true, billable: true, ocrConfidence: true, ocrProvider: true },
      })
    : [];
  const pagesOf = new Map<string, typeof pages>();
  for (const p of pages) pagesOf.set(p.documentId, [...(pagesOf.get(p.documentId) ?? []), p]);

  const customer = owner ? await prisma.user.findUnique({ where: { id: owner.userId }, select: { email: true, name: true } }) : null;
  const approverIds = [...new Set(reports.map((r) => r.approvedBy).filter((a) => a !== 'auto_qa'))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, email: true } })
    : [];
  const approverEmail = new Map(approvers.map((u) => [u.id, u.email]));

  const findingsByRun = new Map<string, typeof findings>();
  for (const f of findings) findingsByRun.set(f.runId, [...(findingsByRun.get(f.runId) ?? []), f]);

  return {
    case: {
      ...kase,
      customerEmail: customer?.email ?? null,
      customerName: customer?.name ?? null,
    },
    meter: {
      billable: pages.filter((p) => p.billable).length,
      duplicatesIgnored: pages.filter((p) => !p.billable).length,
    },
    documents: documents.map((d) => {
      const ps = pagesOf.get(d.id) ?? [];
      const providers = ps.map((p) => p.ocrProvider).filter((x): x is string => !!x);
      const provider = providers.length
        ? [...new Set(providers)].sort((a, b) => providers.filter((x) => x === b).length - providers.filter((x) => x === a).length)[0]
        : null;
      const confidences = ps.map((p) => p.ocrConfidence).filter((c): c is number => c != null);
      return {
        id: d.id,
        filename: d.filename,
        receivedAt: d.createdAt,
        pages: ps.length,
        billablePages: ps.filter((p) => p.billable).length,
        ocrProvider: provider,
        minOcrConfidence: confidences.length ? Math.min(...confidences) : null,
        recognized: !!d.suggestedChecklistItemId,
        classificationConfirmed: d.classificationConfirmed,
        quarantined: d.quarantined,
        downloadable: !!d.s3Key && !d.quarantined,
      };
    }),
    runs: runs.map((run, i) => {
      const newer = runs[i - 1];
      const screensDone = screenEvents
        .filter((e) => e.createdAt >= run.startedAt && (!newer || e.createdAt < newer.startedAt))
        .map((e) => (e.payload as { screen?: string }).screen)
        .filter((s): s is string => !!s);
      return {
        id: run.id,
        runNo: run.runNo,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        screensDone: [...new Set(screensDone)],
        findings: (findingsByRun.get(run.id) ?? []).map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          confidence: f.confidence,
          adjudication: f.adjudication,
          provenance: f.provenance,
          partAText: f.partAText,
          partBText: f.partBText,
          citations: f.citations.map((c) => ({ volume: c.volume, page: c.page, line: c.line, excerpt: c.excerpt })),
        })),
      };
    }),
    reports: reports.map((r) => ({
      id: r.id,
      versionNo: r.versionNo,
      templateVersion: r.templateVersion,
      renderedAt: r.renderedAt,
      approvedBy: r.approvedBy,
      approvedByEmail: r.approvedBy === 'auto_qa' ? 'auto_qa' : approverEmail.get(r.approvedBy) ?? r.approvedBy,
      findingsCount: ((r.findingsSnapshot as { findings?: unknown[] })?.findings ?? []).length,
    })),
    notes,
    requests,
    shareLinks: shareLinks.map((s) => {
      const log = (Array.isArray(s.accessLog) ? s.accessLog : []) as Array<Record<string, unknown>>;
      const last = log.at(-1);
      return {
        id: s.id,
        reportId: s.reportId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        opens: log.length,
        lastOpenedAt: (last?.at ?? last?.openedAt ?? null) as string | null,
      };
    }),
  };
}

/** Same presign as the customer's download, minus the CaseAccess gate. */
export async function staffDocumentDownloadUrl(caseId: string, docId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: docId, caseId },
    select: { id: true, filename: true, s3Key: true, quarantined: true, case: { select: { tenantId: true } } },
  });
  if (!doc || doc.quarantined || !doc.s3Key) return null;
  const url = await getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: doc.s3Key,
      ResponseContentDisposition: `attachment; filename="${doc.filename.replace(/[^\w.\- ]/g, '_')}"`,
    }),
    { expiresIn: 300 }
  );
  return { url, filename: doc.filename, tenantId: doc.case.tenantId };
}

interface SnapshotFinding {
  id: string;
  category: string;
  severity: string;
  confidence?: number;
  partAText: string;
  partBText: string;
  citations: { volume: string | null; page: number | null; excerpt: string }[];
}

/**
 * The family's PDF, re-rendered exactly as the customer route renders it
 * (FR-7 re-verification included) — a report is never stored as a file.
 * Any released version is available to staff regardless of case status:
 * a refunded family still received their report.
 */
export async function staffReportPdf(caseId: string, versionNo?: number) {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) return null;
  return withTenant(kase.tenantId, async (tx) => {
    const report = await tx.report.findFirst({
      where: { caseId, ...(versionNo ? { versionNo } : {}) },
      orderBy: { versionNo: 'desc' },
    });
    if (!report) return null;
    const snapshot = report.findingsSnapshot as unknown as { findings: SnapshotFinding[] };
    const { verified, failed } = await verifyFindings(tx, snapshot.findings.map((f) => f.id));
    const { attachConfidence } = await import('./finding-confidence.service');
    const visible = await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)));

    let deadlinePosture: ReturnType<typeof computeDeadlinePosture> | null = null;
    const facts = (kase as { deadlineFacts?: unknown }).deadlineFacts as
      | (Omit<DeadlineInputs, 'asOf'> & { judgmentDate: string })
      | null
      | undefined;
    if (facts?.judgmentDate) {
      const asOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      try {
        deadlinePosture = computeDeadlinePosture({ ...facts, asOf });
      } catch {
        deadlinePosture = null;
      }
    }

    const { renderReportPdf } = await import('@hg/reports');
    const { summaryRowsForReport, summaryGapForReport } = await import('./case-summary.service');
    const { PRICES_CENTS } = await import('./payments.service');
    const summaryRowsList = await summaryRowsForReport(report.runId, kase as { county?: string | null; convictionYear?: number | null; facts?: unknown; deadlineFacts?: unknown });
    const { bottomLineFor } = await import('./bottom-line.service');
    const pdf = await renderReportPdf({
      palette: 'harbor',
      bottomLine: bottomLineFor(visible, kase.subsequentWrit, deadlinePosture),
      summary: summaryRowsList,
      summaryGap: await summaryGapForReport(caseId, summaryRowsList),
      rerunPriceCents: PRICES_CENTS.rerun,
      caseTitle: kase.title,
      reportId: report.id,
      versionNo: report.versionNo,
      templateVersion: report.templateVersion,
      renderedAt: report.renderedAt,
      subsequentWritMode: kase.subsequentWrit,
      deadlinePosture,
      strongSignals: visible.filter((f) => f.severity === 'dispositive'),
      possibleIssues: visible.filter((f) => f.severity !== 'dispositive'),
      droppedByReverification: failed.length,
    });
    return { pdf, versionNo: report.versionNo, tenantId: kase.tenantId, filename: `family-case-review-${caseId}-v${report.versionNo}.pdf` };
  });
}
