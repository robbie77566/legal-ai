/**
 * S2/S3 intake integration tests (US-2/US-3) — live Postgres, route level.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `intake_${Date.now()}`;
let tenantId: string;
let userId: string;
let caseId: string;
let swCaseId: string;
let cookie: string;

const seedCase = async (subsequentWrit: boolean) => {
  const c = await prisma.case.create({
    data: {
      title: `${run}${subsequentWrit ? '_sw' : ''}`,
      tenantId,
      status: 'AWAITING_DOCS',
      lane: 'TRIAL',
      vehicle: '11.07',
      subsequentWrit,
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  return c.id;
};

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' },
  });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  caseId = await seedCase(false);
  swCaseId = await seedCase(true);
});

afterAll(async () => {
  await prisma.checklistItem.deleteMany({ where: { caseId: { in: [caseId, swCaseId] } } });
  await prisma.document.deleteMany({ where: { caseId: { in: [caseId, swCaseId] } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('interview → checklist', () => {
  it('generates the trial checklist, stores county/year, appends the event', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: { cookie },
      payload: { county: 'Harris', convictionYear: 2019, trialDays: 4, hadAppeal: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().checklistItemCount).toBe(5);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.county).toBe('Harris');
    expect(kase.convictionYear).toBe(2019);

    const events = await prisma.caseEvent.findMany({ where: { caseId, type: 'interview.completed' } });
    expect(events).toHaveLength(1);
  });

  it('drops the appellate-opinion item when there was no appeal', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: { cookie },
      payload: { county: 'Harris', convictionYear: 2019, hadAppeal: false },
    });
    expect(res.statusCode).toBe(200);
    const items = await prisma.checklistItem.findMany({ where: { caseId } });
    expect(items.map((i) => i.kind)).not.toContain('appellate_opinion');
    expect(items).toHaveLength(4);
  });

  it('subsequent-writ mode adds the prior-writ items (§4 analysis needs them)', async () => {
    await fastify.inject({
      method: 'POST',
      url: `/cases/${swCaseId}/interview`,
      headers: { cookie },
      payload: { county: 'Brazoria', convictionYear: 2015, hadAppeal: true },
    });
    const kinds = (await prisma.checklistItem.findMany({ where: { caseId: swCaseId } })).map((i) => i.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['prior_writ_application', 'prior_writ_answer', 'prior_writ_findings'])
    );
    expect(kinds).toHaveLength(8);
  });

  it("another user's case is forbidden", async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: {
        cookie: `next-auth.session-token=${await encodeSessionToken({ userId: 'stranger', tenantId, role: 'CLIENT' })}`,
      },
      payload: { county: 'Harris', convictionYear: 2019, hadAppeal: true },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('checklist home + records complete', () => {
  it('returns items with the customer-visible stage', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: `/cases/${caseId}/checklist`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('AWAITING_DOCS');
    expect(body.customer.stage).toBe('awaiting_documents');
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('refuses records-complete with zero documents', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('upload completion appends doc.uploaded; records-complete then starts the clock', async () => {
    const up = await fastify.inject({
      method: 'POST',
      url: '/upload/complete',
      headers: { cookie },
      payload: { caseId, filename: 'rr-vol-1.pdf', s3Key: `cases/${caseId}/x-rr.pdf` },
    });
    expect(up.statusCode).toBe(200);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.uploaded' } })).toBe(1);

    const rc = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(rc.statusCode).toBe(200);
    expect(rc.json().status).toBe('DOCS_COMPLETE');
    expect(rc.json().slaStartedAt).toBeTruthy();
  });

  it('records-complete is once-only (409 on repeat)', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });
});
