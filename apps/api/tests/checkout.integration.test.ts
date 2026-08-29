/**
 * W-2 disclosure-ack flow, route level, against live Postgres:
 * account creation → ack → checkout gate ordering.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { DISCLOSURE_SET_VERSION } from '@hg/case-lifecycle';

const run = `ack_${Date.now()}`;
let tenantId: string;
let userId: string;
let clientCookie: string;
let staffCookie: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' },
  });
  userId = u.id;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  staffCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'ATTORNEY' })}`;
});

afterAll(async () => {
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('POST /buy/account', () => {
  it('creates a CLIENT user in a single-member tenant', async () => {
    const email = `${run}_new@example.com`;
    const res = await fastify.inject({
      method: 'POST',
      url: '/buy/account',
      payload: { email, password: 'CorrectHorse9Battery!', name: 'Maria' },
    });
    expect(res.statusCode).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe('CLIENT');
    expect(user.passwordHash).toBeTruthy();
    const members = await prisma.user.count({ where: { tenantId: user.tenantId } });
    expect(members).toBe(1);

    // cleanup
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: user.tenantId } });
  });

  it('is enumeration-safe for existing emails', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/buy/account',
      payload: { email: `${run}@example.com`, password: 'CorrectHorse9Battery!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects weak passwords', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/buy/account',
      payload: { email: `${run}_weak@example.com`, password: 'short' },
    });
    expect(res.statusCode).toBe(500 /* zod parse throws */);
    expect(await prisma.user.findUnique({ where: { email: `${run}_weak@example.com` } })).toBeNull();
  });
});

describe('disclosure acknowledgment gate (W-2)', () => {
  it('checkout is refused before the disclosures are acknowledged', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/checkout/session',
      headers: { cookie: clientCookie },
      payload: { kind: 'review' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('staff roles cannot acknowledge or purchase', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/buy/disclosure-ack',
      headers: { cookie: staffCookie },
      payload: { disclosureSetVersion: DISCLOSURE_SET_VERSION },
    });
    expect(res.statusCode).toBe(403);
  });

  it('records the ack with version, IP, and UA — then checkout passes the gate', async () => {
    const ackRes = await fastify.inject({
      method: 'POST',
      url: '/buy/disclosure-ack',
      headers: { cookie: clientCookie, 'user-agent': 'vitest' },
      payload: { disclosureSetVersion: DISCLOSURE_SET_VERSION },
    });
    expect(ackRes.statusCode).toBe(200);

    const ack = await prisma.disclosureAck.findFirstOrThrow({ where: { userId } });
    expect(ack.disclosureSetVersion).toBe(DISCLOSURE_SET_VERSION);
    expect(ack.ip).toBeTruthy();
    expect(ack.userAgent).toBe('vitest');
    expect(ack.caseId).toBeNull(); // linked at fulfillment

    // Gate now passes; Stripe is unconfigured in tests so the next wall is 503.
    const res = await fastify.inject({
      method: 'POST',
      url: '/checkout/session',
      headers: { cookie: clientCookie },
      payload: { kind: 'review' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('an ack for a stale disclosure-set version is rejected', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/buy/disclosure-ack',
      headers: { cookie: clientCookie },
      payload: { disclosureSetVersion: '2020-01-01.0' },
    });
    expect(res.statusCode).toBe(500 /* zod literal mismatch */);
  });
});
