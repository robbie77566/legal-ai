/**
 * Ops console integration tests (US-9, OPS-1..7) — live Postgres. The scoped
 * deletion test is the retention matrix (§11a.2) enforced by assertion:
 * content GONE, ledger/acks/events SURVIVE, certificate written.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
