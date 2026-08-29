/**
 * S7 integration tests (US-5 consent + ENG-8 share links) — live Postgres.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `s7_${Date.now()}`;
let tenantId: string;
let userId: string;
let caseId: string;
let cookie: string;
let shareToken: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL',
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.consentGrant.deleteMany({ where: { tenantId } });
  await prisma.report.deleteMany({ where: { tenantId } });
  await prisma.caseAccess.deleteMany({ where: { caseId } });
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('consent gating (US-5)', () => {
  it('consent and sharing are refused before the report is ready', async () => {
    const consent = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent`, headers: { cookie },
      payload: { recipientClass: 'clinic' },
    });
    expect(consent.statusCode).toBe(403);
    const share = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/share-link`, headers: { cookie },
    });
    expect(share.statusCode).toBe(403);
  });

  it('after READY: grant is explicit + evented; revoke works; default is OFF', async () => {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'READY' } });
    await prisma.report.create({
      data: {
        caseId, tenantId, runId: 'r1', templateVersion: 'AB-v1', approvedBy: 'qa',
        findingsSnapshot: { findings: [] },
      },
    });

    const before = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/consent`, headers: { cookie } });
    expect(before.json().grants).toHaveLength(0); // default: nothing shared

    const grant = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent`, headers: { cookie },
      payload: { recipientClass: 'clinic' },
    });
    expect(grant.statusCode).toBe(200);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'consent.granted' } })).toBe(1);

    const revoke = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent/revoke`, headers: { cookie },
      payload: { recipientClass: 'clinic' },
    });
    expect(revoke.statusCode).toBe(200);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'consent.revoked' } })).toBe(1);
  });
});

describe('share-with-a-lawyer link (ENG-8)', () => {
  it('creates a link whose raw token is never stored', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/share-link`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    shareToken = res.json().token;
    const stored = await prisma.shareLink.findFirstOrThrow({ where: { caseId } });
    expect(stored.tokenHash).not.toBe(shareToken);
    expect(stored.tokenHash).toHaveLength(64);
  });

  it('the anonymous shared view serves Part B with the R-7 notice and logs the open', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/shared/${shareToken}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().notice).toMatch(/does not itself create an attorney-client relationship/);

    const activity = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/share-link/activity`, headers: { cookie },
    });
    expect(activity.json().links[0].opens).toBe(1);
  });

  it('a wrong token 404s; a revoked link 404s', async () => {
    expect((await fastify.inject({ method: 'GET', url: '/shared/not-a-token' })).statusCode).toBe(404);
    await fastify.inject({ method: 'POST', url: `/cases/${caseId}/share-link/revoke`, headers: { cookie } });
    expect((await fastify.inject({ method: 'GET', url: `/shared/${shareToken}` })).statusCode).toBe(404);
  });
});
