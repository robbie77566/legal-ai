/**
 * Counsel checkout (persona_rollout_plan.md §5 B) — live Postgres.
 *  B7  quote by bucket through the route; Long → quote request + admin email;
 *      FAMILY 403 on every counsel checkout route; flag off → 404
 *  B8  packs: webhook fulfilment issues five credits; five quotes by CREDIT
 *      consume five; the sixth answers PACK_EXHAUSTED and offers PAY; an
 *      expired credit is skipped
 *  B9  allowance: a PD office on pilot with 15 records → 15 entries, the
 *      16th refused, a retry never double-counts, analysis start refuses a
 *      counsel case that skipped the quote
 *  B10 family unchanged: PRICES_CENTS, records-complete never enters QUOTED
 *  B11 promo: maxRedemptionsPerMonth on FIRST_REVIEW_FREE, audience
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_counsel';
delete process.env.STRIPE_PRICE_COUNSEL_SHORT;
delete process.env.STRIPE_PRICE_COUNSEL_STANDARD;
delete process.env.STRIPE_PRICE_COUNSEL_EXTENDED;
delete process.env.STRIPE_PRICE_PACK_SHORT;
delete process.env.STRIPE_PRICE_PACK_STANDARD;
delete process.env.STRIPE_PRICE_PACK_EXTENDED;

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type Stripe from 'stripe';

// The pipeline is not run here: enqueueAnalysis is a spy so the tests can
// say exactly when the acceptance kicked it (and when it must not).
const queueMock = vi.hoisted(() => ({ enqueueAnalysis: vi.fn(async () => {}) }));
vi.mock('../src/services/queue', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, enqueueAnalysis: queueMock.enqueueAnalysis };
});

import { fastify } from '../src/index';
import prisma, { withTenant } from '@hg/database';
import { __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests } from '@hg/email';
import { DEFAULT_PRICE_BOOK, resolvePrice } from '@hg/case-lifecycle';
import { __setStripeForTests, PRICES_CENTS } from '../src/services/payments.service';
import { runAnalysis, type AnalysisModel } from '../src/services/analysis.service';
import { assertQuoteSettled } from '../src/services/quote.service';
import { checkPromoCode } from '../src/services/promo.service';

const run = `cq_${Date.now()}`;
const codeStem = run.replace('_', '').toUpperCase(); // promo codes are letters, digits and dashes

interface Account { userId: string; organisationId: string; tenantId: string; cookie: string; email: string }

// ── Stripe fake: records every Checkout session; the webhook trusts the body.
const sessions = new Map<string, Record<string, unknown>>();
let seq = 0;
const fake = {
  checkout: {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        const id = `cs_test_${run}_${++seq}`;
        sessions.set(id, params);
        return { id, url: `https://checkout.stripe.test/${id}` };
      },
      retrieve: async () => { throw new Error('No such checkout.session'); },
    },
  },
  webhooks: { constructEvent: (body: Buffer) => JSON.parse(body.toString('utf8')) },
} as unknown as Stripe;

let evt = 0;
const webhook = (session: Record<string, unknown>) =>
  fastify.inject({
    method: 'POST',
    url: '/webhooks/stripe',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=test' },
    payload: JSON.stringify({ id: `evt_${run}_${++evt}`, type: 'checkout.session.completed', data: { object: session } }),
  });
const paidSession = (id: string) => {
  const p = sessions.get(id)!;
  const item = (p.line_items as { price_data?: { unit_amount: number } }[])[0];
  const meta = p.metadata as Record<string, string>;
  return { id, payment_status: 'paid', amount_total: item.price_data?.unit_amount ?? Number(meta.cents), metadata: meta, payment_intent: `pi_${id}` };
};

const sent: { to: string; subject: string; text: string }[] = [];
const until = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
  expect(pred()).toBe(true);
};

const get = (url: string, cookie?: string) => fastify.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
const post = (url: string, cookie: string | undefined, payload: unknown = {}) =>
  fastify.inject({ method: 'POST', url, headers: cookie ? { cookie } : {}, payload: payload as Record<string, unknown> });
const quoteOf = (a: Account, caseId: string, qs = '') => get(`/counsel/matters/${caseId}/quote${qs}`, a.cookie);
const accept = (a: Account, caseId: string, body: Record<string, unknown>) => post(`/counsel/matters/${caseId}/quote/accept`, a.cookie, body);

let staffTenant: string;
let adminEmail: string;
let admin2Email: string;
let adminCookie: string;
let family: Account;
let attorney: Account; // FIRM, bar verified, free review already taken (last month) — packs and card
let verified: Account; // FIRM, bar verified, first review still to come — the free first review and partner codes
let dark: Account; // FIRM, counsel_checkout off
let pd: Account; // PD_OFFICE on pilot
const tenants: string[] = [];
let n = 0;

async function signup(tag: string, extra: Record<string, unknown> = {}): Promise<Account> {
  const email = `${run}_${tag}@example.com`;
  const res = await fastify.inject({
    method: 'POST', url: '/counsel/signup',
    payload: { email, password: 'CorrectHorse9Battery!', name: `${tag} Counsel`, barNumber: `2400${String(++n).padStart(4, '0')}`, practiceType: 'writ', ...extra },
  });
  expect(res.statusCode).toBe(200);
  const { userId, organisationId } = res.json();
  // The quote routes are behind the lawyer gate (UPL review 2026-10-23, P1): every quoting account is verified.
  const user = await prisma.user.update({ where: { id: userId }, data: { barVerifiedAt: new Date(), barVerificationStatus: 'VERIFIED' } });
  tenants.push(user.tenantId);
  return { userId, organisationId, tenantId: user.tenantId, email, cookie: `next-auth.session-token=${await encodeSessionToken({ userId, tenantId: user.tenantId, role: 'CLIENT' })}` };
}

async function lightCheckout(tenantId: string) {
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_tenantId: { flagKey: 'counsel_checkout', tenantId } },
    update: { enabled: true, updatedBy: 'test' },
    create: { flagKey: 'counsel_checkout', tenantId, enabled: true, updatedBy: 'test' },
  });
  __invalidateFlagCache();
}

async function mkCase(a: Account, bucket: 'SHORT' | 'STANDARD' | 'EXTENDED' | 'LONG', reporter: number, status: 'DOCS_COMPLETE' | 'AWAITING_DOCS' = 'DOCS_COMPLETE') {
  return prisma.case.create({
    data: {
      title: `${run}_${bucket}_${++n}`, tenantId: a.tenantId, status, lane: 'TRIAL', vehicle: '11.07',
      recordBucket: bucket, meteredPages: { reporter, clerk: 0, exhibit: 0, unknown: 0 },
      accessList: { create: { userId: a.userId, role: 'ADMIN' } },
    },
  });
}

beforeAll(async () => {
  __setStripeForTests(fake);
  __setEmailProviderForTests({ send: async (m) => { sent.push(m); return { delivered: true }; } });

  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  tenants.push(staffTenant);
  adminEmail = `${run}_admin@example.com`;
  admin2Email = `${run}_admin2@example.com`;
  const admin = await prisma.user.create({ data: { email: adminEmail, tenantId: staffTenant, role: 'ADMIN' } });
  await prisma.user.create({ data: { email: admin2Email, tenantId: staffTenant, role: 'ADMIN' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId: staffTenant, role: 'ADMIN' })}`;

  const famTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  tenants.push(famTenant);
  const fam = await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: famTenant, role: 'CLIENT' } });
  family = { userId: fam.id, organisationId: '', tenantId: famTenant, email: fam.email, cookie: `next-auth.session-token=${await encodeSessionToken({ userId: fam.id, tenantId: famTenant, role: 'CLIENT' })}` };

  attorney = await signup('attorney');
  verified = await signup('verified');
  dark = await signup('dark');
  pd = await signup('pd', { practiceType: 'pd', organisationName: 'Travis County Public Defender', organisationKind: 'PD_OFFICE' });
  await prisma.user.update({ where: { id: verified.userId }, data: { barVerifiedBy: admin.id } });
  // "attorney" took the free first review last month: quotes are PAY (NOT_FIRST_REVIEW) and the month cap is untouched.
  const lastMonth = new Date(); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 15);
  await prisma.payment.create({
    data: { stripeId: `free_prior_${run}`, userId: attorney.userId, tenantId: attorney.tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0, promoCode: 'FIRST_REVIEW_FREE', sku: 'COUNSEL_SHORT', rung: 'SHORT', createdAt: lastMonth },
  });
  await prisma.organisation.update({
    where: { id: pd.organisationId },
    data: { pilot: true, pilotEndsAt: new Date(Date.now() + 90 * 86400_000), allowanceRecords: 15 },
  });
  for (const t of [attorney, verified, pd]) await lightCheckout(t.tenantId);
});

afterAll(async () => {
  __setStripeForTests(undefined);
  __setEmailProviderForTests(undefined);
  await prisma.promoCode.deleteMany({ where: { code: { in: ['FIRST_REVIEW_FREE', `${codeStem}-FAM`, `${codeStem}-BAR`, `${codeStem}-MONTH`] } } });
  await prisma.featureFlagOverride.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.paymentEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_${run}` } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.credit.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.allowanceEntry.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.quoteRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.document.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

// ── B7 ───────────────────────────────────────────────────────────────────────

describe('B7 — quote by bucket through the route', () => {
  it.each([
    ['SHORT', 80, 14900, 'COUNSEL_SHORT', 'NOT_FIRST_REVIEW'],
    ['STANDARD', 300, 24900, 'COUNSEL_STANDARD', 'NOT_FIRST_REVIEW'],
    ['EXTENDED', 900, 34900, 'COUNSEL_EXTENDED', 'TOO_MANY_PAGES'],
  ] as const)('%s → PAY %i (%s)', async (bucket, pages, cents, sku, freeFirstRefused) => {
    const c = await mkCase(attorney, bucket, pages);
    const res = await quoteOf(attorney, c.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      caseId: c.id, status: 'DOCS_COMPLETE', audience: 'ATTORNEY', bucket,
      meteredPages: { reporter: pages, total: pages },
      decision: { kind: 'PAY', cents, listCents: cents, rung: bucket, sku, freeFirstRefused },
      methods: ['CARD'],
      allowance: null,
      credits: { live: 0, unspent: 0 },
    });
    // Reading a quote persists nothing.
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DOCS_COMPLETE');
    expect(await prisma.caseEvent.count({ where: { caseId: c.id } })).toBe(0);
  });

  it('LONG → QUOTE_REQUIRED from 49900; POST …/quote/request writes the QuoteRequest, parks the case at QUOTED and emails every admin', async () => {
    const c = await mkCase(attorney, 'LONG', 2200);
    const q = await quoteOf(attorney, c.id);
    expect(q.statusCode).toBe(200);
    expect(q.json()).toMatchObject({ decision: { kind: 'QUOTE_REQUIRED', from: 49900, sku: 'COUNSEL_LONG' }, methods: [] });
    for (const method of ['CARD', 'CREDIT', 'ALLOWANCE', 'FREE']) {
      const r = await accept(attorney, c.id, { method });
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({ error: 'METHOD_NOT_AVAILABLE', method, methods: [] });
    }

    sent.length = 0;
    const res = await post(`/counsel/matters/${c.id}/quote/request`, attorney.cookie, { note: 'Seven volumes, capital case' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, quoteRequest: { status: 'OPEN' } });
    const qr = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: res.json().quoteRequest.id } });
    expect(qr).toMatchObject({
      tenantId: attorney.tenantId, caseId: c.id, requestedBy: attorney.userId, status: 'OPEN',
      note: 'Seven volumes, capital case', meteredPages: { reporter: 2200, clerk: 0, exhibit: 0, total: 2200 }, quotedCents: null, decidedBy: null,
    });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('QUOTED');
    expect(await prisma.caseEvent.count({ where: { caseId: c.id, type: 'quote.requested' } })).toBe(1);

    await until(() => sent.some((m) => m.to === adminEmail) && sent.some((m) => m.to === admin2Email));
    const mine = sent.filter((m) => m.to === adminEmail);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain('Quote needed');
    expect(mine[0].text).toContain('2,200');
    expect(mine[0].text).toContain('Seven volumes, capital case');
    expect(mine[0].text).toContain('/ops/quote-requests');
    expect(mine[0].text).not.toContain(c.id);

    // Asking twice is one request.
    sent.length = 0;
    const again = await post(`/counsel/matters/${c.id}/quote/request`, attorney.cookie, { note: 'still waiting' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ ok: true, idempotent: true, quoteRequest: { id: qr.id } });
    expect(await prisma.quoteRequest.count({ where: { caseId: c.id } })).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);

    // The quote view carries the open request.
    expect((await quoteOf(attorney, c.id)).json().quoteRequest).toMatchObject({ id: qr.id, status: 'OPEN', quotedCents: null });
    // A STANDARD record cannot ask for a quote.
    const std = await mkCase(attorney, 'STANDARD', 300);
    const nope = await post(`/counsel/matters/${std.id}/quote/request`, attorney.cookie, {});
    expect(nope.statusCode).toBe(409);
    expect(nope.json()).toMatchObject({ error: 'NOT_LONG' });
  });

  it('a case that is not metered or not at DOCS_COMPLETE/QUOTED is refused; another tenant\'s case is 404', async () => {
    const unmetered = await prisma.case.create({ data: { title: `${run}_unmetered`, tenantId: attorney.tenantId, status: 'DOCS_COMPLETE', accessList: { create: { userId: attorney.userId, role: 'ADMIN' } } } });
    expect((await quoteOf(attorney, unmetered.id)).statusCode).toBe(409);
    expect((await quoteOf(attorney, unmetered.id)).json()).toMatchObject({ error: 'NOT_METERED' });
    // The caller may name the bucket until the meter has run.
    expect((await quoteOf(attorney, unmetered.id, '?bucket=SHORT')).json()).toMatchObject({ bucket: 'SHORT', decision: { kind: 'PAY', cents: 14900 } });
    const early = await mkCase(attorney, 'SHORT', 50, 'AWAITING_DOCS');
    expect((await quoteOf(attorney, early.id)).json()).toMatchObject({ error: 'NOT_READY', caseStatus: 'AWAITING_DOCS' });
    const theirs = await mkCase(verified, 'SHORT', 50);
    expect((await quoteOf(attorney, theirs.id)).statusCode).toBe(404);
  });

  it('a FAMILY account gets 403 on every counsel checkout route, a professional whose flag is dark gets 404, anonymous 401', async () => {
    const famCase = await mkCase(family, 'SHORT', 50);
    const routes: [string, string, unknown?][] = [
      ['GET', `/counsel/matters/${famCase.id}/quote`],
      ['POST', `/counsel/matters/${famCase.id}/quote/accept`, { method: 'CARD' }],
      ['POST', `/counsel/matters/${famCase.id}/quote/request`, {}],
      ['POST', '/counsel/packs', { rung: 'SHORT' }],
      ['GET', '/counsel/credits'],
      ['GET', '/counsel/allowance'],
    ];
    for (const [method, url, payload] of routes) {
      const fam = await fastify.inject({ method: method as 'GET' | 'POST', url, headers: { cookie: family.cookie }, ...(payload ? { payload: payload as Record<string, unknown> } : {}) });
      expect(fam.statusCode, `${method} ${url} family`).toBe(403);
      const off = await fastify.inject({ method: method as 'GET' | 'POST', url, headers: { cookie: dark.cookie }, ...(payload ? { payload: payload as Record<string, unknown> } : {}) });
      expect(off.statusCode, `${method} ${url} flag off`).toBe(404);
      const anon = await fastify.inject({ method: method as 'GET' | 'POST', url, ...(payload ? { payload: payload as Record<string, unknown> } : {}) });
      expect(anon.statusCode, `${method} ${url} anonymous`).toBe(401);
    }
    expect(await prisma.caseEvent.count({ where: { caseId: famCase.id } })).toBe(0);
    expect(sessions.size).toBe(0);
  });
});

// ── B8 ───────────────────────────────────────────────────────────────────────

describe('B8 — packs', () => {
  let packSessionId: string;

  it('POST /counsel/packs → Checkout for the pack row (price_data without STRIPE_PRICE_*); the webhook issues five credits, once', async () => {
    expect((await post('/counsel/packs', attorney.cookie, { rung: 'LONG' })).statusCode).toBe(400);
    const res = await post('/counsel/packs', attorney.cookie, { rung: 'STANDARD' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, cents: 112050, sku: 'PACK_STANDARD', rung: 'STANDARD' });
    packSessionId = String(res.json().url).split('/').pop()!;
    const params = sessions.get(packSessionId)!;
    expect(params.mode).toBe('payment');
    expect((params.line_items as unknown[])[0]).toMatchObject({ quantity: 1, price_data: { currency: 'usd', unit_amount: 112050 } });
    expect(params.metadata).toMatchObject({ kind: 'counsel_pack', userId: attorney.userId, tenantId: attorney.tenantId, organisationId: attorney.organisationId, sku: 'PACK_STANDARD', rung: 'STANDARD', cents: '112050' });
    expect(await prisma.credit.count({ where: { tenantId: attorney.tenantId } })).toBe(0);

    const hook = await webhook(paidSession(packSessionId));
    expect(hook.statusCode).toBe(200);
    const credits = await prisma.credit.findMany({ where: { tenantId: attorney.tenantId }, orderBy: { id: 'asc' } });
    expect(credits).toHaveLength(5);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeId: packSessionId } });
    expect(payment).toMatchObject({ kind: 'PACK', status: 'SUCCEEDED', amountCents: 112050, sku: 'PACK_STANDARD', rung: 'STANDARD', userId: attorney.userId, tenantId: attorney.tenantId, caseId: null, paymentIntentId: `pi_${packSessionId}` });
    for (const c of credits) {
      expect(c).toMatchObject({ packId: packSessionId, rung: 'STANDARD', consumedAt: null, consumedCaseId: null, paymentId: payment.id, organisationId: attorney.organisationId, userId: attorney.userId });
      expect(c.expiresAt.getTime() - c.issuedAt.getTime()).toBeGreaterThan(360 * 86400_000);
    }
    // A replayed session (new event id) fulfils nothing twice.
    expect((await webhook(paidSession(packSessionId))).statusCode).toBe(200);
    expect(await prisma.credit.count({ where: { tenantId: attorney.tenantId } })).toBe(5);
    expect(await prisma.payment.count({ where: { stripeId: packSessionId } })).toBe(1);

    const list = await get('/counsel/credits', attorney.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().live).toBe(5);
    expect(list.json().credits.map((c: { state: string }) => c.state)).toEqual(['LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE']);
  });

  it('five STANDARD records are paid by credit, each once, the pipeline kicked; the sixth answers PACK_EXHAUSTED and offers PAY; the card path waits for the webhook', async () => {
    for (let i = 0; i < 5; i++) {
      const c = await mkCase(attorney, 'STANDARD', 300);
      const q = await quoteOf(attorney, c.id);
      expect(q.json()).toMatchObject({ decision: { kind: 'CREDIT', rung: 'STANDARD', sku: 'COUNSEL_STANDARD' }, methods: ['CREDIT'], credits: { live: 5 - i, unspent: 5 - i } });
      const wrong = await accept(attorney, c.id, { method: 'CARD' });
      expect(wrong.statusCode).toBe(409);
      expect(wrong.json()).toMatchObject({ error: 'METHOD_NOT_AVAILABLE', method: 'CARD', methods: ['CREDIT'] });

      queueMock.enqueueAnalysis.mockClear();
      const res = await accept(attorney, c.id, { method: 'CREDIT' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, method: 'CREDIT', creditId: q.json().decision.creditId, sku: 'COUNSEL_STANDARD', rung: 'STANDARD' });
      const credit = await prisma.credit.findUniqueOrThrow({ where: { id: res.json().creditId } });
      expect(credit.consumedCaseId).toBe(c.id);
      expect(credit.consumedAt).toBeTruthy();
      expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('QUOTED');
      const ev = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: c.id, type: 'quote.accepted' } });
      expect(ev.payload).toEqual({ method: 'CREDIT', sku: 'COUNSEL_STANDARD', rung: 'STANDARD', creditId: credit.id });
      expect(queueMock.enqueueAnalysis).toHaveBeenCalledTimes(1);
      expect(queueMock.enqueueAnalysis).toHaveBeenCalledWith(c.id, attorney.tenantId);

      // A retry is the same answer and spends nothing more.
      const again = await accept(attorney, c.id, { method: 'CREDIT' });
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ ok: true, idempotent: true, creditId: credit.id });
      expect(await prisma.credit.count({ where: { consumedCaseId: c.id } })).toBe(1);
      expect(queueMock.enqueueAnalysis).toHaveBeenCalledTimes(1);
    }
    expect(await prisma.credit.count({ where: { tenantId: attorney.tenantId, consumedAt: null } })).toBe(0);

    const sixth = await mkCase(attorney, 'STANDARD', 300);
    const q = await quoteOf(attorney, sixth.id);
    expect(q.json()).toMatchObject({ decision: { kind: 'PAY', cents: 24900, listCents: 24900, creditRefused: 'PACK_EXHAUSTED' }, methods: ['CARD'], credits: { live: 0, unspent: 0 } });
    expect((await accept(attorney, sixth.id, { method: 'CREDIT' })).statusCode).toBe(409);

    queueMock.enqueueAnalysis.mockClear();
    const card = await accept(attorney, sixth.id, { method: 'CARD' });
    expect(card.statusCode).toBe(200);
    expect(card.json()).toMatchObject({ ok: true, method: 'CARD', cents: 24900, sku: 'COUNSEL_STANDARD', rung: 'STANDARD' });
    const sid = String(card.json().url).split('/').pop()!;
    const params = sessions.get(sid)!;
    expect((params.line_items as unknown[])[0]).toMatchObject({ price_data: { unit_amount: 24900, currency: 'usd' } });
    expect(params.metadata).toMatchObject({ kind: 'counsel_review', userId: attorney.userId, tenantId: attorney.tenantId, caseId: sixth.id, sku: 'COUNSEL_STANDARD', rung: 'STANDARD', cents: '24900' });
    expect(String(params.success_url)).toContain(`/counsel/matters/${sixth.id}`);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: sixth.id } })).status).toBe('QUOTED');
    expect(await prisma.caseEvent.count({ where: { caseId: sixth.id, type: 'quote.accepted' } })).toBe(0);
    expect(queueMock.enqueueAnalysis).not.toHaveBeenCalled();

    expect((await webhook(paidSession(sid))).statusCode).toBe(200);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeId: sid } });
    expect(payment).toMatchObject({ kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 24900, caseId: sixth.id, userId: attorney.userId, tenantId: attorney.tenantId, sku: 'COUNSEL_STANDARD', rung: 'STANDARD', promoCode: null });
    const ev = await prisma.caseEvent.findFirstOrThrow({ where: { caseId: sixth.id, type: 'quote.accepted' } });
    expect(ev.payload).toEqual({ method: 'CARD', sku: 'COUNSEL_STANDARD', rung: 'STANDARD', paymentId: payment.id });
    expect(queueMock.enqueueAnalysis).toHaveBeenCalledWith(sixth.id, attorney.tenantId);
    const settled = await accept(attorney, sixth.id, { method: 'CREDIT' });
    expect(settled.statusCode).toBe(409);
    expect(settled.json()).toMatchObject({ error: 'ALREADY_SETTLED', settled: { method: 'CARD', paymentId: payment.id } });
  });

  it('an expired credit is skipped, never spent', async () => {
    const expiredId = `${run}_expired`;
    await prisma.credit.create({
      data: {
        id: expiredId, tenantId: attorney.tenantId, organisationId: attorney.organisationId, userId: attorney.userId, packId: `${run}_oldpack`, rung: 'STANDARD',
        issuedAt: new Date(Date.now() - 400 * 86400_000), expiresAt: new Date(Date.now() - 35 * 86400_000),
      },
    });
    const c = await mkCase(attorney, 'STANDARD', 300);
    const q = await quoteOf(attorney, c.id);
    expect(q.json()).toMatchObject({ decision: { kind: 'PAY', cents: 24900, creditRefused: 'EXPIRED' }, methods: ['CARD'], credits: { live: 0, unspent: 1 } });
    expect((await accept(attorney, c.id, { method: 'CREDIT' })).statusCode).toBe(409);
    expect((await prisma.credit.findUniqueOrThrow({ where: { id: expiredId } })).consumedAt).toBeNull();
    const list = await get('/counsel/credits', attorney.cookie);
    expect(list.json().live).toBe(0);
    expect(list.json().credits.find((x: { id: string }) => x.id === expiredId)).toMatchObject({ state: 'EXPIRED', consumedCaseId: null });
    expect(list.json().credits.filter((x: { state: string }) => x.state === 'CONSUMED')).toHaveLength(5);
  });
});

// ── B9 ───────────────────────────────────────────────────────────────────────

describe('B9 — organisation allowance', () => {
  const caseIds: string[] = [];

  it('GET /counsel/allowance shows the pilot grant', async () => {
    const res = await get('/counsel/allowance', pd.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ organisationId: pd.organisationId, kind: 'PD_OFFICE', allowance: { kind: 'PILOT', granted: 15, used: 0, remaining: 15, pilot: true } });
    expect(res.json().allowance.resetsAt).toBeTruthy();
  });

  it('15 ALLOWANCE acceptances write 15 entries; the 16th is refused; a retry of the same case never writes a second entry', async () => {
    for (let i = 0; i < 15; i++) {
      const c = await mkCase(pd, i % 2 ? 'EXTENDED' : 'STANDARD', i % 2 ? 900 : 300);
      caseIds.push(c.id);
      const q = await quoteOf(pd, c.id);
      expect(q.json()).toMatchObject({ audience: 'OFFICE', decision: { kind: 'ALLOWANCE', remaining: 14 - i }, methods: ['ALLOWANCE'], allowance: { used: i, remaining: 15 - i } });
      expect((await accept(pd, c.id, { method: 'CARD' })).statusCode).toBe(409);
      queueMock.enqueueAnalysis.mockClear();
      const res = await accept(pd, c.id, { method: 'ALLOWANCE' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, method: 'ALLOWANCE', remaining: 14 - i, rung: i % 2 ? 'EXTENDED' : 'STANDARD' });
      const entry = await prisma.allowanceEntry.findUniqueOrThrow({ where: { caseId: c.id } });
      expect(entry).toMatchObject({ id: res.json().allowanceEntryId, tenantId: pd.tenantId, organisationId: pd.organisationId, kind: 'PILOT', consumedBy: pd.userId });
      expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('QUOTED');
      expect(queueMock.enqueueAnalysis).toHaveBeenCalledWith(c.id, pd.tenantId);
    }
    expect(await prisma.allowanceEntry.count({ where: { organisationId: pd.organisationId } })).toBe(15);
    expect((await get('/counsel/allowance', pd.cookie)).json().allowance).toMatchObject({ used: 15, remaining: 0 });

    // The 16th: no allowance left and an office has no card price — the next step is a plan.
    const sixteenth = await mkCase(pd, 'STANDARD', 300);
    const q = await quoteOf(pd, sixteenth.id);
    expect(q.json()).toMatchObject({ decision: { kind: 'REFUSED', reason: 'NO_PRICE', allowanceRefused: 'EXHAUSTED' }, methods: [] });
    const refused = await accept(pd, sixteenth.id, { method: 'ALLOWANCE' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: 'METHOD_NOT_AVAILABLE' });
    expect(await prisma.allowanceEntry.count({ where: { organisationId: pd.organisationId } })).toBe(15);
    expect(await prisma.allowanceEntry.findUnique({ where: { caseId: sixteenth.id } })).toBeNull();

    // A retry of case #1 (same answer, nothing written, nothing re-enqueued).
    queueMock.enqueueAnalysis.mockClear();
    const retry = await accept(pd, caseIds[0], { method: 'ALLOWANCE' });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ ok: true, idempotent: true, method: 'ALLOWANCE' });
    expect(await prisma.allowanceEntry.count({ where: { organisationId: pd.organisationId } })).toBe(15);
    expect(queueMock.enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('analysis start refuses a counsel case that skipped the quote, and one whose allowance entry is missing; a settled one passes', async () => {
    const skipped = await mkCase(pd, 'STANDARD', 300);
    const model: AnalysisModel = { name: 'never-called', invoke: async () => { throw new Error('the model must not be called'); } };
    await expect(runAnalysis(skipped.id, pd.tenantId, model)).rejects.toThrow(/quote is not settled/);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: skipped.id } })).status).toBe('DOCS_COMPLETE');
    expect(await prisma.analysisRun.count({ where: { caseId: skipped.id } })).toBe(0);

    await expect(withTenant(pd.tenantId, (tx) => assertQuoteSettled(tx, { id: caseIds[0], tenantId: pd.tenantId }))).resolves.toBeUndefined();
    // The entry is the proof: without it the accepted quote is not enough.
    const entry = await prisma.allowanceEntry.findUniqueOrThrow({ where: { caseId: caseIds[1] } });
    await prisma.allowanceEntry.delete({ where: { id: entry.id } });
    await expect(withTenant(pd.tenantId, (tx) => assertQuoteSettled(tx, { id: caseIds[1], tenantId: pd.tenantId }))).rejects.toThrow(/allowance entry missing/);
    await prisma.allowanceEntry.create({ data: { id: entry.id, tenantId: entry.tenantId, organisationId: entry.organisationId, caseId: entry.caseId, kind: entry.kind, consumedBy: entry.consumedBy, consumedAt: entry.consumedAt } });
    // Families are never asked.
    const fam = await mkCase(family, 'STANDARD', 300);
    await expect(withTenant(family.tenantId, (tx) => assertQuoteSettled(tx, { id: fam.id, tenantId: family.tenantId }))).resolves.toBeUndefined();
  });
});

// ── B10 ──────────────────────────────────────────────────────────────────────

describe('B10 — families unchanged', () => {
  it('PRICES_CENTS is still 29900 / 4900 / 9900, the family rows of the book', () => {
    const at = new Date().toISOString();
    expect(PRICES_CENTS).toEqual({
      review: resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'REVIEW', at })!.cents,
      overage: resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'OVERAGE', at })!.cents,
      rerun: resolvePrice(DEFAULT_PRICE_BOOK, { audience: 'FAMILY', sku: 'RERUN', at })!.cents,
    });
    expect(PRICES_CENTS).toEqual({ review: 29900, overage: 4900, rerun: 9900 });
  });

  it('records-complete: a family case goes DOCS_COMPLETE and straight to the pipeline; a counsel case parks at QUOTED instead', async () => {
    const fam = await mkCase(family, 'STANDARD', 300, 'AWAITING_DOCS');
    await prisma.document.create({ data: { filename: 'rr-vol-1.pdf', caseId: fam.id } });
    queueMock.enqueueAnalysis.mockClear();
    const res = await post(`/cases/${fam.id}/records-complete`, family.cookie, {});
    expect(res.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: fam.id } })).status).toBe('DOCS_COMPLETE');
    expect(queueMock.enqueueAnalysis).toHaveBeenCalledWith(fam.id, family.tenantId);
    // docs.complete is the transition event; no stage.entered QUOTED ever follows it for a family.
    expect(await prisma.caseEvent.count({ where: { caseId: fam.id, type: 'docs.complete' } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId: fam.id, type: 'stage.entered' } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { tenantId: family.tenantId, type: { startsWith: 'quote.' } } })).toBe(0);

    const pro = await mkCase(attorney, 'STANDARD', 300, 'AWAITING_DOCS');
    await prisma.document.create({ data: { filename: 'rr-vol-1.pdf', caseId: pro.id } });
    queueMock.enqueueAnalysis.mockClear();
    const res2 = await post(`/cases/${pro.id}/records-complete`, attorney.cookie, {});
    expect(res2.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: pro.id } })).status).toBe('QUOTED');
    expect(queueMock.enqueueAnalysis).not.toHaveBeenCalled();
    expect(await prisma.caseEvent.count({ where: { caseId: pro.id, type: 'docs.complete' } })).toBe(1);
    const proStages = await prisma.caseEvent.findMany({ where: { caseId: pro.id, type: 'stage.entered' }, orderBy: { id: 'asc' } });
    expect(proStages.map((e) => (e.payload as { status: string }).status)).toEqual(['QUOTED']);
    // The quote reads the same at QUOTED as at DOCS_COMPLETE.
    expect((await quoteOf(attorney, pro.id)).json()).toMatchObject({ status: 'QUOTED', decision: { kind: 'PAY', cents: 24900 } });
  });
});

// ── B11 ──────────────────────────────────────────────────────────────────────

describe('B11 — promotions', () => {
  const FAM = `${codeStem}-FAM`;
  const BAR = `${codeStem}-BAR`;
  const MONTH = `${codeStem}-MONTH`;

  it('a verified attorney\'s first SHORT review is FREE; ten redemptions this month close the offer (default cap 10); the ops row lifts it; after one, never again', async () => {
    const c = await mkCase(verified, 'SHORT', 80);
    expect((await quoteOf(verified, c.id)).json()).toMatchObject({ decision: { kind: 'FREE', reason: 'FIRST_REVIEW_FREE', listCents: 14900, sku: 'COUNSEL_SHORT' }, methods: ['FREE'] });
    // Too many pages is a paid review even for a verified first-timer.
    const big = await mkCase(verified, 'EXTENDED', 900);
    expect((await quoteOf(verified, big.id)).json()).toMatchObject({ decision: { kind: 'PAY', cents: 34900, freeFirstRefused: 'TOO_MANY_PAGES' } });

    // Ten free reviews across the bar this calendar month.
    await prisma.payment.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        stripeId: `free_cap_${run}_${i}`, userId: attorney.userId, tenantId: attorney.tenantId,
        kind: 'REVIEW' as const, status: 'SUCCEEDED' as const, amountCents: 0, promoCode: 'FIRST_REVIEW_FREE', sku: 'COUNSEL_SHORT', rung: 'SHORT',
      })),
    });
    expect((await quoteOf(verified, c.id)).json()).toMatchObject({ decision: { kind: 'PAY', cents: 14900, freeFirstRefused: 'MONTH_CAP_REACHED' }, methods: ['CARD'] });
    const refused = await accept(verified, c.id, { method: 'FREE' });
    expect(refused.statusCode).toBe(409);
    expect(await prisma.payment.count({ where: { caseId: c.id } })).toBe(0);

    // While the free review is closed, a bar-partner code takes 15% off the first paid review; a family code is refused.
    await prisma.promoCode.create({ data: { code: FAM, amountOffCents: 5000, audience: 'FAMILY', createdBy: 'test' } });
    await prisma.promoCode.create({ data: { code: BAR, amountOffCents: 5000, audience: 'ATTORNEY', createdBy: 'test' } });
    const famCode = await quoteOf(verified, c.id, `?promoCode=${FAM.toLowerCase()}`);
    expect(famCode.json()).toMatchObject({ decision: { kind: 'PAY', cents: 14900, listCents: 14900 }, promoRefused: 'audience' });
    expect(famCode.json().decision.promoCode).toBeUndefined();
    const barCode = await quoteOf(verified, c.id, `?promoCode=${BAR}`);
    expect(barCode.json()).toMatchObject({ decision: { kind: 'PAY', cents: 12665, listCents: 14900, discountCents: 2235, promoCode: BAR } });
    expect(barCode.json().promoRefused).toBeUndefined();

    // The ops row for FIRST_REVIEW_FREE sets the cap (the one underscore code the promo console accepts).
    const row = await post('/ops/promos', adminCookie, { code: 'FIRST_REVIEW_FREE', amountOffCents: 14900, maxRedemptionsPerMonth: 11, audience: 'ATTORNEY' });
    expect(row.statusCode).toBe(200);
    expect(row.json()).toMatchObject({ code: 'FIRST_REVIEW_FREE', maxRedemptionsPerMonth: 11, audience: 'ATTORNEY' });
    expect((await quoteOf(verified, c.id)).json()).toMatchObject({ decision: { kind: 'FREE' }, methods: ['FREE'] });

    queueMock.enqueueAnalysis.mockClear();
    const res = await accept(verified, c.id, { method: 'FREE' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, method: 'FREE', sku: 'COUNSEL_SHORT', rung: 'SHORT' });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: res.json().paymentId } });
    expect(payment).toMatchObject({ caseId: c.id, userId: verified.userId, tenantId: verified.tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 0, promoCode: 'FIRST_REVIEW_FREE', sku: 'COUNSEL_SHORT', rung: 'SHORT' });
    expect(payment.stripeId.startsWith('free_FIRST_REVIEW_FREE_')).toBe(true);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('QUOTED');
    expect((await prisma.caseEvent.findFirstOrThrow({ where: { caseId: c.id, type: 'quote.accepted' } })).payload).toEqual({ method: 'FREE', sku: 'COUNSEL_SHORT', rung: 'SHORT', paymentId: payment.id });
    expect(queueMock.enqueueAnalysis).toHaveBeenCalledWith(c.id, verified.tenantId);
    expect((await accept(verified, c.id, { method: 'FREE' })).json()).toMatchObject({ ok: true, idempotent: true, paymentId: payment.id });
    expect(await prisma.payment.count({ where: { caseId: c.id } })).toBe(1);

    // The eleventh redemption closes the month again, and this attorney has had theirs anyway.
    const next = await mkCase(verified, 'SHORT', 80);
    expect((await quoteOf(verified, next.id)).json()).toMatchObject({ decision: { kind: 'PAY', cents: 14900, freeFirstRefused: 'NOT_FIRST_REVIEW' } });
    // Switching the row off withdraws the offer entirely.
    const off = await fastify.inject({ method: 'PATCH', url: `/ops/promos/${row.json().id}`, headers: { cookie: adminCookie }, payload: { active: false } });
    expect(off.statusCode).toBe(200);
    expect((await quoteOf(verified, next.id)).json()).toMatchObject({ decision: { kind: 'PAY', cents: 14900, freeFirstRefused: 'NOT_OFFERED' } });
  });

  it('audience and the monthly cap hold on the family side too (POST /checkout/promo/validate, checkPromoCode)', async () => {
    await prisma.promoCode.create({ data: { code: MONTH, amountOffCents: 5000, maxRedemptionsPerMonth: 1, createdBy: 'test' } });
    expect(await checkPromoCode(FAM)).toMatchObject({ valid: true, amountOffCents: 5000 });
    expect(await checkPromoCode(BAR)).toMatchObject({ valid: false, reason: 'audience' });
    expect(await checkPromoCode(BAR, 'ATTORNEY')).toMatchObject({ valid: true });
    expect(await checkPromoCode(MONTH)).toMatchObject({ valid: true });
    await prisma.payment.create({ data: { stripeId: `promo_${run}_month`, userId: family.userId, tenantId: family.tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 24900, promoCode: MONTH } });
    expect(await checkPromoCode(MONTH)).toMatchObject({ valid: false, reason: 'month_limit' });
    expect(await checkPromoCode(MONTH, 'ATTORNEY')).toMatchObject({ valid: false, reason: 'month_limit' });

    const famOk = await post('/checkout/promo/validate', undefined, { code: FAM });
    expect(famOk.statusCode).toBe(200);
    expect(famOk.json()).toMatchObject({ code: FAM, amountOffCents: 5000, newTotalCents: 24900 });
    expect((await post('/checkout/promo/validate', undefined, { code: BAR })).statusCode).toBe(400);
    expect((await post('/checkout/promo/validate', undefined, { code: MONTH })).statusCode).toBe(400);
  });
});
