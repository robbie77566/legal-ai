/**
 * Commerce integration tests (M2, ENG-5) — real Postgres, no Stripe network:
 * the webhook/reconciliation core is exercised directly through
 * handleStripeEvent / fulfillCheckoutSession.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@hg/database';
import { handleStripeEvent } from '../src/services/payments.service';

const run = `pay_${Date.now()}`;
let tenantId: string;
let userId: string;

const sessionEvent = (eventId: string, sessionId: string, draftToken?: string) => ({
  id: eventId,
  type: 'checkout.session.completed',
  data: {
    object: {
      id: sessionId,
      amount_total: 29900,
      metadata: { userId, tenantId, kind: 'review', ...(draftToken ? { draftToken } : {}) },
    },
  },
});

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.paymentEvent.deleteMany({ where: { stripeEventId: { contains: run } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  // CaseEvent rows stay behind by design (append-only, §11a.2).
  await prisma.$disconnect();
});

describe('checkout fulfillment', () => {
  it('creates case + payment + events and promotes/deletes the S0 draft', async () => {
    await prisma.eligibilityDraft.create({
      data: {
        token: `${run}_draft`,
        answers: { trialOrPlea: 'trial' },
        outcome: 'fit_trial',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    // A pre-purchase disclosure ack must get bound to the case (E-6/OPS-3).
    await prisma.disclosureAck.create({
      data: { userId, tenantId, disclosureSetVersion: 'test.1', ip: '127.0.0.1' },
    });

    const res = await handleStripeEvent(sessionEvent(`evt_${run}_1`, `cs_${run}_1`, `${run}_draft`));
    expect(res.handled).toBe(true);

    const c = await prisma.case.findFirstOrThrow({ where: { tenantId } });
    expect(c.status).toBe('AWAITING_DOCS');
    expect(c.lane).toBe('TRIAL');
    expect(c.vehicle).toBe('11.07');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeId: `cs_${run}_1` } });
    expect(payment.status).toBe('SUCCEEDED');
    expect(payment.caseId).toBe(c.id);

    const access = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId: c.id, userId } },
    });
    expect(access?.role).toBe('ADMIN');

    const events = await prisma.caseEvent.findMany({ where: { caseId: c.id }, orderBy: { id: 'asc' } });
    expect(events.map((e) => e.type)).toEqual(['case.created', 'payment.succeeded']);

    // ENG-7: promotion copies then deletes
    expect(await prisma.eligibilityDraft.findUnique({ where: { token: `${run}_draft` } })).toBeNull();

    // E-6: the ack archive is now case-bound for one-query dispute export
    const ack = await prisma.disclosureAck.findFirstOrThrow({ where: { userId } });
    expect(ack.caseId).toBe(c.id);
  });

  it('a replayed webhook event is a no-op (level-1 idempotency)', async () => {
    const res = await handleStripeEvent(sessionEvent(`evt_${run}_1`, `cs_${run}_1`));
    expect(res.handled).toBe(false);
    expect(res.detail).toBe('duplicate event');
    expect(await prisma.case.count({ where: { tenantId } })).toBe(1);
  });

  it('the same session under a new event id is fulfilled once (level-2 idempotency, reconciliation path)', async () => {
    const res = await handleStripeEvent(sessionEvent(`evt_${run}_2`, `cs_${run}_1`));
    expect(res.handled).toBe(true);
    expect(res.detail).toContain('already fulfilled');
    expect(await prisma.case.count({ where: { tenantId } })).toBe(1);
  });

  it('a subsequent-writ outcome sets the mode hold from day one (E-7/FR-9)', async () => {
    await prisma.eligibilityDraft.create({
      data: {
        token: `${run}_draft2`,
        answers: { trialOrPlea: 'plea' },
        outcome: 'prior_writ_warned',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await handleStripeEvent(sessionEvent(`evt_${run}_3`, `cs_${run}_2`, `${run}_draft2`));

    const c = await prisma.case.findFirstOrThrow({ where: { tenantId, subsequentWrit: true } });
    expect(c.lane).toBe('PLEA');
    const holdEvents = await prisma.caseEvent.findMany({ where: { caseId: c.id, type: 'hold.set' } });
    expect(holdEvents).toHaveLength(1);
  });

  it('charge.refunded flips the ledger row', async () => {
    await handleStripeEvent({
      id: `evt_${run}_4`,
      type: 'charge.refunded',
      data: { object: { id: 'ch_x', payment_intent: `cs_${run}_2` } },
    });
    const p = await prisma.payment.findUniqueOrThrow({ where: { stripeId: `cs_${run}_2` } });
    expect(p.status).toBe('REFUNDED');
  });

  it('missing metadata is skipped, never a crash', async () => {
    const res = await handleStripeEvent({
      id: `evt_${run}_5`,
      type: 'checkout.session.completed',
      data: { object: { id: `cs_${run}_naked`, amount_total: 100, metadata: null } },
    });
    expect(res.handled).toBe(true);
    expect(res.detail).toBe('missing metadata');
  });
});
