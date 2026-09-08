/**
 * Money page + refund ledger (OPS-2, payments_and_refunds spec) — live
 * Postgres, Stripe replaced by a hand-rolled double so the refund path runs
 * end to end: partial then completing refund, over-refund wall, free-promo
 * wall, backfilled payment intent, ledger/summary reads, and the webhook
 * matching refunds and disputes by payment intent.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = 'sk_test_double';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const stripeDouble = vi.hoisted(() => {
  let n = 0;
  return {
    refunds: {
      create: vi.fn(async (params: { payment_intent: string; amount?: number }, _opts?: { idempotencyKey?: string }) => ({
        id: `re_double_${++n}`,
        amount: params.amount ?? 0,
      })),
      list: vi.fn(async () => ({ data: [] })),
    },
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id: string) => ({ id, payment_intent: `pi_backfilled_${id}` })),
        list: vi.fn(async () => ({ data: [] })),
      },
    },
  };
});
vi.mock('../src/services/payments.service', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, getStripe: () => stripeDouble };
});

import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { handleStripeEvent } from '../src/services/payments.service';

const run = `money_${Date.now()}`;
let tenantId: string;
let userId: string;
let adminId: string;
let caseId: string;
let reviewId: string;
let overageId: string;
let freeId: string;
let adminCookie: string;
let clientCookie: string;

const post = async (url: string, payload: Record<string, unknown>, cookie = adminCookie) => {
  const res = await fastify.inject({ method: 'POST', url, headers: { cookie }, payload });
  return res;
};
const get = async (url: string, cookie = adminCookie) => {
  const res = await fastify.inject({ method: 'GET', url, headers: { cookie } });
  return res;
};

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
    data: { title: `${run} Travis County record`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } },
  });
  caseId = c.id;
  const review = await prisma.payment.create({
    data: { stripeId: `cs_${run}_review`, paymentIntentId: `pi_${run}_review`, caseId, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900 },
  });
  reviewId = review.id;
  // An older row without a stored payment intent — the refund path must backfill it.
  const overage = await prisma.payment.create({
    data: { stripeId: `cs_${run}_overage`, caseId, userId, tenantId, kind: 'OVERAGE', status: 'SUCCEEDED', amountCents: 4900 },
  });
  overageId = overage.id;
  const free = await prisma.payment.create({
    data: { stripeId: `promo_FREE_${run}`, caseId, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0, promoCode: 'FREE' },
  });
  freeId = free.id;
  await prisma.costRecord.create({ data: { caseId, tenantId, source: 'model', provider: 'test', amountUsd: 4.5 } });
});

afterAll(async () => {
  await prisma.staffRequest.deleteMany({ where: { tenantId } });
  await prisma.refund.deleteMany({ where: { tenantId } });
  await prisma.costRecord.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.paymentEvent.deleteMany({ where: { stripeEventId: { contains: run } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('ledger reads', () => {
  it('CLIENTs are locked out of every money surface', async () => {
    for (const url of ['/ops/payments', '/ops/payments/summary', '/ops/refunds']) {
      expect((await get(url, clientCookie)).statusCode).toBe(403);
    }
    expect((await post(`/ops/payments/${reviewId}/refund`, { reason: 'other' }, clientCookie)).statusCode).toBe(403);
  });

  it('lists payments with the customer and case joined, searchable by email', async () => {
    const res = await get(`/ops/payments?q=${run}@x.com`);
    expect(res.statusCode).toBe(200);
    const { total, rows } = res.json();
    expect(total).toBe(3);
    const review = rows.find((r: { id: string }) => r.id === reviewId);
    expect(review.customerEmail).toBe(`${run}@x.com`);
    expect(review.caseTitle).toBe(`${run} Travis County record`);
    expect(review.remainingCents).toBe(29900);
    const free = rows.find((r: { id: string }) => r.id === freeId);
    expect(free.free).toBe(true);
    const onlyFree = await get(`/ops/payments?status=free&q=${run}@x.com`);
    expect(onlyFree.json().rows.map((r: { id: string }) => r.id)).toEqual([freeId]);
  });
});

describe('refunds — the OPS-2 path', () => {
  it('a free promo purchase has nothing to refund', async () => {
    const res = await post(`/ops/payments/${freeId}/refund`, { reason: 'customer_request' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Nothing to refund/);
  });

  it('partial refund: Stripe called with the amount, ledger row written, case untouched', async () => {
    const res = await post(`/ops/payments/${reviewId}/refund`, { reason: 'unreadable_record', amountCents: 14900, note: '3 of 9 scans unusable' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('PARTIALLY_REFUNDED');
    expect(body.remainingCents).toBe(15000);
    expect(body.caseTransitioned).toBe(false);

    const call = stripeDouble.refunds.create.mock.calls.at(-1)!;
    expect(call[0]).toMatchObject({ payment_intent: `pi_${run}_review`, amount: 14900 });
    expect(call[1]).toMatchObject({ idempotencyKey: expect.stringContaining(`refund:${reviewId}:0:14900`) });

    const p = await prisma.payment.findUniqueOrThrow({ where: { id: reviewId } });
    expect(p.status).toBe('PARTIALLY_REFUNDED');
    expect(p.refundedCents).toBe(14900);
    const refund = await prisma.refund.findFirstOrThrow({ where: { paymentId: reviewId } });
    expect(refund).toMatchObject({ amountCents: 14900, reason: 'unreadable_record', note: '3 of 9 scans unusable', issuedBy: adminId });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('AWAITING_DOCS');
    const events = await prisma.caseEvent.findMany({ where: { caseId, type: 'payment.refunded' } });
    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(2);
    expect(events[0].payload).toMatchObject({ amountCents: 14900, partial: true, refundId: refund.stripeRefundId });
    const audit = await prisma.auditLog.findFirst({ where: { caseId, action: 'REFUND' } });
    expect(audit?.details).toMatchObject({ op: 'refund_issued', amountCents: 14900, partial: true });
  });

  it('refuses to refund past the remaining balance', async () => {
    const res = await post(`/ops/payments/${reviewId}/refund`, { reason: 'other', amountCents: 20000 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ remainingCents: 15000 });
    expect(res.json().error).toMatch(/\$150\.00/);
  });

  it('completing the balance flips the payment to REFUNDED and moves the case', async () => {
    const res = await post(`/ops/payments/${reviewId}/refund`, { reason: 'customer_request' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ amountCents: 15000, status: 'REFUNDED', remainingCents: 0, caseTransitioned: true });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('REFUNDED');
    expect(await prisma.refund.count({ where: { paymentId: reviewId } })).toBe(2);

    const again = await post(`/ops/payments/${reviewId}/refund`, { reason: 'other' });
    expect(again.statusCode).toBe(409);
  });

  it('refunds an overage payment, backfilling the payment intent from the session', async () => {
    const res = await post(`/ops/payments/${overageId}/refund`, { reason: 'other' });
    expect(res.statusCode).toBe(200);
    expect(stripeDouble.checkout.sessions.retrieve).toHaveBeenCalledWith(`cs_${run}_overage`);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: overageId } });
    expect(p.paymentIntentId).toBe(`pi_backfilled_cs_${run}_overage`);
    expect(p.status).toBe('REFUNDED');
  });

  it('the case-addressed route still works for the drawer and reports no refundable payment once done', async () => {
    const res = await post(`/ops/cases/${caseId}/refund`, { reason: 'other' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/No refundable payment/);
  });
});

describe('summary and refund ledger', () => {
  it('totals and weekly rollup reflect what was collected, refunded, and spent', async () => {
    const res = await get('/ops/payments/summary?days=30');
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.stripe).toBe('test');
    // Other suites share the database; assert on our own contribution.
    expect(s.totals.collectedCents).toBeGreaterThanOrEqual(34800);
    expect(s.totals.refundedCents).toBeGreaterThanOrEqual(34800);
    expect(s.totals.refundCount).toBeGreaterThanOrEqual(3);
    expect(s.totals.costUsd).toBeGreaterThanOrEqual(4.5);
    expect(s.weeks.length).toBeGreaterThanOrEqual(1);
    expect(s.weeks[0]).toMatchObject({ weekOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(s.recentRefunds[0]).toMatchObject({ issuedByEmail: `${run}_admin@x.com` });
  });

  it('attributes a refund to the week its payment was sold, not the week it was issued', async () => {
    const soldAt = new Date(Date.now() - 45 * 86_400_000);
    const old = await prisma.payment.create({
      data: { stripeId: `cs_${run}_old`, paymentIntentId: `pi_${run}_old`, caseId, userId, tenantId, kind: 'RERUN', status: 'SUCCEEDED', amountCents: 9900, createdAt: soldAt },
    });
    expect((await post(`/ops/payments/${old.id}/refund`, { reason: 'other' })).statusCode).toBe(200);

    // A 30-day window neither collected nor refunded it — the refund issued today belongs to a 45-day-old sale.
    const recent = (await get('/ops/payments/summary?days=30')).json();
    const oldWeek = (await import('../src/services/refunds.service')).weekOf(soldAt);
    expect(recent.weeks.find((w: { weekOf: string }) => w.weekOf === oldWeek)).toBeUndefined();

    const wide = (await get('/ops/payments/summary?days=90')).json();
    const week = wide.weeks.find((w: { weekOf: string }) => w.weekOf === oldWeek);
    expect(week).toMatchObject({ collectedCents: expect.any(Number), refundedCents: expect.any(Number) });
    expect(week.collectedCents).toBeGreaterThanOrEqual(9900);
    expect(week.refundedCents).toBeGreaterThanOrEqual(9900);
    expect(wide.totals.refundedCents - recent.totals.refundedCents).toBeGreaterThanOrEqual(9900);
  });

  it('the refund ledger names the issuer and marks partials', async () => {
    const res = await get('/ops/refunds');
    const ours = res.json().filter((r: { caseId: string }) => r.caseId === caseId);
    expect(ours).toHaveLength(4);
    expect(ours.some((r: { partial: boolean; amountCents: number }) => r.partial && r.amountCents === 14900)).toBe(true);
    expect(ours.every((r: { issuedByEmail: string }) => r.issuedByEmail === `${run}_admin@x.com`)).toBe(true);
  });
});

describe('request-to-admin: support asks, admin decides', () => {
  let supportCookie: string;
  let reqCaseId: string;
  let reqPaymentId: string;

  beforeAll(async () => {
    const s = await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId, role: 'SUPPORT' } });
    supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: s.id, tenantId, role: 'SUPPORT' })}`;
    reqCaseId = (await prisma.case.create({
      data: { title: `${run} Nueces County record`, tenantId, status: 'DIGITIZING', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } },
    })).id;
    reqPaymentId = (await prisma.payment.create({
      data: { stripeId: `cs_${run}_req`, paymentIntentId: `pi_${run}_req`, caseId: reqCaseId, userId, tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 29900 },
    })).id;
  });

  it('a declined request needs a line for the requester; the case is untouched', async () => {
    const opened = await post(`/ops/cases/${reqCaseId}/requests`, { type: 'REFUND', reason: 'unreadable_record', amountCents: 14900, note: '3 of 9 scans unusable' }, supportCookie);
    expect(opened.statusCode).toBe(200);
    const id = opened.json().id;
    expect((await get('/ops/payments/summary?days=30')).json().requests.map((r: { id: string }) => r.id)).toContain(id);

    expect((await post(`/ops/requests/${id}/decide`, { decision: 'DECLINED' })).statusCode).toBe(400);
    const declined = await post(`/ops/requests/${id}/decide`, { decision: 'DECLINED', decisionNote: 'Ask the clerk for clean copies first.' });
    expect(declined.statusCode).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: reqPaymentId } })).refundedCents).toBe(0);

    const mine = (await get('/ops/requests', supportCookie)).json();
    expect(mine.decided[0]).toMatchObject({ id, decision: 'DECLINED', decisionNote: 'Ask the clerk for clean copies first.', decidedByEmail: `${run}_admin@x.com` });
    expect((await post(`/ops/requests/${id}/decide`, { decision: 'APPROVED' })).statusCode).toBe(409); // already decided
  });

  it('an approved refund request runs the refund under the ADMIN, with the support note attached', async () => {
    const id = (await post(`/ops/cases/${reqCaseId}/requests`, { type: 'REFUND', reason: 'unreadable_record', amountCents: 14900, note: 'clerk has nothing better' }, supportCookie)).json().id;
    const res = await post(`/ops/requests/${id}/decide`, { decision: 'APPROVED' });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toMatchObject({ ok: true, amountCents: 14900, status: 'PARTIALLY_REFUNDED' });

    const refund = await prisma.refund.findFirstOrThrow({ where: { paymentId: reqPaymentId } });
    expect(refund).toMatchObject({ amountCents: 14900, reason: 'unreadable_record', issuedBy: adminId, note: 'Requested by support: clerk has nothing better' });
    const decidedEvent = await prisma.caseEvent.findFirst({ where: { caseId: reqCaseId, type: 'request.decided' }, orderBy: { createdAt: 'desc' } });
    expect(decidedEvent?.payload).toEqual({ requestId: id, kind: 'REFUND', decision: 'APPROVED' });
    expect(decidedEvent?.actor).toBe(adminId);
  });

  it('an approved deletion request deletes the case scoped, and the decision still lands in its surviving event skeleton', async () => {
    const id = (await post(`/ops/cases/${reqCaseId}/requests`, { type: 'CASE_DELETE', reason: 'customer_request' }, supportCookie)).json().id;
    const res = await post(`/ops/requests/${id}/decide`, { decision: 'APPROVED' });
    expect(res.statusCode).toBe(200);
    expect(await prisma.case.findUnique({ where: { id: reqCaseId } })).toBeNull();
    expect(await prisma.caseEvent.count({ where: { caseId: reqCaseId, type: 'request.decided' } })).toBe(3); // declined, refund approved, deletion approved
    // The ledger survives deletion by design; the request row does too.
    expect((await prisma.staffRequest.findUniqueOrThrow({ where: { id } })).decision).toBe('APPROVED');
  });
});

describe('webhooks keep the ledger honest', () => {
  it('charge.refunded matches by payment intent and records the refund under "stripe"', async () => {
    const p = await prisma.payment.create({
      data: { stripeId: `cs_${run}_wh`, paymentIntentId: `pi_${run}_wh`, caseId, userId, tenantId, kind: 'RERUN', status: 'SUCCEEDED', amountCents: 9900 },
    });
    const res = await handleStripeEvent({
      id: `evt_${run}_refund`,
      type: 'charge.refunded',
      data: { object: { id: `ch_${run}`, payment_intent: `pi_${run}_wh`, amount_refunded: 9900, refunds: { data: [{ id: `re_${run}_wh`, amount: 9900, reason: 'requested_by_customer' }] } } },
    });
    expect(res.detail).toMatch(/1 refund/);
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.status).toBe('REFUNDED');
    expect(after.chargeId).toBe(`ch_${run}`);
    const refund = await prisma.refund.findUniqueOrThrow({ where: { stripeRefundId: `re_${run}_wh` } });
    expect(refund.issuedBy).toBe('stripe');

    // Echo of the same refund (webhook retry, or a console refund's own echo) is a no-op.
    const echo = await handleStripeEvent({
      id: `evt_${run}_refund2`,
      type: 'charge.refunded',
      data: { object: { id: `ch_${run}`, payment_intent: `pi_${run}_wh`, amount_refunded: 9900, refunds: { data: [{ id: `re_${run}_wh`, amount: 9900 }] } } },
    });
    expect(echo.detail).toBe('already recorded');
    expect(await prisma.refund.count({ where: { paymentId: p.id } })).toBe(1);
  });

  it('a dispute marks the payment, blocks console refunds, and a loss becomes a chargeback refund', async () => {
    const p = await prisma.payment.create({
      data: { stripeId: `cs_${run}_disp`, paymentIntentId: `pi_${run}_disp`, caseId, userId, tenantId, kind: 'RERUN', status: 'SUCCEEDED', amountCents: 9900 },
    });
    await handleStripeEvent({
      id: `evt_${run}_disp1`, type: 'charge.dispute.created',
      data: { object: { id: `dp_${run}`, charge: `ch_${run}_d`, payment_intent: `pi_${run}_disp`, status: 'needs_response', amount: 9900 } },
    });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).disputeStatus).toBe('open');
    const blocked = await post(`/ops/payments/${p.id}/refund`, { reason: 'other' });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toMatch(/dispute/);

    await handleStripeEvent({
      id: `evt_${run}_disp2`, type: 'charge.dispute.closed',
      data: { object: { id: `dp_${run}`, charge: `ch_${run}_d`, payment_intent: `pi_${run}_disp`, status: 'lost', amount: 9900 } },
    });
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.disputeStatus).toBe('lost');
    expect(after.status).toBe('REFUNDED');
    const refund = await prisma.refund.findUniqueOrThrow({ where: { stripeRefundId: `dispute:dp_${run}` } });
    expect(refund).toMatchObject({ reason: 'chargeback', issuedBy: 'stripe', amountCents: 9900 });
  });
});
