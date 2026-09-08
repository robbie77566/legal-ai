import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from '../services/audit.service';
import { getStripe } from '../services/payments.service';
import {
  REFUND_REASONS, issueRefund, listPayments, listRefunds, paymentsSummary, type RefundOutcome,
} from '../services/refunds.service';
import {
  NOTE_CHANNELS, REQUEST_TYPES, addSupportNote, openRequest, listRequests, decideRequest,
} from '../services/staff-requests.service';

/**
 * Ops console API (US-9, OPS-1..7) — ADMIN-only staff surface. Reads use the
 * owner connection (cross-tenant system surface); every action is
 * audit-logged and event-sourced. "Nothing depends on a developer running
 * SQL" is the whole point of this file.
 */

const STALL_DAYS = 7;

// SUPPORT (staff_console_access_model §5): every customer-facing read, plus
// the actions that unblock a family. Money, deletion, promos, drills, and
// per-case cost stay ADMIN. Enforced here, not in the browser.
const SUPPORT_WRITES = new Set(['delay-ours', 'delay-cleared', 'resume', 'contact', 'requests']);
const SUPPORT_DENIED_READS = [/^\/ops\/payments/, /^\/ops\/refunds/, /^\/ops\/promos/, /^\/ops\/retention-candidates/, /^\/ops\/sentry-test/, /\/cogs$/];

/** Fire-and-forget customer email to the case owner (never fails a request). */
async function notifyCaseOwner(caseId: string, send: (email: string, origin: string) => Promise<unknown>) {
  try {
    const owner = await prisma.caseAccess.findFirst({ where: { caseId, role: 'ADMIN' }, select: { userId: true } });
    const user = owner ? await prisma.user.findUnique({ where: { id: owner.userId }, select: { email: true, deletedAt: true } }) : null;
    if (!user?.email || user.deletedAt) return;
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    await send(user.email, origin);
  } catch (e) {
    console.warn('[ops] customer notification failed:', (e as Error).message);
  }
}

