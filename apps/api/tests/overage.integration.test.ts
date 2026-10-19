/**
 * K1 — the family overage purchase card, api side (persona plan §3 family
 * tail; upload_page_ux_review F8; mvp_ui_design_spec §5.5 page meter).
 *
 * Live Postgres, route level, no Stripe network: `records-complete` answers
 * a typed 402 (`OVERAGE_REQUIRED`) with the exact block count and total, the
 * checkout session carries the block count to Stripe, and a fulfilled
 * overage purchase lets `records-complete` proceed. The price and the block
 * rule are unchanged (5,000 included, $49 per 2,500-page block).
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const stripeDouble = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn(async (params: Record<string, unknown>) => ({ id: `cs_double_${Date.now()}`, url: 'https://checkout.stripe.test/cs_double', params })),
      retrieve: vi.fn(async () => { throw new Error('not used'); }),
    },
  },
}));
vi.mock('../src/services/payments.service', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, getStripe: () => stripeDouble };
});

import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { handleStripeEvent } from '../src/services/payments.service';

const run = `overage_${Date.now()}`;
let tenantId: string;
let userId: string;
let cookie: string;
const caseIds: string[] = [];

const seedCase = async (pages: number) => {
  const c = await prisma.case.create({
    data: {
      title: `${run}_${pages}`,
      tenantId,
      status: 'AWAITING_DOCS',
      lane: 'TRIAL',
      vehicle: '11.07',
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseIds.push(c.id);
  const d = await prisma.document.create({ data: { filename: 'rr-all.pdf', caseId: c.id, s3Key: `cases/${c.id}/rr-all.pdf` } });
  await prisma.documentPage.createMany({
    data: Array.from({ length: pages }, (_, i) => ({ documentId: d.id, pageNo: i + 1, contentHash: `${run}_${c.id}_${i + 1}`, billable: true })),
  });
  return c.id;
};

const recordsComplete = (caseId: string) =>
  fastify.inject({ method: 'POST', url: `/cases/${caseId}/records-complete`, headers: { cookie } });

const fulfilOverage = (caseId: string, blocks: number, tag: string) =>
  handleStripeEvent({
    id: `evt_${run}_${tag}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${run}_${tag}`,
        amount_total: 4900 * blocks,
        // Stripe metadata values are always strings.
        metadata: { userId, tenantId, kind: 'overage', caseId, blocks: String(blocks) },
      },
    },
  });

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
});

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.paymentEvent.deleteMany({ where: { stripeEventId: { contains: run } } });
  await prisma.documentPage.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
  await prisma.document.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('records-complete overage gate (K1)', () => {
  it('5,100 pages → 402 OVERAGE_REQUIRED, one block, $49, and the typed checkout hint', async () => {
    const caseId = await seedCase(5100);
    const res = await recordsComplete(caseId);
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body).toMatchObject({
      error: 'OVERAGE_REQUIRED',
      pagesOver: 100,
      blocks: 1,
      cents: 4900,
      checkout: { kind: 'overage', blocks: 1 },
      // the fields the response already carried stay
      billablePages: 5100,
      allowance: 5000,
      blocksNeeded: 1,
      blockPriceCents: 4900,
    });
    // Nothing moved: the clock has not started and the pages are still here.
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.status).toBe('AWAITING_DOCS');
    expect(kase.slaStartedAt).toBeNull();

    // After the overage purchase is fulfilled, records-complete proceeds.
    const fulfilled = await fulfilOverage(caseId, 1, 'one');
    expect(fulfilled.handled).toBe(true);
    const again = await recordsComplete(caseId);
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe('DOCS_COMPLETE');
  });

  it('7,600 pages → two blocks, $98; a two-block purchase in one session covers it', async () => {
    const caseId = await seedCase(7600);
    const res = await recordsComplete(caseId);
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: 'OVERAGE_REQUIRED', pagesOver: 2600, blocks: 2, cents: 9800, checkout: { kind: 'overage', blocks: 2 } });

    // One block bought is not enough — the gate asks for exactly the rest.
    await fulfilOverage(caseId, 1, 'two_a');
    const partial = await recordsComplete(caseId);
    expect(partial.statusCode).toBe(402);
    expect(partial.json()).toMatchObject({ blocks: 1, cents: 4900, allowance: 7500, pagesOver: 100 });

    await fulfilOverage(caseId, 1, 'two_b');
    expect((await recordsComplete(caseId)).statusCode).toBe(200);
  });

  it('a single session that bought two blocks counts as two', async () => {
    const caseId = await seedCase(7600);
    const fulfilled = await fulfilOverage(caseId, 2, 'multi');
    expect(fulfilled.handled).toBe(true);
    const payments = await prisma.payment.findMany({ where: { caseId, kind: 'OVERAGE' } });
    expect(payments).toHaveLength(1); // one session, one ledger row — refunds still match by session
    expect(payments[0].amountCents).toBe(9800);
    expect((await recordsComplete(caseId)).statusCode).toBe(200);
  });

  it('a case within the allowance is unaffected (family path unchanged)', async () => {
    const caseId = await seedCase(5000);
    expect((await recordsComplete(caseId)).statusCode).toBe(200);
  });
});

describe('POST /checkout/session kind=overage (K1)', () => {
  it('sends the block count to Stripe as the quantity, lands back on the documents page, and keeps the family price', async () => {
    const caseId = await seedCase(10);
    const res = await fastify.inject({
      method: 'POST',
      url: '/checkout/session',
      headers: { cookie },
      payload: { kind: 'overage', caseId, blocks: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://checkout.stripe.test/cs_double');
    const call = stripeDouble.checkout.sessions.create.mock.calls.at(-1)![0] as {
      line_items: Array<{ quantity: number; price_data: { unit_amount: number } }>;
      success_url: string;
      metadata: Record<string, string>;
    };
    expect(call.line_items[0].quantity).toBe(2);
    expect(call.line_items[0].price_data.unit_amount).toBe(4900);
    expect(call.success_url).toBe(`http://localhost:3000/case/${caseId}/documents?overage=1`);
    expect(call.metadata).toMatchObject({ kind: 'overage', caseId, blocks: '2' });
  });

  it('blocks defaults to one and must be a whole number', async () => {
    const caseId = await seedCase(10);
    const one = await fastify.inject({ method: 'POST', url: '/checkout/session', headers: { cookie }, payload: { kind: 'overage', caseId } });
    expect(one.statusCode).toBe(200);
    const call = stripeDouble.checkout.sessions.create.mock.calls.at(-1)![0] as { line_items: Array<{ quantity: number }> };
    expect(call.line_items[0].quantity).toBe(1);
    const bad = await fastify.inject({ method: 'POST', url: '/checkout/session', headers: { cookie }, payload: { kind: 'overage', caseId, blocks: 1.5 } });
    expect(bad.statusCode).toBe(400);
    const zero = await fastify.inject({ method: 'POST', url: '/checkout/session', headers: { cookie }, payload: { kind: 'overage', caseId, blocks: 0 } });
    expect(zero.statusCode).toBe(400);
  });

  it('an overage needs a case to attach to', async () => {
    const res = await fastify.inject({ method: 'POST', url: '/checkout/session', headers: { cookie }, payload: { kind: 'overage', blocks: 1 } });
    expect(res.statusCode).toBe(400);
  });
});
