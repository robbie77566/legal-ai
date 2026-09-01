/** Promo codes (promo_codes.md) — validation, atomic caps, the free path
 *  through real fulfillment, and the admin CRUD. Live Postgres. */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { checkPromo, redeemPromo } from '../src/services/promo.service';
import { DISCLOSURE_SET_VERSION } from '@hg/case-lifecycle';

const run = `promo_${Date.now()}`;
let tenantId: string;
let userId: string;
let clientCookie: string;
let adminCookie: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  const a = await prisma.user.create({ data: { email: `${run}_a@x.com`, tenantId, role: 'ADMIN' } });
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: a.id, tenantId, role: 'ADMIN' })}`;
  await prisma.disclosureAck.create({
    data: { userId, tenantId, disclosureSetVersion: DISCLOSURE_SET_VERSION, ip: '127.0.0.1' },
  });
});

afterAll(async () => {
  await prisma.promoCode.deleteMany({ where: { code: { startsWith: 'T-' } } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('promo service', () => {
  it('validates shape/unknown/inactive/expired/limit generically', async () => {
    await prisma.promoCode.create({ data: { code: 'T-OFF50', amountOffCents: 5000, createdBy: 'test' } });
    await prisma.promoCode.create({ data: { code: 'T-DEAD', amountOffCents: 5000, active: false, createdBy: 'test' } });
    await prisma.promoCode.create({ data: { code: 'T-OLD', amountOffCents: 5000, expiresAt: new Date(Date.now() - 1000), createdBy: 'test' } });
    await prisma.promoCode.create({ data: { code: 'T-FULL', amountOffCents: 5000, maxRedemptions: 1, redeemedCount: 1, createdBy: 'test' } });

    expect((await checkPromo('  t-off50 ', userId)).valid).toBe(true); // normalized
    expect((await checkPromo('nope!!', userId)).reason).toBe('shape');
    expect((await checkPromo('T-NOPE', userId)).reason).toBe('unknown');
    expect((await checkPromo('T-DEAD', userId)).reason).toBe('inactive');
    expect((await checkPromo('T-OLD', userId)).reason).toBe('expired');
    expect((await checkPromo('T-FULL', userId)).reason).toBe('limit');
  });

  it('cap redemption is atomic — parallel racers cannot oversubscribe', async () => {
    await prisma.promoCode.create({ data: { code: 'T-RACE', amountOffCents: 29900, maxRedemptions: 3, createdBy: 'test' } });
    const results = await Promise.all(Array.from({ length: 8 }, () => redeemPromo('T-RACE')));
    expect(results.filter(Boolean)).toHaveLength(3);
    const p = await prisma.promoCode.findUniqueOrThrow({ where: { code: 'T-RACE' } });
    expect(p.redeemedCount).toBe(3);
  });
});

describe('free path (the early-adopter code)', () => {
  it('creates a real case through fulfillment with a $0 ledger row, no Stripe', async () => {
    await prisma.promoCode.create({ data: { code: 'T-EARLY', amountOffCents: 29900, maxRedemptions: 5, createdBy: 'test' } });

    const validate = await fastify.inject({
      method: 'POST', url: '/checkout/promo/validate', headers: { cookie: clientCookie },
      payload: { code: 't-early' },
    });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().newTotalCents).toBe(0);

    const res = await fastify.inject({
      method: 'POST', url: '/checkout/session', headers: { cookie: clientCookie },
      payload: { kind: 'review', promoCode: 'T-EARLY' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.free).toBe(true);
    expect(body.caseId).toBeTruthy();
    expect(body.url).toContain(`/case/${body.caseId}/interview`);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: body.caseId } });
    expect(kase.status).toBe('AWAITING_DOCS');
    const payment = await prisma.payment.findFirstOrThrow({ where: { caseId: body.caseId } });
    expect(payment.amountCents).toBe(0);
    expect(payment.promoCode).toBe('T-EARLY');
    expect(payment.status).toBe('SUCCEEDED');
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { code: 'T-EARLY' } })).redeemedCount).toBe(1);

    // Same user, same code again → generic rejection (ledger check).
    const again = await fastify.inject({
      method: 'POST', url: '/checkout/session', headers: { cookie: clientCookie },
      payload: { kind: 'review', promoCode: 'T-EARLY' },
    });
    expect(again.statusCode).toBe(400);
  });
});

describe('promo admin (/ops/promos)', () => {
  it('CLIENT locked out; ADMIN creates, duplicate 409s, deactivate works', async () => {
    const locked = await fastify.inject({ method: 'GET', url: '/ops/promos', headers: { cookie: clientCookie } });
    expect(locked.statusCode).toBe(403);

    const created = await fastify.inject({
      method: 'POST', url: '/ops/promos', headers: { cookie: adminCookie },
      payload: { code: 't-admin', amountOffCents: 10000, maxRedemptions: 10 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().code).toBe('T-ADMIN');

    const dup = await fastify.inject({
      method: 'POST', url: '/ops/promos', headers: { cookie: adminCookie },
      payload: { code: 'T-ADMIN', amountOffCents: 10000 },
    });
    expect(dup.statusCode).toBe(409);

    const off = await fastify.inject({
      method: 'PATCH', url: `/ops/promos/${created.json().id}`, headers: { cookie: adminCookie },
      payload: { active: false },
    });
    expect(off.statusCode).toBe(200);
    expect((await checkPromo('T-ADMIN', userId)).reason).toBe('inactive');
  });
});
