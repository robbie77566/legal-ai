/**
 * Case facts + re-run (customer_journey_ux_review P0s) — live Postgres.
 * The free check's answers survive purchase, the interview never re-asks
 * what is known, a paid re-run reopens a finished case, and the success page
 * can find its own case.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { handleStripeEvent } from '../src/services/payments.service';

const run = `facts_${Date.now()}`;
let tenantId: string;
let userId: string;
let otherId: string;
let cookie: string;
let otherCookie: string;
let caseId: string;

const get = (url: string, c = cookie) => fastify.inject({ method: 'GET', url, headers: { cookie: c } });
const post = (url: string, payload: Record<string, unknown>, c = cookie) =>
  fastify.inject({ method: 'POST', url, headers: { cookie: c }, payload });

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  userId = (await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } })).id;
  otherId = (await prisma.user.create({ data: { email: `${run}_other@x.com`, tenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  otherCookie = `next-auth.session-token=${await encodeSessionToken({ userId: otherId, tenantId, role: 'CLIENT' })}`;
});

afterAll(async () => {
  await prisma.report.deleteMany({ where: { tenantId } });
  await prisma.checklistItem.deleteMany({ where: { case: { tenantId } } });
  await prisma.document.deleteMany({ where: { case: { tenantId } } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.paymentEvent.deleteMany({ where: { stripeEventId: { contains: run } } });
  await prisma.caseAccess.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('the free check survives purchase', () => {
  it('copies every answer onto the case and routes probation to Art. 11.072', async () => {
    await prisma.eligibilityDraft.create({
      data: {
        token: `${run}_draft`,
        outcome: 'fit_trial',
        answers: {
          jurisdiction: 'texas', offenseLevel: 'felony', capital: 'no', custody: 'probation',
          trialOrPlea: 'trial', appeal: 'decided', priorWrit: 'no', newEvidence: 'yes',
        },
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await handleStripeEvent({
      id: `evt_${run}_1`, type: 'checkout.session.completed',
      data: { object: { id: `cs_${run}_1`, amount_total: 29900, metadata: { userId, tenantId, kind: 'review', draftToken: `${run}_draft` } } },
    });
    const kase = await prisma.case.findFirstOrThrow({ where: { tenantId } });
    caseId = kase.id;
    expect(kase.vehicle).toBe('11.072');
    expect(kase.lane).toBe('TRIAL');
    expect(kase.facts).toMatchObject({ custody: 'probation', appeal: 'decided', priorWrit: 'no', newEvidence: true, offenseLevel: 'felony' });
    expect(await prisma.eligibilityDraft.findUnique({ where: { token: `${run}_draft` } })).toBeNull();
  });

  it('the success page can find ITS case from the session id — owner only', async () => {
    const mine = await get(`/checkout/fulfillment?session_id=cs_${run}_1`);
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual({ caseId, kind: 'review' });
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_1`, otherCookie)).statusCode).toBe(404);
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_nope`)).statusCode).toBe(404);
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_nope`)).json()).toEqual({ pending: true });
  });

  it('the interview merges into the facts, keeps the check\'s appeal answer, and stores the judgment date', async () => {
    const res = await post(`/cases/${caseId}/interview`, { county: 'Travis', convictionYear: 2019, trialDays: 4, judgmentDate: '2019-06-14' });
    expect(res.statusCode).toBe(200);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.facts).toMatchObject({ county: 'Travis', convictionYear: 2019, trialDays: 4, judgmentDate: '2019-06-14', appeal: 'decided', custody: 'probation' });
    expect(kase.deadlineFacts).toMatchObject({ judgmentDate: '2019-06-14' });
    // appeal 'decided' keeps the appellate-opinion item on the checklist
    const items = await prisma.checklistItem.findMany({ where: { caseId } });
    expect(items.some((i) => i.kind === 'appellate_opinion')).toBe(true);

    const checklist = (await get(`/cases/${caseId}/checklist`)).json();
    expect(checklist.facts).toMatchObject({ county: 'Travis', appeal: 'decided' });
    const line = (k: string) => checklist.factLines.find((l: { key: string }) => l.key === k);
    expect(line('conviction').value).toBe('Travis County · 2019 · felony · Texas state court');
    expect(line('vehicle')).toMatchObject({ value: 'Article 11.072', derived: true });
    expect(line('appeal').value).toMatch(/Decided/);
    expect(checklist.rerun).toBeNull();
  });
});

describe('a paid re-run reopens a finished case', () => {
  it('READY → AWAITING_DOCS with facts and documents intact, and records-complete works again', async () => {
    await prisma.document.create({ data: { filename: 'rr1.pdf', caseId } });
    // Walk the case to READY the way the pipeline does.
    for (const to of ['DOCS_COMPLETE', 'DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW', 'READY'] as const) {
      await prisma.case.update({ where: { id: caseId }, data: { status: to } });
    }
    const r = await prisma.analysisRun.create({ data: { caseId, tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
    await prisma.report.create({ data: { caseId, tenantId, runId: r.id, versionNo: 1, templateVersion: 'AB-v1', approvedBy: 'auto_qa', findingsSnapshot: { findings: [] } } });

    const res = await handleStripeEvent({
      id: `evt_${run}_rerun`, type: 'checkout.session.completed',
      data: { object: { id: `cs_${run}_rerun`, amount_total: 9900, metadata: { userId, tenantId, kind: 'rerun', caseId } } },
    });
    expect(res.detail).toContain(caseId);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.status).toBe('AWAITING_DOCS');
    expect(kase.facts).toMatchObject({ county: 'Travis' });
    expect(await prisma.document.count({ where: { caseId } })).toBe(1);

    const checklist = (await get(`/cases/${caseId}/checklist`)).json();
    expect(checklist.rerun).toMatchObject({ reportCount: 1 });

    // The interview is not required again; records-complete is open again.
    const done = await post(`/cases/${caseId}/records-complete`, {});
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('DOCS_COMPLETE');
    expect(await prisma.report.count({ where: { caseId } })).toBe(1); // v1 still there
  });
});
