/**
 * Customer-journey P2s (customer_journey_ux_review): pending-appeal leads
 * (one confirmation, one reminder, ever), and the returning purchaser's
 * disclosure-ack status.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { DISCLOSURE_SET_VERSION } from '@hg/case-lifecycle';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';
import { sendPendingAppealReminders } from '../src/routes/eligibility';

const run = `p2_${Date.now()}`;
const sent: EmailMessage[] = [];
let tenantId: string;
let userId: string;
let cookie: string;

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
});
beforeEach(() => { sent.length = 0; });
afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await prisma.eligibilityLead.deleteMany({ where: { email: { contains: run } } });
  await prisma.disclosureAck.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('pending-appeal lead (G-E1)', () => {
  it('is anonymous, stores the email, confirms once, and reminds exactly once when due', async () => {
    const res = await fastify.inject({ method: 'POST', url: '/eligibility/lead', payload: { email: `${run}_lead@X.com`, outcome: 'pending_appeal' } });
    expect(res.statusCode).toBe(200);
    const lead = await prisma.eligibilityLead.findFirstOrThrow({ where: { email: `${run}_lead@x.com` } });
    expect(lead.remindAt.getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
    await new Promise((r) => setTimeout(r, 30));
    expect(sent.find((m) => /check back/.test(m.subject))?.text).toContain('/check');

    // Not due yet → nothing.
    expect(await sendPendingAppealReminders()).toBe(0);
    // Due → one reminder, stamped; a second sweep sends nothing.
    await prisma.eligibilityLead.update({ where: { id: lead.id }, data: { remindAt: new Date(Date.now() - 1000) } });
    sent.length = 0;
    expect(await sendPendingAppealReminders()).toBeGreaterThanOrEqual(1);
    expect(sent.filter((m) => m.to === `${run}_lead@x.com` && /appeal been decided/.test(m.subject))).toHaveLength(1);
    expect(await sendPendingAppealReminders()).toBe(0);
    expect((await prisma.eligibilityLead.findUniqueOrThrow({ where: { id: lead.id } })).remindedAt).not.toBeNull();

    expect((await fastify.inject({ method: 'POST', url: '/eligibility/lead', payload: { email: 'nope', outcome: 'pending_appeal' } })).statusCode).toBe(400);
    expect((await fastify.inject({ method: 'POST', url: '/eligibility/lead', payload: { email: `${run}_x@x.com`, outcome: 'fit_trial' } })).statusCode).toBe(400);
  });
});

describe('returning purchaser disclosure status (G-B5)', () => {
  it('reports no prior ack, then the timestamp of the ack at the current version', async () => {
    const before = await fastify.inject({ method: 'GET', url: '/buy/disclosure-ack', headers: { cookie } });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ version: DISCLOSURE_SET_VERSION, ackedAt: null });

    const ack = await fastify.inject({ method: 'POST', url: '/buy/disclosure-ack', headers: { cookie }, payload: { disclosureSetVersion: DISCLOSURE_SET_VERSION } });
    expect(ack.statusCode).toBe(200);
    const after = await fastify.inject({ method: 'GET', url: '/buy/disclosure-ack', headers: { cookie } });
    expect(after.json().ackedAt).toBeTruthy();
  });
});
