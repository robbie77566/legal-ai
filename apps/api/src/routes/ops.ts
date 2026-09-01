import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from '../services/audit.service';
import { getStripe } from '../services/payments.service';

/**
 * Ops console API (US-9, OPS-1..7) — ADMIN-only staff surface. Reads use the
 * owner connection (cross-tenant system surface); every action is
 * audit-logged and event-sourced. "Nothing depends on a developer running
 * SQL" is the whole point of this file.
 */

const STALL_DAYS = 7;

export default async function opsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.auth?.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Ops administrators only' });
    }
  });

  // OPS-1: the case queue with stage, holds, days-in-stage, stall flags.
  fastify.get('/queue', async () => {
    const cases = await prisma.case.findMany({
      where: { status: { notIn: ['DELETED'] } },
      select: {
        id: true, title: true, status: true, lane: true, tenantId: true,
        subsequentWrit: true, ocrHalt: true, delayOurs: true,
        slaStartedAt: true, updatedAt: true, createdAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    });
    const now = Date.now();
    return cases.map((c) => ({
      ...c,
      daysInStage: Math.floor((now - c.updatedAt.getTime()) / 86_400_000),
      stalled:
        c.status === 'AWAITING_DOCS' &&
        now - c.updatedAt.getTime() > STALL_DAYS * 86_400_000,
    }));
  });

  // Full event timeline for a case (the case file).
  fastify.get('/cases/:id/timeline', async (request) => {
    const { id } = request.params as { id: string };
    return prisma.caseEvent.findMany({
      where: { caseId: id },
      orderBy: { id: 'asc' },
      select: { id: true, type: true, version: true, payload: true, actor: true, createdAt: true },
    });
  });

  // NFR-3 retention: cases past the stated 12-month retention window,
  // listed for a HUMAN decision — deletion stays a deliberate OPS-4 act
  // (scoped, certificated), never an automatic sweep.
  fastify.get('/retention-candidates', async () => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const cases = await prisma.case.findMany({
      where: {
        status: { in: ['READY', 'DELIVERED', 'REFUNDED'] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, title: true, status: true, tenantId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
    return { cutoff: cutoff.toISOString(), count: cases.length, cases };
  });

  // Alert drill (readiness P0-10): a deliberate, ADMIN-gated error to
  // verify Sentry capture and alert routing end to end. The correct way
  // to verify Sentry is a real thrown error - no dashboard button does it.
  fastify.get('/sentry-test', async () => {
    throw new Error(`Sentry alert drill — deliberate test error at ${new Date().toISOString()}`);
  });

  // Promo management (promo_codes.md §2 admin JTBD).
  fastify.get('/promos', async () => {
    return prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  });

  fastify.post('/promos', async (request, reply) => {
    const body = z
      .object({
        code: z.string().min(3).max(24),
        amountOffCents: z.number().int().min(1).max(29900),
        maxRedemptions: z.number().int().min(1).max(10000).optional(),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(request.body);
    const { normalizeCode, CODE_SHAPE } = await import('../services/promo.service');
    const code = normalizeCode(body.code);
    if (!CODE_SHAPE.test(code)) {
      return reply.status(400).send({ error: 'Codes are 3-24 letters, numbers, or dashes' });
    }
    try {
      const promo = await prisma.promoCode.create({
        data: {
          code,
          amountOffCents: body.amountOffCents,
          maxRedemptions: body.maxRedemptions,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          createdBy: request.auth.userId,
        },
      });
      await AuditService.log({
        tenantId: request.auth.tenantId,
        caseId: 'promo:' + code, // promo audit rows are not case-bound
        action: LogAction.QA_DECISION,
        userId: request.auth.userId,
        details: { decision: 'promo_created', code, amountOffCents: body.amountOffCents },
      });
      return promo;
    } catch {
      return reply.status(409).send({ error: 'That code already exists' });
    }
  });

  fastify.patch('/promos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { active } = z.object({ active: z.boolean() }).parse(request.body);
    const promo = await prisma.promoCode.update({ where: { id }, data: { active } }).catch(() => null);
    if (!promo) return reply.status(404).send({ error: 'Not found' });
    return promo;
  });

  // Founder weekly read (customer_feedback_program.md 4): every response, raw.
  fastify.get('/feedback', async () => {
    const rows = await prisma.caseFeedback.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 });
    const cases = await prisma.case.findMany({
      where: { id: { in: rows.map((r) => r.caseId) } },
      select: { id: true, title: true },
    });
    const byId = new Map(cases.map((c) => [c.id, c.title]));
    return rows.map((r) => ({ ...r, title: byId.get(r.caseId) ?? r.caseId }));
  });

  // NFR-4: per-case COGS is a single query — tokens/pages are ground
  // truth, dollars are env-rate estimates (see costs.service).
  fastify.get('/cases/:id/cogs', async (request) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUniqueOrThrow({ where: { id }, select: { tenantId: true } });
    const { caseCogs } = await import('../services/costs.service');
    return caseCogs(id, kase.tenantId);
  });

  // OPS-3: the E-6 chargeback-defense packet — disclosure set + ack + IP/UA.
  fastify.get('/cases/:id/disclosure-archive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const acks = await prisma.disclosureAck.findMany({
      where: { caseId: id },
      orderBy: { ackAt: 'asc' },
    });
    if (acks.length === 0) return reply.status(404).send({ error: 'No acknowledgments bound to this case' });
    await AuditService.log({
      tenantId: acks[0].tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'disclosure_archive_export' },
    });
    return { caseId: id, acknowledgments: acks };
  });

  // OPS-7: honest delay — extends the customer's date visibly, never silently.
  fastify.post('/cases/:id/delay-ours', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { extendedToDate } = z.object({ extendedToDate: z.string().date() }).parse(request.body);
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });

    await withTenant(kase.tenantId, async (tx) => {
      await tx.case.update({ where: { id }, data: { expectedReadyAt: new Date(extendedToDate) } });
      await appendCaseEvent(tx, {
        caseId: id, tenantId: kase.tenantId, type: 'delay.ours_marked',
        payload: { extendedToDate }, actor: request.auth.userId, setHold: 'DELAY_OURS',
      });
    });
    await AuditService.log({
      tenantId: kase.tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'delay_ours_marked', extendedToDate },
    });
    return { ok: true };
  });

  fastify.post('/cases/:id/delay-cleared', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    await withTenant(kase.tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId: id, tenantId: kase.tenantId, type: 'delay.ours_cleared',
        payload: {}, actor: request.auth.userId, clearHold: 'DELAY_OURS',
      })
    );
    return { ok: true };
  });

  // OPS-2: audited, Stripe-linked refund. The ledger flip is confirmed by the
  // charge.refunded webhook; the case transition happens here.
  fastify.post('/cases/:id/refund', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z
      .object({ reason: z.enum(['unreadable_record', 'customer_request', 'chargeback', 'other']) })
      .parse(request.body);

    const stripe = getStripe();
    if (!stripe) return reply.status(503).send({ error: 'Payments are not configured' });

    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    const payment = await prisma.payment.findFirst({
      where: { caseId: id, kind: 'REVIEW', status: 'SUCCEEDED' },
    });
    if (!payment) return reply.status(409).send({ error: 'No refundable payment on this case' });

    const session = await stripe.checkout.sessions.retrieve(payment.stripeId);
    if (!session.payment_intent) return reply.status(409).send({ error: 'No payment intent found' });
    await stripe.refunds.create({ payment_intent: String(session.payment_intent) });

    await withTenant(kase.tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId: id, tenantId: kase.tenantId, type: 'payment.refunded',
        payload: { paymentId: payment.stripeId, reason }, actor: request.auth.userId,
        transition: 'REFUNDED',
      })
    );
    await AuditService.log({
      tenantId: kase.tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'refund_issued', reason, amountCents: payment.amountCents },
    });
    return { ok: true };
  });

  /**
   * OPS-4: SCOPED deletion per the §11a.2 retention matrix. Hard-deletes case
   * content (documents, chunks, findings, citations, runs, reports,
   * checklist, upload sessions, access, the Case row) and reports exactly
   * what was retained by design: the payment ledger (7y), the disclosure-ack
   * archive (24 mo), and the PII-minimal event/audit skeleton — with the
   * deletion certificate written INTO that surviving stream.
   */
  fastify.post('/cases/:id/delete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });

    const tenantId = kase.tenantId;

    // Deletion request + terminal transition land in the surviving stream
    // BEFORE content removal (the certificate trail).
    await withTenant(tenantId, async (tx) => {
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'deletion.requested', payload: {},
        actor: request.auth.userId,
      });
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'stage.entered', payload: { status: 'DELETED' },
        actor: request.auth.userId, transition: 'DELETED',
      });
    });

    const deleted = await prisma.$transaction(async (tx) => {
      const docs = await tx.document.findMany({ where: { caseId: id }, select: { id: true } });
      const docIds = docs.map((d) => d.id);
      const findings = await tx.finding.findMany({ where: { caseId: id }, select: { id: true } });
      const findingIds = findings.map((f) => f.id);

      const counts = {
        citations: (await tx.findingCitation.deleteMany({ where: { findingId: { in: findingIds } } })).count,
        findings: (await tx.finding.deleteMany({ where: { caseId: id } })).count,
        reports: (await tx.report.deleteMany({ where: { caseId: id } })).count,
        runs: (await tx.analysisRun.deleteMany({ where: { caseId: id } })).count,
        chunks: (await tx.documentChunk.deleteMany({ where: { documentId: { in: docIds } } })).count,
        pages: (await tx.documentPage.deleteMany({ where: { documentId: { in: docIds } } })).count,
        documents: (await tx.document.deleteMany({ where: { caseId: id } })).count,
        checklist: (await tx.checklistItem.deleteMany({ where: { caseId: id } })).count,
        uploadSessions: (await tx.uploadSession.deleteMany({ where: { caseId: id } })).count,
        access: (await tx.caseAccess.deleteMany({ where: { caseId: id } })).count,
      };
      await tx.case.delete({ where: { id } });
      return counts;
    });

    // S3: every object AND version under cases/{id}/ (bucket is versioned);
    // failure is loud — a missed S3 pass is an Ops follow-up, and the ≤35-day
    // version expiry bounds full propagation either way (§11a.2).
    let s3ObjectsRemoved = 0;
    try {
      const { deleteCasePrefix } = await import('../services/storage.service');
      s3ObjectsRemoved = await deleteCasePrefix(id);
    } catch (e) {
      request.log.error({ err: e, caseId: id }, 'OPS-4: S3 deletion failed — follow up required');
    }

    // The completion certificate — written AFTER the Case row is gone, into
    // the surviving stream (CaseEvent has no FK by design).
    await prisma.caseEvent.create({
      data: {
        caseId: id, tenantId, type: 'deletion.completed', version: 1,
        payload: {}, actor: request.auth.userId,
      },
    });
    await AuditService.log({
      tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'scoped_deletion', deleted, s3ObjectsRemoved },
    });

    return {
      deleted: { ...deleted, s3ObjectsRemoved },
      retainedByDesign: ['payment ledger (7y)', 'disclosure-ack archive (24mo)', 'event/audit skeleton (24mo)'],
    };
  });
}
