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
const SUPPORT_DENIED_READS = [/^\/ops\/payments/, /^\/ops\/refunds/, /^\/ops\/promos/, /^\/ops\/retention-candidates/, /^\/ops\/sentry-test/, /^\/ops\/diagnostics/, /^\/ops\/costs/, /^\/ops\/cogs-by-case/, /\/cogs$/];

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
    const rows = await prisma.caseEvent.findMany({
      where: { caseId: id },
      orderBy: { id: 'asc' },
      select: { id: true, type: true, version: true, payload: true, actor: true, createdAt: true },
    });
    // CaseEvent.id is a BigInt sequence; JSON cannot serialize BigInt, so this
    // route 500'd on every case-page poll ("Do not know how to serialize a
    // BigInt", found in prod logs 2026-09-11). Ids are far below 2^53.
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
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

  // Edit a code: on/off, expiry (ISO, or null = never expires), cap. An
  // expired SNOT26 showed 'active' and could only be replaced (2026-09-12).
  fastify.patch('/promos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        active: z.boolean().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        maxRedemptions: z.number().int().min(1).max(10000).nullable().optional(),
      })
      .parse(request.body);
    const data: { active?: boolean; expiresAt?: Date | null; maxRedemptions?: number | null } = {};
    if (body.active !== undefined) data.active = body.active;
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.maxRedemptions !== undefined) data.maxRedemptions = body.maxRedemptions;
    if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to change' });
    const promo = await prisma.promoCode.update({ where: { id }, data }).catch(() => null);
    if (!promo) return reply.status(404).send({ error: 'Not found' });
    await AuditService.log({
      tenantId: request.auth.tenantId, caseId: 'promo:' + promo.code, action: LogAction.QA_DECISION,
      userId: request.auth.userId, details: { decision: 'promo_edited', code: promo.code, ...data, expiresAt: data.expiresAt?.toISOString() ?? data.expiresAt },
    });
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
  // Running costs by week INCURRED + per-case totals (ops Money page, cases list).
  fastify.get('/costs', async (request) => {
    const { weeks } = request.query as { weeks?: string };
    const { spendByWeek } = await import('../services/costs.service');
    return spendByWeek(Number(weeks) || 12);
  });
  fastify.get('/cogs-by-case', async () => {
    const { cogsByCase } = await import('../services/costs.service');
    return cogsByCase();
  });

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

  // Live pipeline probe for the case file (2026-09-09): is a job actually
  // alive right now, and what was the newest thing it did? Presence/state
  // only — this is what tells staff "running" vs "dead" without the logs.
  fastify.get('/cases/:id/pipeline', async (request, reply) => {
    const { id } = request.params as { id: string };
    const kase = await prisma.case.findUnique({ where: { id }, select: { status: true } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    const running = ['DIGITIZING', 'DOCS_COMPLETE', 'ANALYZING', 'ADJUDICATING'].includes(kase.status);
    const q = await import('../services/queue');
    const job = await q.analysisQueue.getJob(`analysis-${id}`);
    const analysisJob = job ? await job.getState() : 'none';
    // Why it died, in the job's own words (BullMQ keeps failedReason) — the
    // single most useful line for "prod never finishes" (2026-09-09).
    const failedReason = job && analysisJob === 'failed' ? String(job.failedReason ?? '').slice(0, 400) : null;
    const attemptsMade = job ? job.attemptsMade : 0;
    const docJobs = (await q.ingestionQueue.getJobs(['waiting', 'active', 'delayed', 'prioritized']))
      .filter((j) => (j.data as { caseId?: string }).caseId === id).length;
    const undigitized = await prisma.document.count({ where: { caseId: id, quarantined: false, pages: { none: {} } } });
    const last = await prisma.caseEvent.findFirst({ where: { caseId: id }, orderBy: { createdAt: 'desc' }, select: { type: true, createdAt: true } });
    const alive = ['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'].includes(analysisJob) || docJobs > 0;
    return {
      status: kase.status, running, alive, analysisJob, docJobs, undigitized, failedReason, attemptsMade,
      lastEvent: last ? { type: last.type, at: last.createdAt } : null,
    };
  });

  // Production diagnostics (2026-09-09, "dev works, prod doesn't"): live-probe
  // every pipeline dependency with the process's real credentials, snapshot
  // the pipeline env (values, never secrets), count running workers, and
  // list the last failed jobs WITH their failure reasons. ADMIN only.
  fastify.get('/diagnostics', async () => {
    const withTimeout = <T,>(p: Promise<T>, ms = 6000) =>
      Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms))]);
    type Check = { ok: boolean; detail: string; ms: number };
    const run = async (fn: () => Promise<string>): Promise<Check> => {
      const t = Date.now();
      try { return { ok: true, detail: await withTimeout(fn()), ms: Date.now() - t }; }
      catch (e) { return { ok: false, detail: String((e as Error).message ?? e).slice(0, 200), ms: Date.now() - t }; }
    };
    const env = (k: string) => process.env[k] ?? null;
    const present = (k: string) => !!process.env[k];

    const checks: Record<string, Check> = {};
    checks.redis = await run(async () => {
      const { createConnection } = await import('../lib/redis');
      const conn = createConnection();
      try { return `PONG (${await conn.ping()})`; } finally { conn.disconnect(); }
    });
    checks.s3 = await run(async () => {
      if (!present('AWS_ACCESS_KEY_ID')) throw new Error('AWS_ACCESS_KEY_ID not set');
      const { s3, bucket } = await import('../services/storage.service');
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
      return `bucket ${bucket()} reachable`;
    });
    checks.textract = await run(async () => {
      if (!present('AWS_ACCESS_KEY_ID')) throw new Error('AWS_ACCESS_KEY_ID not set');
      const { TextractClient, DetectDocumentTextCommand } = await import('@aws-sdk/client-textract');
      // A 1×1 PNG is not a document Textract accepts — but the REJECTION proves
      // the key is authorized; an unauthorized key fails before validation.
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
      try {
        await new TextractClient({ region: process.env.AWS_REGION ?? 'us-east-2' }).send(new DetectDocumentTextCommand({ Document: { Bytes: png } }));
        return 'authorized';
      } catch (e) {
        const name = (e as Error).name;
        if (['UnsupportedDocumentException', 'InvalidParameterException', 'BadDocumentException'].includes(name)) return `authorized (${name} on the probe image is expected)`;
        throw e;
      }
    });
    checks.anthropic = await run(async () => {
      if (!present('ANTHROPIC_API_KEY') && !present('ANTHROPIC_AUTH_TOKEN')) throw new Error('ANTHROPIC_API_KEY not set');
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const model = process.env.ANALYSIS_MODEL ?? 'claude-opus-5';
      const r = await new Anthropic().messages.countTokens({ model, messages: [{ role: 'user', content: 'ping' }] });
      return `key valid, model ${model} answers (${r.input_tokens} tokens counted)`;
    });
    checks.clamd = await run(async () => {
      const host = process.env.CLAMD_HOST;
      if (!host) throw new Error('CLAMD_HOST not set — uploads are NOT scanned (dev only)');
      const [h, p] = host.split(':');
      const net = await import('net');
      return await new Promise<string>((resolve, reject) => {
        const sock = net.createConnection({ host: h, port: Number(p ?? 3310) });
        let out = '';
        sock.on('connect', () => sock.write('zPING\0'));
        sock.on('data', (d) => { out += d.toString(); if (out.includes('PONG')) { sock.destroy(); resolve(`PONG from ${h}`); } });
        sock.on('error', (e) => reject(new Error(`clamd ${h}: ${e.message} — every upload's digitizing will fail and retry until dead`)));
        sock.on('close', () => { if (!out.includes('PONG')) reject(new Error(`clamd ${h} closed without PONG`)); });
        sock.setTimeout(4000, () => { sock.destroy(); reject(new Error(`clamd ${h}: timeout`)); });
      });
    });

    const q = await import('../services/queue');
    const queues = { analysis: q.analysisQueue, ingestion: q.ingestionQueue, zip: q.zipQueue } as const;
    const queueState: Record<string, { workers: number; counts: Record<string, number>; failed: Array<{ id: string; caseId: string | null; documentId: string | null; reason: string; attemptsMade: number; failedAt: string | null }> }> = {};
    for (const [name, queue] of Object.entries(queues)) {
      try {
        const [workers, counts, failed] = await withTimeout(Promise.all([
          queue.getWorkers(), queue.getJobCounts(), queue.getFailed(0, 9),
        ]));
        queueState[name] = {
          workers: workers.length,
          counts: counts as Record<string, number>,
          failed: failed.map((j) => ({
            id: String(j.id), caseId: (j.data as { caseId?: string })?.caseId ?? null, documentId: (j.data as { documentId?: string })?.documentId ?? null,
            reason: String(j.failedReason ?? '').slice(0, 400), attemptsMade: j.attemptsMade, failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
          })),
        };
      } catch (e) {
        queueState[name] = { workers: -1, counts: {}, failed: [{ id: '-', caseId: null, documentId: null, reason: `queue unreadable: ${(e as Error).message}`, attemptsMade: 0, failedAt: null }] };
      }
    }

    const v8 = await import('v8');
    return {
      at: new Date().toISOString(),
      process: {
        node: process.version, uptimeMin: Math.round(process.uptime() / 60),
        rssMb: Math.round(process.memoryUsage().rss / 1048576), heapLimitMb: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576),
      },
      env: {
        NODE_ENV: env('NODE_ENV'), ANALYSIS_MODEL: env('ANALYSIS_MODEL'), ANALYSIS_ENGINES: env('ANALYSIS_ENGINES'), ANALYSIS_SAMPLES: env('ANALYSIS_SAMPLES'),
        ANALYSIS_BATCH: env('ANALYSIS_BATCH'), ANALYSIS_BATCH_BUDGET_MS: env('ANALYSIS_BATCH_BUDGET_MS'), ANALYSIS_BATCH_MAX_RECORD_TOKENS: env('ANALYSIS_BATCH_MAX_RECORD_TOKENS'),
        AUTO_APPROVE: env('AUTO_APPROVE'), INGESTION_CONCURRENCY: env('INGESTION_CONCURRENCY'), ANALYSIS_CONCURRENCY: env('ANALYSIS_CONCURRENCY'), ZIP_CONCURRENCY: env('ZIP_CONCURRENCY'),
        NODE_OPTIONS: env('NODE_OPTIONS'), CLAMD_HOST: env('CLAMD_HOST'), DOC_CLASSIFIER_MODEL: env('DOC_CLASSIFIER_MODEL'), WEB_ORIGIN: env('WEB_ORIGIN'),
        S3_BUCKET: env('S3_BUCKET'), AWS_REGION: env('AWS_REGION'),
      },
      secretsPresent: {
        ANTHROPIC_API_KEY: present('ANTHROPIC_API_KEY'), AWS_ACCESS_KEY_ID: present('AWS_ACCESS_KEY_ID'), AWS_SECRET_ACCESS_KEY: present('AWS_SECRET_ACCESS_KEY'),
        RESEND_API_KEY: present('RESEND_API_KEY'), STRIPE_SECRET_KEY: present('STRIPE_SECRET_KEY'), STRIPE_WEBHOOK_SECRET: present('STRIPE_WEBHOOK_SECRET'), HG_APP_PASSWORD: present('HG_APP_PASSWORD'),
      },
      checks,
      queues: queueState,
    };
  });

  // Resume a stuck pipeline (2026-09-07). A case whose status says it is
  // running but whose job died (an api restart mid-run counts; BullMQ gives
  // up after the attempts) sits in limbo: nothing marks the case, and the
  // fixed job id `analysis-<caseId>` makes any plain re-enqueue a silent
  // no-op while the dead job is still in Redis. This removes the dead job,
  // re-digitizes documents that never produced pages, and re-queues the
  // analysis — refusing (409) if a job is genuinely live.
  // Republish (PO, 2026-09-12): re-release the latest report on the current
  // template — same findings, same run — and tell the family what changed.
  // ADMIN only (not in SUPPORT_WRITES): it emails a customer.
  fastify.post('/cases/:id/report/republish', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { TEMPLATE_VERSION, templateNotesSince } = await import('../services/report-template');
    const kase = await prisma.case.findUnique({ where: { id }, select: { id: true, tenantId: true } });
    if (!kase) return reply.status(404).send({ error: 'Not found' });
    const latest = await prisma.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' } });
    if (!latest) return reply.status(404).send({ error: 'No released report to republish' });
    const notes = templateNotesSince(latest.templateVersion);
    if (notes.length === 0) return reply.status(409).send({ error: `Report v${latest.versionNo} is already on the current template (${TEMPLATE_VERSION})` });

    const created = await withTenant(kase.tenantId, async (tx) => {
      const report = await tx.report.create({
        data: {
          caseId: id, tenantId: kase.tenantId, runId: latest.runId, versionNo: latest.versionNo + 1,
          templateVersion: TEMPLATE_VERSION, approvedBy: request.auth.userId,
          findingsSnapshot: latest.findingsSnapshot as object, changeNotes: notes,
        },
      });
      await appendCaseEvent(tx, { caseId: id, tenantId: kase.tenantId, actor: request.auth.userId, type: 'report.rendered', payload: { reportId: report.id, templateVersion: TEMPLATE_VERSION } });
      return report;
    });
    await AuditService.log({
      tenantId: kase.tenantId, caseId: id, action: LogAction.QA_DECISION, userId: request.auth.userId,
      details: { decision: 'report_republished', reportId: created.id, fromVersion: latest.versionNo, toVersion: created.versionNo, fromTemplate: latest.templateVersion, toTemplate: TEMPLATE_VERSION },
    });
    let emailed = false;
    await notifyCaseOwner(id, async (email, origin) => {
      const { sendReportUpdated } = await import('@hg/email');
      const r = await sendReportUpdated(email, { caseUrl: `${origin}/case/${id}/report`, versionNo: created.versionNo, notes });
      emailed = r.delivered;
    });
    return { ok: true, fromVersion: latest.versionNo, toVersion: created.versionNo, templateVersion: TEMPLATE_VERSION, notes, emailed };
  });

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
  // Purge Stripe TEST-mode payments (cs_test_…) and their refunds — never live, never promo rows.
  fastify.post('/payments/purge-test', async (request) => {
    z.object({ confirm: z.literal('PURGE TEST') }).parse(request.body);
    const { purgeTestPayments } = await import('../services/refunds.service');
    const out = await purgeTestPayments(request.auth.userId);
    request.log.info(out, 'test-mode payments purged');
    return { ok: true, ...out };
  });

  fastify.get('/payments', async (request) => {
    const { status, q, includeTest } = request.query as { status?: string; q?: string; includeTest?: string };
    return listPayments({ status, q, includeTest: includeTest === '1' });
  });

  fastify.get('/payments/summary', async (request) => {
    const { days, includeTest } = request.query as { days?: string; includeTest?: string };
    const n = Math.min(Math.max(Number(days) || 30, 1), 3650);
    return paymentsSummary(n, includeTest === '1');
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