export default async function opsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    const role = request.auth?.role;
    if (role === 'ADMIN') return;
    if (role === 'SUPPORT') {
      const path = request.url.split('?')[0];
      if (request.method === 'GET' && !SUPPORT_DENIED_READS.some((re) => re.test(path))) return;
      const action = path.match(/^\/ops\/cases\/[^/]+\/([a-z-]+)$/)?.[1];
      if (request.method === 'POST' && action && SUPPORT_WRITES.has(action)) return;
      return reply.status(403).send({ error: 'Support can view cases and unblock them — money, deletion, and settings need an Ops administrator' });
    }
    return reply.status(403).send({ error: 'Ops administrators only' });
  });

  // OPS-6 contact log: what Support said to the family, on the case file.
  fastify.post('/cases/:id/contact', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { channel, body } = z
      .object({ channel: z.enum(NOTE_CHANNELS), body: z.string().trim().min(1).max(2000) })
      .parse(request.body);
    const note = await addSupportNote({ caseId: id, channel, body, authorId: request.auth.userId });
    if (!note) return reply.status(404).send({ error: 'Not found' });
    return note;
  });

  // Request-to-Admin (staff_console_access_model §6). Support raises;
  // anyone on staff can see; only an Admin decides (the hook keeps SUPPORT
  // off /requests/:id/decide).
  fastify.post('/cases/:id/requests', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        type: z.enum(REQUEST_TYPES),
        reason: z.string().min(1).max(40),
        note: z.string().trim().max(1000).optional(),
        amountCents: z.number().int().positive().optional(),
      })
      .parse(request.body);
    const out = await openRequest({ caseId: id, ...body, requestedBy: request.auth.userId });
    if (out.ok) return out.request;
    switch (out.error) {
      case 'not_found': return reply.status(404).send({ error: 'Not found' });
      case 'bad_reason': return reply.status(400).send({ error: 'Pick a reason from the list' });
      case 'nothing_to_refund': return reply.status(409).send({ error: 'This case has no refundable payment' });
      case 'already_open': return reply.status(409).send({ error: 'A request of this kind is already waiting on an admin', openRequestId: out.openRequestId });
    }
  });

  fastify.get('/requests', async (request) => {
    const { mine, caseId } = request.query as { mine?: string; caseId?: string };
    return listRequests({ mine: mine === '1' || request.auth.role === 'SUPPORT' ? request.auth.userId : undefined, caseId });
  });

  fastify.post('/requests/:id/decide', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { decision, decisionNote } = z
      .object({ decision: z.enum(['APPROVED', 'DECLINED']), decisionNote: z.string().trim().max(1000).optional() })
      .parse(request.body);
    const out = await decideRequest({ requestId: id, decision, decisionNote, decidedBy: request.auth.userId });
    if (!out.ok) return reply.status(out.status).send({ error: out.error });
    return out;
  });

  // The case file (Support's home turf): uploads, analysis, deliverables.
  fastify.get('/cases/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { getCaseFile } = await import('../services/case-file.service');
    const file = await getCaseFile(id);
    if (!file) return reply.status(404).send({ error: 'Not found' });
    return file;
  });

  fastify.get('/cases/:id/documents/:docId/download', async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string };
    const { staffDocumentDownloadUrl } = await import('../services/case-file.service');
    const link = await staffDocumentDownloadUrl(id, docId);
    if (!link) return reply.status(404).send({ error: 'Document not available for download' });
    await AuditService.log({
      tenantId: link.tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'document_download', documentId: docId, staff: true },
    });
    return { url: link.url, filename: link.filename };
  });

  fastify.get('/cases/:id/report/pdf', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { version } = request.query as { version?: string };
    const { staffReportPdf } = await import('../services/case-file.service');
    const out = await staffReportPdf(id, version ? Number(version) : undefined);
    if (!out) return reply.status(404).send({ error: 'No report has been released for this case' });
    await AuditService.log({
      tenantId: out.tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'report_pdf_download', versionNo: out.versionNo, staff: true },
    });
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${out.filename}"`)
      .send(out.pdf);
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
    // The tracker promises "we'll email you if anything needs your attention" — keep it (G-D2).
    void notifyCaseOwner(id, async (email, origin) => {
      const { sendDelayOurs } = await import('@hg/email');
      await sendDelayOurs(email, { newDate: extendedToDate, statusUrl: `${origin}/case/${id}/status` });
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

  // Resume a stuck pipeline (2026-09-07). A case whose status says it is
  // running but whose job died (an api restart mid-run counts; BullMQ gives
  // up after the attempts) sits in limbo: nothing marks the case, and the
  // fixed job id `analysis-<caseId>` makes any plain re-enqueue a silent
  // no-op while the dead job is still in Redis. This removes the dead job,
  // re-digitizes documents that never produced pages, and re-queues the
  // analysis — refusing (409) if a job is genuinely live.
  fastify.post('/cases/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    const RUNNING = ['DIGITIZING', 'DOCS_COMPLETE', 'ANALYZING', 'ADJUDICATING'];
    if (!RUNNING.includes(kase.status)) {
      return reply.status(409).send({ error: `Nothing to resume — case is ${kase.status}` });
    }
    const q = await import('../services/queue');

    const job = await q.analysisQueue.getJob(`analysis-${id}`);
    const priorJobState = job ? await job.getState() : 'none';
    if (['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(priorJobState)) {
      return reply.status(409).send({ error: `Analysis job is ${priorJobState} — not stuck. Give it time.`, jobState: priorJobState });
    }
    if (job) await job.remove().catch(() => {}); // failed/completed/unknown: clear the id

    // Documents with no digitized pages, not already in flight.
    const docs = await prisma.document.findMany({
      where: { caseId: id, quarantined: false, pages: { none: {} } },
      select: { id: true, s3Key: true },
    });
    const inFlight = new Set(
      (await q.ingestionQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized']))
        .map((j) => (j.data as { documentId?: string }).documentId)
        .filter(Boolean)
    );
    let redigitized = 0;
    for (const d of docs) {
      if (!d.s3Key || inFlight.has(d.id)) continue;
      await q.enqueueDocument(d.id, d.s3Key, id);
      redigitized++;
    }

    // Analysis only once every document has text — otherwise it would run on
    // a partial record. The operator presses Resume again after digitizing.
    const analysisEnqueued = docs.length === 0;
    if (analysisEnqueued) await q.enqueueAnalysis(id, kase.tenantId);

    await withTenant(kase.tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId: id, tenantId: kase.tenantId, type: 'pipeline.resumed',
        payload: { redigitized, analysisEnqueued, priorJobState }, actor: request.auth.userId,
      })
    );
    await AuditService.log({
      tenantId: kase.tenantId, caseId: id, action: LogAction.CASE_ACCESS,
      userId: request.auth.userId, details: { op: 'pipeline_resumed', redigitized, analysisEnqueued, priorJobState },
    });
    request.log.info({ caseId: id, redigitized, analysisEnqueued, priorJobState }, 'pipeline resumed by ops');
    return { ok: true, redigitized, analysisEnqueued, priorJobState, undigitized: docs.length };
  });

  // OPS-2: audited, Stripe-linked refund — full or partial, any paid kind.
  // The ledger, case event, and audit row are written by refunds.service in
  // one transaction after Stripe confirms; the charge.refunded webhook is
  // then a no-op (Refund.stripeRefundId is unique).
  const refundBody = z.object({
    reason: z.enum(REFUND_REASONS),
    amountCents: z.number().int().positive().optional(),
    note: z.string().trim().max(1000).optional(),
  });
  const sendRefundOutcome = (reply: FastifyReply, outcome: RefundOutcome) => {
    if (outcome.ok) return outcome;
    switch (outcome.error) {
      case 'payments_unconfigured':
        return reply.status(503).send({ error: 'Payments are not configured' });
      case 'not_found':
        return reply.status(404).send({ error: 'Not found' });
      case 'nothing_to_refund':
        return reply.status(409).send({ error: 'Nothing to refund on this payment' });
      case 'disputed':
        return reply.status(409).send({ error: 'This payment is under dispute — Stripe holds the funds until it closes' });
      case 'over_refund':
        return reply.status(409).send({
          error: `Amount exceeds the remaining balance of $${((outcome.remainingCents ?? 0) / 100).toFixed(2)}`,
          remainingCents: outcome.remainingCents,
        });
      case 'no_payment_intent':
        return reply.status(409).send({ error: 'No payment intent found for this payment' });
    }
  };

  fastify.post('/payments/:id/refund', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = refundBody.parse(request.body);
    const outcome = await issueRefund({ paymentId: id, ...body, actor: request.auth.userId });
    return sendRefundOutcome(reply, outcome);
  });

  // Case-addressed form (the drawer's original path): refunds the case's
  // review payment. Kept so existing callers and tests keep working.
  fastify.post('/cases/:id/refund', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = refundBody.parse(request.body);
    if (!getStripe()) return reply.status(503).send({ error: 'Payments are not configured' });
    const kase = await prisma.case.findUnique({ where: { id }, select: { id: true } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    const payment = await prisma.payment.findFirst({
      where: { caseId: id, kind: 'REVIEW', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, amountCents: { gt: 0 } },
    });
    if (!payment) return reply.status(409).send({ error: 'No refundable payment on this case' });
    const outcome = await issueRefund({ paymentId: payment.id, ...body, actor: request.auth.userId });
    return sendRefundOutcome(reply, outcome);
  });

  // Money page (payments_and_refunds spec §3): the ledger with the customer
  // and case joined in two queries (no FKs on Payment by design).
  fastify.get('/payments', async (request) => {
    const { status, q } = request.query as { status?: string; q?: string };
    return listPayments({ status, q });
  });

  fastify.get('/payments/summary', async (request) => {
    const { days } = request.query as { days?: string };
    const n = Math.min(Math.max(Number(days) || 30, 1), 3650);
    return paymentsSummary(n);
  });

  fastify.get('/refunds', async () => listRefunds(100));

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
    const { deleteCaseScoped } = await import('../services/deletion.service');
    const deleted = await deleteCaseScoped(id, request.auth.userId);
    if (!deleted) return reply.status(404).send({ error: 'Not found' });
    return {
      deleted,
      retainedByDesign: ['payment ledger (7y)', 'disclosure-ack archive (24mo)', 'event/audit skeleton (24mo)'],
    };
  });

  // Account admin (2026-09-02): find a consumer account, delete it — cases
  // through the OPS-4 machinery, then the user row anonymized (ledger FKs
  // survive; the email is freed for reuse; live sessions die).
  fastify.get('/accounts', async (request) => {
    // No term → the whole (small) customer list, newest first; a term
    // filters it. Demanding a search term first left the admin guessing at
    // emails that might not exist (2026-09-02).
    const { q } = request.query as { q?: string };
    const users = await prisma.user.findMany({
      where: { role: 'CLIENT', ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}) },
      select: { id: true, email: true, name: true, createdAt: true, deletedAt: true, tenantId: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      users.map(async (u) => ({
        ...u,
        cases: await prisma.case.count({ where: { tenantId: u.tenantId, accessList: { some: { userId: u.id } } } }),
      }))
    );
  });

  fastify.post('/accounts/:id/delete', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { confirmEmail } = z.object({ confirmEmail: z.string() }).parse(request.body);
    const target = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!target) return reply.status(404).send({ error: 'Not found' });
    // The admin must type the exact email — account deletion is never a
    // one-misclick action.
    if (target.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      return reply.status(400).send({ error: 'Confirmation email does not match the account' });
    }
    const { deleteAccount } = await import('../services/deletion.service');
    const result = await deleteAccount(id, request.auth.userId);
    if ('error' in result) {
      const status = result.error === 'not_found' ? 404 : 409;
      const msg =
        result.error === 'staff_account'
          ? 'Staff accounts cannot be deleted here'
          : result.error === 'already_deleted'
            ? 'Account is already deleted'
            : 'Not found';
      return reply.status(status).send({ error: msg });
    }
    request.log.info({ deletedUser: id, by: request.auth.userId, cases: result.casesDeleted.length }, 'account deleted');
    return result;
  });

  // J2 (ops_console_redesign.md): "is the system healthy / configured?"
  // Presence only — never a secret value. Stripe mode is derived from the
  // key prefix; pipeline counts are one groupBy.
  fastify.get('/status', async () => {
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
    const byStatus = await prisma.case.groupBy({ by: ['status'], _count: { _all: true } });
    const count = (st: string) => byStatus.find((b) => b.status === st)?._count._all ?? 0;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const retentionCandidates = await prisma.case.count({
      where: { status: { in: ['READY', 'DELIVERED', 'REFUNDED'] }, updatedAt: { lt: cutoff } },
    });
    // Live storage check: HeadBucket actually exercises the AWS credentials,
    // so a missing/wrong key on the api shows red (uploads fail at presign
    // otherwise — 2026-09-03). Cheap and read-only.
    let storage: { ok: boolean; detail: string };
    try {
      const { s3, bucket } = await import('../services/storage.service');
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID not set');
      // Hard 5s cap: with no env credentials the SDK chain falls through to
      // probing EC2 metadata (absent on Render) and retries — that froze the
      // whole ops console on 2026-09-05 because the shell probes this route.
      await Promise.race([
        s3().send(new HeadBucketCommand({ Bucket: bucket() })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('S3 check timed out (5s)')), 5000)),
      ]);
      storage = { ok: true, detail: bucket() };
    } catch (e) {
      // Which of the four the process actually sees (name + length only,
      // never a value) — settles "I set it" vs "the process has it" in one
      // glance (2026-09-05: key id present, secret invisible to the SDK).
      const seen = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET']
        .map((k) => `${k.replace('AWS_', '').replace('_ACCESS', '')}:${(process.env[k] ?? '').length}`)
        .join(' ');
      storage = { ok: false, detail: `${(e as Error).message.slice(0, 60)} [${seen}]` };
    }

    return {
      storage,
      email: process.env.RESEND_API_KEY
        ? { configured: true, from: process.env.EMAIL_FROM ?? 'Family Case Review <noreply@snotnoselegal.com>' }
        : { configured: false, from: null },
      stripe: !stripeKey ? 'unset' : stripeKey.startsWith('sk_live_') ? 'live' : 'test',
      stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      autoApprove: process.env.AUTO_APPROVE === '1',
      malwareScan: !!process.env.CLAMD_HOST,
      sentry: !!process.env.SENTRY_DSN,
      posthog: !!process.env.POSTHOG_API_KEY,
      pipeline: {
        awaitingDocs: count('AWAITING_DOCS'),
        digitizing: count('DOCS_COMPLETE') + count('DIGITIZING'),
        analyzing: count('ANALYZING'),
        held: count('QA_REVIEW'),
        ready: count('READY') + count('DELIVERED'),
      },
      retentionCandidates,
    };
  });

  // Fulfillment safety net on demand (ops_console): the hourly reconcile
  // sweep, triggerable now — creates cases for paid Stripe sessions whose
  // webhook never landed (e.g. before STRIPE_WEBHOOK_SECRET is configured).
  fastify.post('/reconcile-payments', async (request) => {
    const { reconcilePayments } = await import('../services/payments.service');
    const result = await reconcilePayments('manual');
    request.log.info(result, 'manual payment reconciliation');
    return result;
  });

  // J2 diagnostic: send a real message to the calling admin and return the
  // provider's verdict verbatim — replaces log spelunking with one click.
  fastify.post('/email-test', async (request) => {
    const me = await prisma.user.findUnique({ where: { id: request.auth.userId }, select: { email: true } });
    if (!me) return { delivered: false, error: 'caller not found' };
    const { sendTestEmail } = await import('@hg/email');
    const result = await sendTestEmail(me.email);
    request.log.info({ to: me.email, ...result }, 'ops email test');
    return { to: me.email, ...result };
  });
}
