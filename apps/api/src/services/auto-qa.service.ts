import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { verifyFindings } from './analysis.service';
import { AuditService, LogAction } from './audit.service';
import type { AnalysisSummary } from './analysis.service';

/**
 * Auto-approval (PO decision 2026-09-01: the founder spot-checks, but a
 * human must never be the turnaround bottleneck). OFF by default —
 * AUTO_APPROVE=1 enables, and the go-live gate requires validation plus
 * counsel sign-off on the rewritten disclosures BEFORE production enables
 * it (runbook).
 *
 * Runtime quality gates — a run auto-delivers ONLY when it looks like a
 * healthy run; anything suspicious stays in QA_REVIEW for the human:
 *  - every screen completed;
 *  - at least AUTO_APPROVE_MIN_FINDINGS persisted (default 1 — a zero-
 *    finding TRIAL run smells like engine failure, not innocence);
 *  - grounding drop ratio ≤ AUTO_APPROVE_MAX_DROP_RATIO (default 0.5) —
 *    the fresh-regression RED run measured 0.40 vs the healthy 0.125,
 *    so runaway dropping routes to a human;
 *  - FR-7 verification passes (as in the manual gate — never waived).
 *
 * Spot-checks: AUTO_APPROVE_SPOTCHECK_PERCENT (default 10) of auto-
 * approved cases are flagged in the audit log for after-the-fact review
 * via GET /qa/auto-approved — delivery is never delayed by the flag.
 */

const TEMPLATE_VERSION = 'AB-v1';

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function autoApproveEnabled(): boolean {
  return process.env.AUTO_APPROVE === '1';
}

export interface AutoQaResult {
  outcome: 'approved' | 'held' | 'disabled';
  reasons?: string[];
  reportId?: string;
  spotcheck?: boolean;
}

export async function autoApproveCase(
  caseId: string,
  tenantId: string,
  summary: AnalysisSummary & { screensExpected: number }
): Promise<AutoQaResult> {
  if (!autoApproveEnabled()) return { outcome: 'disabled' };

  const minFindings = num(process.env.AUTO_APPROVE_MIN_FINDINGS, 1);
  const maxDropRatio = num(process.env.AUTO_APPROVE_MAX_DROP_RATIO, 0.5);
  const dropRatio =
    summary.findingsPersisted + summary.droppedUngrounded === 0
      ? 0
      : summary.droppedUngrounded / (summary.findingsPersisted + summary.droppedUngrounded);

  const reasons: string[] = [];
  if (summary.screensRun < summary.screensExpected)
    reasons.push(`screens ${summary.screensRun}/${summary.screensExpected}`);
  if (summary.findingsPersisted < minFindings)
    reasons.push(`findings ${summary.findingsPersisted} < ${minFindings}`);
  if (dropRatio > maxDropRatio) reasons.push(`drop ratio ${dropRatio.toFixed(2)} > ${maxDropRatio}`);

  if (reasons.length > 0) {
    console.warn(`[auto-qa] case ${caseId} HELD for human review: ${reasons.join('; ')}`);
    await AuditService.log({
      tenantId,
      caseId,
      action: LogAction.QA_DECISION,
      userId: 'auto_qa',
      details: { decision: 'auto_hold', reasons },
    });
    return { outcome: 'held', reasons };
  }

  const spotcheck = Math.random() * 100 < num(process.env.AUTO_APPROVE_SPOTCHECK_PERCENT, 10);

  const result = await withTenant(tenantId, async (tx) => {
    const kase = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
    if (kase.status !== 'QA_REVIEW') throw new Error(`auto-approve requires QA_REVIEW, got ${kase.status}`);

    const run = await tx.analysisRun.findFirst({ where: { caseId }, orderBy: { runNo: 'desc' } });
    const findings = await tx.finding.findMany({
      where: { runId: run?.id ?? '' },
      include: { citations: true },
    });

    // FR-7 at the approval gate — identical to the human path, never waived.
    const { failed } = await verifyFindings(tx, findings.map((f) => f.id));
    if (failed.length > 0) throw new Error(`FR-7 verification failed for ${failed.length} finding(s)`);

    const versionNo = (await tx.report.count({ where: { caseId } })) + 1;
    const report = await tx.report.create({
      data: {
        caseId,
        tenantId,
        runId: run?.id ?? '',
        versionNo,
        templateVersion: TEMPLATE_VERSION,
        approvedBy: 'auto_qa',
        findingsSnapshot: {
          findings: findings.map((f) => ({
            id: f.id,
            category: f.category,
            severity: f.severity,
            provenance: f.provenance,
            partAText: f.partAText,
            partBText: f.partBText,
            citations: f.citations.map((c) => ({
              volume: c.volume,
              page: c.page,
              line: c.line,
              excerpt: c.excerpt,
            })),
          })),
        },
      },
    });

    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'qa.approved',
      payload: { reportId: report.id },
      actor: 'auto_qa', transition: 'READY',
    });
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'report.rendered',
      payload: { reportId: report.id, templateVersion: TEMPLATE_VERSION },
      actor: 'system',
    });

    const ownerAccess = await tx.caseAccess.findFirst({ where: { caseId, role: 'ADMIN' } });
    return { report, versionNo, ownerUserId: ownerAccess?.userId };
  });

  await AuditService.log({
    tenantId,
    caseId,
    action: LogAction.QA_DECISION,
    userId: 'auto_qa',
    details: { decision: 'auto_approved', reportId: result.report.id, versionNo: result.versionNo, spotcheck },
  });

  const { capture } = await import('./analytics.service');
  capture('snl.report_approved', tenantId, { auto: true });

  const owner = result.ownerUserId
    ? await prisma.user.findUnique({ where: { id: result.ownerUserId } })
    : null;
  if (owner?.email) {
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    const { sendReportReady } = await import('@hg/email');
    void sendReportReady(owner.email, { caseUrl: `${origin}/case/${caseId}/report` });
  }

  console.log(`[auto-qa] case ${caseId} auto-approved → READY (report ${result.report.id}${spotcheck ? ', SPOT-CHECK flagged' : ''})`);
  return { outcome: 'approved', reportId: result.report.id, spotcheck };
}
