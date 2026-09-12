process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Stripe from 'stripe';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setStripeForTests } from '../src/services/payments.service';

/** 2026-09-12: "payment accepted but the page never updates" — no webhook
 *  endpoint existed in Stripe and the hourly sweep had been reset by every
 *  deploy. The success page's poll now fulfills a paid session itself. */
const run = `heal_${Date.now()}`;
let tenantId: string; let userId: string; let otherId: string; let cookie: string;
const sessions = new Map<string, Partial<Stripe.Checkout.Session>>();
const fake = { checkout: { sessions: { retrieve: async (id: string) => { const s = sessions.get(id); if (!s) throw new Error('No such checkout.session'); return s; } } } } as unknown as Stripe;

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } })).id;
  otherId = (await prisma.user.create({ data: { email: `${run}_o@x.com`, tenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  __setStripeForTests(fake);
});
afterAll(async () => {
  __setStripeForTests(undefined);
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await fastify.close();
});

describe('GET /checkout/fulfillment self-heal', () => {
  it('a paid session for this buyer with no payment row is fulfilled on the spot, idempotently', async () => {
    const id = `cs_test_${run}_paid`;
    sessions.set(id, { id, payment_status: 'paid', amount_total: 29900, metadata: { userId, tenantId, kind: 'review' }, payment_intent: 'pi_heal' } as Partial<Stripe.Checkout.Session>);
    const first = await fastify.inject({ method: 'GET', url: `/checkout/fulfillment?session_id=${id}`, headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ kind: 'review', healed: true });
    const caseId = first.json().caseId as string;
    expect(caseId).toBeTruthy();
    const row = await prisma.payment.findUniqueOrThrow({ where: { stripeId: id } });
    expect(row).toMatchObject({ userId, caseId, status: 'SUCCEEDED', amountCents: 29900, paymentIntentId: 'pi_heal' });
    // Second poll reads the row — no second fulfillment, same case.
    const again = await fastify.inject({ method: 'GET', url: `/checkout/fulfillment?session_id=${id}`, headers: { cookie } });
    expect(again.json()).toEqual({ caseId, kind: 'review' });
    expect(await prisma.payment.count({ where: { stripeId: id } })).toBe(1);
  });

  it('never fulfills an unpaid session, someone else\'s session, or an unknown id', async () => {
    const unpaid = `cs_test_${run}_open`;
    sessions.set(unpaid, { id: unpaid, payment_status: 'unpaid', amount_total: 29900, metadata: { userId, tenantId, kind: 'review' } } as Partial<Stripe.Checkout.Session>);
    const other = `cs_test_${run}_other`;
    sessions.set(other, { id: other, payment_status: 'paid', amount_total: 29900, metadata: { userId: otherId, tenantId, kind: 'review' } } as Partial<Stripe.Checkout.Session>);
    for (const id of [unpaid, other, `cs_test_${run}_nope`]) {
      const res = await fastify.inject({ method: 'GET', url: `/checkout/fulfillment?session_id=${id}`, headers: { cookie } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ pending: true });
      expect(await prisma.payment.count({ where: { stripeId: id } })).toBe(0);
    }
  });
});
