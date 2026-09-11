/**
 * Ops console integration tests (US-9, OPS-1..7) — live Postgres. The scoped
 * deletion test is the retention matrix (§11a.2) enforced by assertion:
 * content GONE, ledger/acks/events SURVIVE, certificate written.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
// Asserts the unconfigured-refund wall; a real key in .env must not leak in.
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Resume-stuck-pipeline tests (2026-09-07): the queue module is real except
// for the pieces that would need a live Redis job to exist. `state` is what
// the dead/live analysis job reports; the enqueue functions are spies.
const resumeMock = vi.hoisted(() => ({
  state: 'failed' as string,
  removed: 0,
  enqueueAnalysis: vi.fn(async () => {}),
  enqueueDocument: vi.fn(async () => {}),
}));
vi.mock('../src/services/queue', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    enqueueAnalysis: resumeMock.enqueueAnalysis,
    enqueueDocument: resumeMock.enqueueDocument,
    analysisQueue: {
      getJob: async (id: string) =>
        id.startsWith('analysis-')
          ? { getState: async () => resumeMock.state, remove: async () => { resumeMock.removed++; }, failedReason: resumeMock.state === 'failed' ? 'Error: No digitized text to analyze' : undefined, attemptsMade: 2 }
          : null,
      getWorkers: async () => [{}], getJobCounts: async () => ({ waiting: 0, active: 0, failed: 1, completed: 4 }),
      getFailed: async () => [{ id: '42', data: { caseId: 'c_dead', tenantId: 't' }, failedReason: 'Error: No digitized text to analyze', attemptsMade: 2, finishedOn: Date.now() }],
    },
    ingestionQueue: { getJobs: async () => [], getWorkers: async () => [{}, {}], getJobCounts: async () => ({}), getFailed: async () => [] },
    zipQueue: { getWorkers: async () => [], getJobCounts: async () => ({}), getFailed: async () => [] },
  };
});
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `ops_${Date.now()}`;
let tenantId: string;
let userId: string;
let adminId: string;
let caseId: string;
let adminCookie: string;
let clientCookie: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  const a = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } });
  adminId = a.id;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL',
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
  const doc = await prisma.document.create({ data: { filename: 'j.pdf', caseId } });
  await prisma.documentChunk.create({ data: { documentId: doc.id, content: `${run} content`, metadata: {} } });
  await prisma.disclosureAck.create({
    data: { userId, tenantId, caseId, disclosureSetVersion: 'test.1', ip: '127.0.0.1' },
  });
  await prisma.payment.create({
    data: { stripeId: `cs_${run}`, caseId, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900 },
  });
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('access + queue', () => {
  it('CLIENTs are locked out of every ops surface', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/ops/queue', headers: { cookie: clientCookie } });
    expect(res.statusCode).toBe(403);
  });

  it('sentry drill route: 403 for clients, deliberate 500 for admin', async () => {
    const locked = await fastify.inject({ method: 'GET', url: '/ops/sentry-test', headers: { cookie: clientCookie } });
    expect(locked.statusCode).toBe(403);
    const drill = await fastify.inject({ method: 'GET', url: '/ops/sentry-test', headers: { cookie: adminCookie } });
    expect(drill.statusCode).toBe(500);
  });

  it('the timeline serializes (CaseEvent.id is a BigInt — it 500d on every case-page poll, 2026-09-11)', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/ops/cases/${caseId}/timeline`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(typeof r.id).toBe('number');
  });

  it('the queue lists the case with stage and stall math', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/ops/queue', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const row = res.json().find((c: { id: string }) => c.id === caseId);
    expect(row.status).toBe('AWAITING_DOCS');
    expect(typeof row.daysInStage).toBe('number');
  });
});

describe('OPS-7 honest delay + OPS-3 archive + refund guard', () => {
  it('delay-ours sets the hold, extends the date, and hits the event stream', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/cases/${caseId}/delay-ours`, headers: { cookie: adminCookie },
      payload: { extendedToDate: '2026-09-15' },
    });
    expect(res.statusCode).toBe(200);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.delayOurs).toBe(true);
    expect(kase.expectedReadyAt?.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'delay.ours_marked' } })).toBe(1);
  });

  it('the E-6 disclosure archive exports the case-bound acknowledgments', async () => {
    const res = await fastify.inject({
      method: 'GET', url: `/ops/cases/${caseId}/disclosure-archive`, headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().acknowledgments[0].ip).toBe('127.0.0.1');
  });

  it('refund honestly 503s with Stripe unconfigured (never a fake ledger flip)', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/cases/${caseId}/refund`, headers: { cookie: adminCookie },
      payload: { reason: 'customer_request' },
    });
    expect(res.statusCode).toBe(503);
    const p = await prisma.payment.findUniqueOrThrow({ where: { stripeId: `cs_${run}` } });
    expect(p.status).toBe('SUCCEEDED');
  });
});

describe('OPS-4 scoped deletion — the retention matrix by assertion', () => {
  it('hard-deletes content, retains ledger/acks/events, writes the certificate', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/ops/cases/${caseId}/delete`, headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().retainedByDesign).toContain('payment ledger (7y)');

    // Content: GONE
    expect(await prisma.case.findUnique({ where: { id: caseId } })).toBeNull();
    expect(await prisma.document.count({ where: { caseId } })).toBe(0);
    expect(await prisma.checklistItem.count({ where: { caseId } })).toBe(0);
    expect(await prisma.caseAccess.count({ where: { caseId } })).toBe(0);

    // Retained by design: payment ledger, ack archive, event skeleton
    expect(await prisma.payment.count({ where: { caseId } })).toBe(1);
    expect(await prisma.disclosureAck.count({ where: { caseId } })).toBe(1);

    const events = await prisma.caseEvent.findMany({ where: { caseId }, orderBy: { id: 'asc' } });
    const types = events.map((e) => e.type);
    expect(types).toContain('deletion.requested');
    expect(types[types.length - 1]).toBe('deletion.completed'); // the certificate
    expect(await prisma.auditLog.count({ where: { caseId } })).toBeGreaterThan(0);
  });
});

describe('OPS: resume a stuck pipeline (2026-09-07)', () => {
  let stuckId: string;
  beforeAll(async () => {
    const c = await prisma.case.create({
      data: { title: `${run}_stuck`, tenantId, status: 'ANALYZING', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } },
    });
    stuckId = c.id;
    // One document that never produced pages (its digitize job died).
    await prisma.document.create({ data: { filename: 'vol1.pdf', caseId: stuckId, s3Key: `cases/${stuckId}/vol1.pdf` } });
  });
  afterAll(async () => {
    // The file-level afterAll deletes cases by tenant; these rows would
    // otherwise violate Document/CaseEvent → Case foreign keys.
    const mine = await prisma.case.findMany({ where: { tenantId, title: { in: [`${run}_stuck`, `${run}_idle`] } }, select: { id: true } });
    const ids = mine.map((c) => c.id);
    await prisma.document.deleteMany({ where: { caseId: { in: ids } } });
    // CaseEvent is append-only (DB trigger) and survives case deletion by design.
    await prisma.caseAccess.deleteMany({ where: { caseId: { in: ids } } });
    await prisma.case.deleteMany({ where: { id: { in: ids } } });
  });

  it('refuses when the analysis job is genuinely live', async () => {
    resumeMock.state = 'active';
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${stuckId}/resume`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/active/);
    expect(resumeMock.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('dead job + undigitized document: clears the job, re-queues the document, holds the analysis', async () => {
    resumeMock.state = 'failed';
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${stuckId}/resume`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, redigitized: 1, analysisEnqueued: false, priorJobState: 'failed', undigitized: 1 });
    expect(resumeMock.removed).toBeGreaterThan(0);
    expect(resumeMock.enqueueDocument).toHaveBeenCalledTimes(1);
    expect(resumeMock.enqueueAnalysis).not.toHaveBeenCalled();
    const ev = await prisma.caseEvent.findFirst({ where: { caseId: stuckId, type: 'pipeline.resumed' } });
    expect(ev).not.toBeNull();
  });

  it('every document has text: re-queues the analysis', async () => {
    await prisma.document.updateMany({ where: { caseId: stuckId }, data: { quarantined: true } }); // no undigitized docs remain
    resumeMock.state = 'completed';
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${stuckId}/resume`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ analysisEnqueued: true, redigitized: 0 });
    expect(resumeMock.enqueueAnalysis).toHaveBeenCalledWith(stuckId, tenantId);
  });

  it('GET /pipeline: reports alive vs dead from the job state, plus undigitized count and last event', async () => {
    resumeMock.state = 'active';
    let res = await fastify.inject({ method: 'GET', url: `/ops/cases/${stuckId}/pipeline`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ running: true, alive: true, analysisJob: 'active', docJobs: 0 });
    resumeMock.state = 'failed';
    res = await fastify.inject({ method: 'GET', url: `/ops/cases/${stuckId}/pipeline`, headers: { cookie: adminCookie } });
    const body = res.json();
    expect(body).toMatchObject({ running: true, alive: false, analysisJob: 'failed' });
    expect(body.lastEvent).toMatchObject({ type: 'pipeline.resumed' });
  });

  it('a CLIENT cannot resume', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${stuckId}/resume`, headers: { cookie: clientCookie } });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('nothing to resume on a case that is not running', async () => {
    // Own case: the suite's shared one is deleted by the retention test above.
    const idle = await prisma.case.create({
      data: { title: `${run}_idle`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } },
    });
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${idle.id}/resume`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Nothing to resume/);
  });
});

describe('OPS: diagnostics (2026-09-09)', () => {
  it('probes every dependency, snapshots the env, counts workers, and lists failed jobs with reasons — ADMIN only', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/ops/diagnostics', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    for (const k of ['redis', 's3', 'textract', 'anthropic', 'clamd']) {
      expect(d.checks[k]).toMatchObject({ ok: expect.any(Boolean), detail: expect.any(String), ms: expect.any(Number) });
    }
    expect(d.checks.redis.ok).toBe(true);
    // The clamd row follows the environment: unset → an honest FAIL that says
    // so; set (dev now runs production's scan path) → a real PONG.
    if (process.env.CLAMD_HOST) expect(d.checks.clamd).toMatchObject({ ok: true, detail: expect.stringMatching(/PONG/) });
    else expect(d.checks.clamd).toMatchObject({ ok: false, detail: expect.stringMatching(/CLAMD_HOST not set/) });
    expect(d.env).toHaveProperty('ANALYSIS_BATCH');
    expect(d.secretsPresent).toHaveProperty('ANTHROPIC_API_KEY');
    expect(d.queues.analysis).toMatchObject({ workers: 1, counts: { failed: 1 } });
    expect(d.queues.analysis.failed[0]).toMatchObject({ caseId: 'c_dead', reason: 'Error: No digitized text to analyze', attemptsMade: 2 });
    expect(d.queues.zip.workers).toBe(0);
    expect(JSON.stringify(d)).not.toMatch(/sk_|AKIA|whsec_/); // never a secret value
  });

  it('is walled off from SUPPORT', async () => {
    const support = await prisma.user.create({ data: { email: `${run}_support2@x.com`, tenantId, role: 'SUPPORT' } });
    const cookie = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId, role: 'SUPPORT' })}`;
    const res = await fastify.inject({ method: 'GET', url: '/ops/diagnostics', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });
});

describe('OPS: running costs (2026-09-11)', () => {
  it('GET /costs groups recorded spend by the week it was incurred; SUPPORT is walled off', async () => {
    const c = await prisma.case.create({ data: { title: `${run}_costs`, tenantId, status: 'READY', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } } });
    const now = new Date(); const lastWeek = new Date(Date.now() - 8 * 86_400_000);
    await prisma.costRecord.createMany({ data: [
      { caseId: c.id, tenantId, source: 'model', provider: 'claude-fable-5-1#batch', amountUsd: 40.2, createdAt: now },
      { caseId: c.id, tenantId, source: 'ocr', provider: 'textract', amountUsd: 1.1, pages: 700, createdAt: now },
      { caseId: c.id, tenantId, source: 'model', provider: 'claude-opus-5', amountUsd: 17.34, createdAt: lastWeek },
    ] });
    const res = await fastify.inject({ method: 'GET', url: '/ops/costs?weeks=4', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const d = res.json();
    expect(d.rows.length).toBeGreaterThanOrEqual(2);
    const thisWeek = d.rows[0];
    expect(thisWeek.modelUsd).toBeGreaterThanOrEqual(40.2);
    expect(thisWeek.ocrUsd).toBeGreaterThanOrEqual(1.1);
    expect(thisWeek.byProvider['claude-fable-5-1']).toBeGreaterThanOrEqual(40.2); // '#batch' suffix folded
    expect(d.totalUsd).toBeGreaterThanOrEqual(58.6);
    const byCase = (await fastify.inject({ method: 'GET', url: '/ops/cogs-by-case', headers: { cookie: adminCookie } })).json();
    expect(byCase[c.id]).toBeCloseTo(58.64, 1);
    const support = await prisma.user.create({ data: { email: `${run}_support3@x.com`, tenantId, role: 'SUPPORT' } });
    const sc = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId, role: 'SUPPORT' })}`;
    expect((await fastify.inject({ method: 'GET', url: '/ops/costs', headers: { cookie: sc } })).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'GET', url: '/ops/cogs-by-case', headers: { cookie: sc } })).statusCode).toBe(403);
    await prisma.costRecord.deleteMany({ where: { caseId: c.id } });
    await prisma.caseAccess.deleteMany({ where: { caseId: c.id } });
    await prisma.case.delete({ where: { id: c.id } });
  });

  it('Stripe test-mode payments are hidden from the ledger by default, shown on request, and purgeable — live and promo rows untouched', async () => {
    const c = await prisma.case.create({ data: { title: `${run}_tm`, tenantId, status: 'READY', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } } });
    await prisma.payment.createMany({ data: [
      { stripeId: `cs_test_${run}`, caseId: c.id, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900 },
      { stripeId: `cs_live_${run}`, caseId: c.id, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900 },
      { stripeId: `promo_SNOT26_${run}`, caseId: c.id, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0, promoCode: 'SNOT26' },
    ] });
    const get = (url: string) => fastify.inject({ method: 'GET', url, headers: { cookie: adminCookie } });
    let sum = (await get('/ops/payments/summary?days=30')).json();
    expect(sum.testMode).toMatchObject({ included: false });
    expect(sum.testMode.hiddenCount).toBeGreaterThanOrEqual(1);
    let ids = (await get(`/ops/payments?q=${run}_tm`)).json().rows.map((r: { stripeId: string }) => r.stripeId);
    expect(ids).toContain(`cs_live_${run}`); expect(ids).toContain(`promo_SNOT26_${run}`); expect(ids).not.toContain(`cs_test_${run}`);
    ids = (await get(`/ops/payments?q=${run}_tm&includeTest=1`)).json().rows.map((r: { stripeId: string }) => r.stripeId);
    expect(ids).toContain(`cs_test_${run}`);
    sum = (await get('/ops/payments/summary?days=30&includeTest=1')).json();
    expect(sum.testMode).toEqual({ included: true, hiddenCount: 0 });
    const bad = await fastify.inject({ method: 'POST', url: '/ops/payments/purge-test', headers: { cookie: adminCookie }, payload: { confirm: 'purge' } });
    expect(bad.statusCode).toBe(400);
    const ok = await fastify.inject({ method: 'POST', url: '/ops/payments/purge-test', headers: { cookie: adminCookie }, payload: { confirm: 'PURGE TEST' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().payments).toBeGreaterThanOrEqual(1);
    expect(await prisma.payment.findUnique({ where: { stripeId: `cs_test_${run}` } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { stripeId: `cs_live_${run}` } })).not.toBeNull();
    expect(await prisma.payment.findUnique({ where: { stripeId: `promo_SNOT26_${run}` } })).not.toBeNull();
    await prisma.payment.deleteMany({ where: { caseId: c.id } });
    await prisma.caseAccess.deleteMany({ where: { caseId: c.id } });
    await prisma.case.delete({ where: { id: c.id } });
  });
});
