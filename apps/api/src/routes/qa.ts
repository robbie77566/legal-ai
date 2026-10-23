import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lintPartA } from '../services/readability';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from '../services/audit.service';
import { verifyFindings } from '../services/analysis.service';
import { caseLabel, caseRef, PreservedSchema, HARM_VALUES, vehicleFor } from '@hg/case-lifecycle';

/**
 * QA console API (US-8). A STAFF surface: reviewers are platform staff
 * (ATTORNEY/ADMIN roles) reviewing cases across consumer tenants — reads use
 * the owner connection deliberately (system surface, role-gated); every
 * mutation runs tenant-scoped and is audit-logged. Approval snapshots the
 * exact findings READY will render (ENG-8) after FR-7 re-verification.
 */

const QA_ROLES = new Set(['ADMIN', 'ATTORNEY']);
import { TEMPLATE_VERSION } from '../services/report-template';

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
      select: { id: true, title: true, lane: true, subsequentWrit: true, tenantId: true, updatedAt: true, county: true, convictionYear: true, createdAt: true },
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
    return {
      case: { id: kase.id, title: caseLabel(kase), ref: caseRef(kase.id), lane: kase.lane, status: kase.status, subsequentWrit: kase.subsequentWrit },
      run,
      findings: findings.map((f) => ({ ...f, readability: lintPartA(f.partAText) })),
    };
  });

  // US-6 re-run diff: latest two completed runs, keyed by stableKey —
  // what the re-run added, what it no longer finds, what carried over.
  fastify.get('/cases/:id/run-diff', async (request, reply) => {
    const { id } = request.params as { id: string };
    const runs = await prisma.analysisRun.findMany({
      where: { caseId: id, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 2,
    });
    if (runs.length < 2) return reply.status(404).send({ error: 'Fewer than two completed runs' });
    const [latest, prior] = runs;
    const pick = { id: true, stableKey: true, category: true, severity: true, confidence: true, partBText: true };
    const [latestF, priorF] = await Promise.all([
      prisma.finding.findMany({ where: { runId: latest.id }, select: pick }),
      prisma.finding.findMany({ where: { runId: prior.id }, select: pick }),
    ]);
    const priorKeys = new Map(priorF.map((f) => [f.stableKey, f]));
    const latestKeys = new Set(latestF.map((f) => f.stableKey));
    const summarize = (f: { id: string; category: string; severity: string; confidence: number; partBText: string }) => ({
      id: f.id, category: f.category, severity: f.severity, confidence: f.confidence,
      summary: f.partBText.slice(0, 160),
    });
    return {
      latestRunId: latest.id,
      priorRunId: prior.id,
      added: latestF.filter((f) => !priorKeys.has(f.stableKey)).map(summarize),
      removed: priorF.filter((f) => !latestKeys.has(f.stableKey)).map(summarize),
      kept: latestF.filter((f) => priorKeys.has(f.stableKey)).map(summarize),
    };
  });

  // Reading-level edits to Part A (US-8): provenance flips, audit-logged.
  // Widened for the professional era (workstream G): a reviewer may also
  // correct the attorney text, the harm standard and the develop step —
  // the fields the counsel packet prints. Same provenance mark, same
  // event, one QA_EDIT row naming the fields and the before/after of the
  // structured ones.
  //
  // The licence rule (UPL review 2026-10-23, recommendation 9, P10): the
  // legal text — partAText, partBText, harmStandard, develop — is edited
  // only by a staff member whose account carries a verified bar number
  // (recorded by an Admin on the Team page). `preserved` is a reading of
  // the record (objection and ruling on the page) and stays open to every
  // reviewer. Refusal: 403 { reason: 'LICENCE_REQUIRED' }.
  const LICENSED_FIELDS = ['partAText', 'partBText', 'harmStandard', 'develop'] as const;
  const QaPatchSchema = z
    .object({
      partAText: z.string().min(1).max(2000).optional(),
      preserved: PreservedSchema.optional(),
      partBText: z.string().min(1).max(8000).optional(),
      harmStandard: z.enum(HARM_VALUES).optional(),
      develop: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change');
  fastify.patch('/findings/:findingId', async (request, reply) => {
    const { findingId } = request.params as { findingId: string };
    const body = QaPatchSchema.parse(request.body ?? {});
    const { partAText, preserved, partBText, harmStandard, develop } = body;

    const finding = await prisma.finding.findUnique({ where: { id: findingId } });
    if (!finding) return reply.status(404).send({ error: 'Not found' });

    const touchesLegalText = LICENSED_FIELDS.some((k) => body[k] !== undefined);
    if (touchesLegalText) {
      const editor = await prisma.user.findUnique({ where: { id: request.auth.userId }, select: { barVerifiedAt: true, barVerificationStatus: true } });
      if (!editor?.barVerifiedAt || editor.barVerificationStatus === 'REJECTED') {
        return reply.status(403).send({
          error: 'Editing the legal text of a finding needs a bar number on your staff account — an Ops administrator records it on the Team page. The preservation call stays open to every reviewer.',
          reason: 'LICENCE_REQUIRED',
          fields: LICENSED_FIELDS.filter((k) => body[k] !== undefined),
        });
      }
    }

    // The vehicle is derived, never asserted: it follows the preservation
    // call and the harm standard whenever either changes.
    const vehicleChanges = preserved !== undefined || harmStandard !== undefined;
    const vehicle = vehicleChanges
      ? vehicleFor({ screen: finding.screen, category: finding.category, preserved: preserved ?? finding.preserved, harmStandard: harmStandard ?? finding.harmStandard })
      : undefined;
    const updated = await withTenant(finding.tenantId, async (tx) => {
      const u = await tx.finding.update({
        where: { id: findingId },
        data: {
          ...(partAText !== undefined ? { partAText } : {}),
          ...(partBText !== undefined ? { partBText } : {}),
          ...(preserved !== undefined ? { preserved } : {}),
          ...(harmStandard !== undefined ? { harmStandard } : {}),
          ...(develop !== undefined ? { develop: develop || null } : {}),
          ...(vehicle !== undefined ? { vehicle } : {}),
          provenance: 'ai_human_edited',
        },
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
    const lint = lintPartA(updated.partAText);
    const fields = (Object.keys(body) as Array<keyof typeof body>).filter((k) => body[k] !== undefined);
    const structured = fields.filter((k) => k === 'preserved' || k === 'harmStandard' || k === 'develop');
    await AuditService.log({
      tenantId: finding.tenantId,
      caseId: finding.caseId,
      action: LogAction.QA_EDIT,
      userId: request.auth.userId,
      details: {
        findingId,
        fields,
        // Free text is not repeated into the audit row; the structured fields are.
        before: Object.fromEntries(structured.map((k) => [k, finding[k]])),
        after: Object.fromEntries(structured.map((k) => [k, updated[k]])),
        ...(vehicle !== undefined ? { vehicle: { before: finding.vehicle, after: updated.vehicle } } : {}),
      },
    });
    return { ...updated, readability: lint };
  });

  // Spot-check feed: recently auto-approved cases (flagged first) so the
  // founder reviews AFTER delivery — never blocking it.
  fastify.get('/auto-approved', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'QA_DECISION' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const auto = rows.filter((r) => (r.details as { decision?: string })?.decision === 'auto_approved');
    const cases = await prisma.case.findMany({
      where: { id: { in: auto.map((a) => a.caseId!).filter(Boolean) } },
      select: { id: true, title: true, status: true, county: true, convictionYear: true, createdAt: true },
    });
    const byId = new Map(cases.map((c) => [c.id, c]));
    return auto.map((a) => ({
      caseId: a.caseId,
      title: (() => { const c = byId.get(a.caseId!); return c ? caseLabel(c) : a.caseId; })(),
      ref: caseRef(a.caseId),
      status: byId.get(a.caseId!)?.status,
      approvedAt: a.createdAt,
      spotcheck: Boolean((a.details as { spotcheck?: boolean })?.spotcheck),
    })).sort((x, y) => Number(y.spotcheck) - Number(x.spotcheck));
  });

  // Hold queue (auto_qa_hold_workflow.md R3): held cases with reasons and
  // the 24-hour countdown, most urgent first.
  fastify.get('/holds', async () => {
    const held = await prisma.case.findMany({ where: { status: 'QA_REVIEW' }, select: { id: true, title: true, tenantId: true, county: true, convictionYear: true, createdAt: true } });
    const out: { caseId: string; title: string; ref: string; reasons: string[]; heldAt: string; slaRemainingHours: number }[] = [];
    for (const c of held) {
      const audits = await prisma.auditLog.findMany({
        where: { caseId: c.id, action: 'QA_DECISION' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const hold = audits.find((a) => (a.details as { decision?: string })?.decision === 'auto_hold');
      if (!hold) continue; // in QA_REVIEW but not via an auto-hold (manual-mode case)
      const heldAt = hold.createdAt;
      out.push({
        caseId: c.id,
        title: caseLabel(c),
        ref: caseRef(c.id),
        reasons: ((hold.details as { reasons?: string[] })?.reasons) ?? [],
        heldAt: heldAt.toISOString(),
        slaRemainingHours: Math.round(((heldAt.getTime() + 24 * 3600_000) - Date.now()) / 3600_000 * 10) / 10,
      });
    }
    return out.sort((a, b) => a.slaRemainingHours - b.slaRemainingHours);
  });

  // One-click corrective action (R4): the same reject(quality)->re-enqueue
  // loop the ops scripts use — one re-run path everywhere.
  fastify.post('/cases/:id/rerun', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase || kase.status !== 'QA_REVIEW') {
      return reply.status(409).send({ error: 'Case is not in quality review' });
    }
    await withTenant(kase.tenantId, async (tx) => {
      await appendCaseEvent(tx, {
        caseId: id, tenantId: kase.tenantId, type: 'qa.rejected',
        payload: { reason: 'quality' }, actor: request.auth.userId, transition: 'QA_REJECTED',
      });
    });
    try {
      const { enqueueAnalysis } = await import('../services/queue');
      const { Queue } = await import('bullmq');
      const { createConnection } = await import('../lib/redis');
      const q = new Queue('analysis', { connection: createConnection() });
      const existing = await q.getJob(`analysis-${id}`);
      if (existing) await existing.remove().catch(() => {});
      await q.close();
      await enqueueAnalysis(id, kase.tenantId);
    } catch (e) {
      request.log.error({ err: e }, 're-run enqueue failed — case parked at QA_REJECTED');
    }
    await AuditService.log({
      tenantId: kase.tenantId, caseId: id, action: LogAction.QA_DECISION,
      userId: request.auth.userId, details: { decision: 'hold_rerun' },
    });
    return { ok: true };
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
            confidence: f.confidence,
              provenance: f.provenance,
              partAText: f.partAText,
              partBText: f.partBText,
              preserved: f.preserved ?? undefined,
              harmStandard: f.harmStandard ?? undefined,
              vehicle: f.vehicle ?? undefined,
              develop: f.develop ?? undefined,
              dependsOn: f.dependsOn ?? [],
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

      // Report-ready email to the case owner (ENG-9). READY -> DELIVERED
      // stays gated on real delivery confirmation once bounce webhooks land.
      const ownerAccess = await tx.caseAccess.findFirst({ where: { caseId: id, role: 'ADMIN' } });
      const owner = ownerAccess
        ? await prisma.user.findUnique({ where: { id: ownerAccess.userId } })
        : null;
      const { capture } = await import('../services/analytics.service');
      capture('snl.report_approved', kase.tenantId, {});
      if (owner?.email) {
        const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
        const { sendReportReady } = await import('@hg/email');
        void sendReportReady(owner.email, { caseUrl: `${origin}/case/${id}/report` });
      }

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
