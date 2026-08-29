import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from '../services/audit.service';
import { verifyFindings } from '../services/analysis.service';

/**
 * QA console API (US-8). A STAFF surface: reviewers are platform staff
 * (ATTORNEY/ADMIN roles) reviewing cases across consumer tenants — reads use
 * the owner connection deliberately (system surface, role-gated); every
 * mutation runs tenant-scoped and is audit-logged. Approval snapshots the
 * exact findings READY will render (ENG-8) after FR-7 re-verification.
 */

const QA_ROLES = new Set(['ADMIN', 'ATTORNEY']);
const TEMPLATE_VERSION = 'AB-v1';

export default async function qaRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    // Runs after the global auth hook; request.auth is set.
    if (!QA_ROLES.has(request.auth?.role)) {
      return reply.status(403).send({ error: 'QA reviewers only' });
    }
  });

  fastify.get('/queue', async () => {
    const cases = await prisma.case.findMany({
      where: { status: 'QA_REVIEW' },
      select: { id: true, title: true, lane: true, subsequentWrit: true, tenantId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });
    const counts = await prisma.finding.groupBy({
      by: ['caseId'],
      where: { caseId: { in: cases.map((c) => c.id) } },
      _count: true,
    });
    const countMap = new Map(counts.map((c) => [c.caseId, c._count]));
    return cases.map((c) => ({ ...c, findingCount: countMap.get(c.id) ?? 0 }));
  });

  fastify.get('/cases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });

    const run = await prisma.analysisRun.findFirst({
      where: { caseId: id },
      orderBy: { runNo: 'desc' },
    });
    const findings = run
      ? await prisma.finding.findMany({
          where: { runId: run.id },
          include: { citations: true },
          orderBy: [{ adjudication: 'asc' }, { severity: 'asc' }], // disagreements would sort first
        })
      : [];
    return { case: { id: kase.id, title: kase.title, lane: kase.lane, status: kase.status, subsequentWrit: kase.subsequentWrit }, run, findings };
  });

  // Reading-level edits to Part A (US-8): provenance flips, audit-logged.
  fastify.patch('/findings/:findingId', async (request, reply) => {
    const { findingId } = request.params as { findingId: string };
    const { partAText } = z.object({ partAText: z.string().min(1).max(2000) }).parse(request.body);

    const finding = await prisma.finding.findUnique({ where: { id: findingId } });
    if (!finding) return reply.status(404).send({ error: 'Not found' });

    const updated = await withTenant(finding.tenantId, async (tx) => {
      const u = await tx.finding.update({
        where: { id: findingId },
        data: { partAText, provenance: 'ai_human_edited' },
      });
      await appendCaseEvent(tx, {
        caseId: finding.caseId,
        tenantId: finding.tenantId,
        type: 'qa.edited',
        payload: { findingId },
        actor: request.auth.userId,
      });
      return u;
    });
    await AuditService.log({
      tenantId: finding.tenantId,
      caseId: finding.caseId,
      action: LogAction.QA_EDIT,
      userId: request.auth.userId,
      details: { findingId },
    });
    return updated;
  });

  fastify.post('/cases/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase || kase.status !== 'QA_REVIEW') {
      return reply.status(409).send({ error: 'Case is not in quality review' });
    }

    return withTenant(kase.tenantId, async (tx) => {
      const run = await tx.analysisRun.findFirst({ where: { caseId: id }, orderBy: { runNo: 'desc' } });
      const findings = await tx.finding.findMany({
        where: { runId: run?.id ?? '' },
        include: { citations: true },
      });

      // FR-7 at the approval gate: nothing unverifiable gets snapshotted.
      const { failed } = await verifyFindings(tx, findings.map((f) => f.id));
      if (failed.length > 0) {
        return reply.status(409).send({ error: 'Citation re-verification failed', failed });
      }

      const versionNo = (await tx.report.count({ where: { caseId: id } })) + 1;
      const report = await tx.report.create({
        data: {
          caseId: id,
          tenantId: kase.tenantId,
          runId: run?.id ?? '',
          versionNo,
          templateVersion: TEMPLATE_VERSION,
          approvedBy: request.auth.userId,
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
        caseId: id,
        tenantId: kase.tenantId,
        type: 'qa.approved',
        payload: { reportId: report.id },
        actor: request.auth.userId,
        transition: 'READY',
      });
      await appendCaseEvent(tx, {
        caseId: id,
        tenantId: kase.tenantId,
        type: 'report.rendered',
        payload: { reportId: report.id, templateVersion: TEMPLATE_VERSION },
        actor: 'system',
      });

      await AuditService.log({
        tenantId: kase.tenantId,
        caseId: id,
        action: LogAction.QA_DECISION,
        userId: request.auth.userId,
        details: { decision: 'approved', reportId: report.id, versionNo },
      });

      return { reportId: report.id, versionNo };
    });
  });

  fastify.post('/cases/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z
      .object({ reason: z.enum(['citation_failure', 'legal_error', 'quality', 'other']) })
      .parse(request.body);

    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase || kase.status !== 'QA_REVIEW') {
      return reply.status(409).send({ error: 'Case is not in quality review' });
    }

    await withTenant(kase.tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId: id,
        tenantId: kase.tenantId,
        type: 'qa.rejected',
        payload: { reason },
        actor: request.auth.userId,
        transition: 'QA_REJECTED',
      })
    );
    await AuditService.log({
      tenantId: kase.tenantId,
      caseId: id,
      action: LogAction.QA_DECISION,
      userId: request.auth.userId,
      details: { decision: 'rejected', reason },
    });
    return { status: 'QA_REJECTED' };
  });
}
