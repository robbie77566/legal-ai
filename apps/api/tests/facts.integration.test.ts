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
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const sent: EmailMessage[] = [];

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

let adminCookie: string;
beforeAll(async () => {
  __setEmailProviderForTests({ send: async (msg) => { sent.push(msg); return { delivered: true }; } });
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId, role: 'ADMIN' })}`;
  userId = (await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } })).id;
  otherId = (await prisma.user.create({ data: { email: `${run}_other@x.com`, tenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  otherCookie = `next-auth.session-token=${await encodeSessionToken({ userId: otherId, tenantId, role: 'CLIENT' })}`;
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId } } });
  await prisma.finding.deleteMany({ where: { tenantId } });
  await prisma.analysisRun.deleteMany({ where: { tenantId } });
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
    expect(mine.json()).toMatchObject({ caseId, kind: 'review' }); // + interviewNeeded (repeat-buyer flow, 2026-09-12)
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_1`, otherCookie)).statusCode).toBe(404);
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_nope`)).statusCode).toBe(404);
    expect((await get(`/checkout/fulfillment?session_id=cs_${run}_nope`)).json()).toEqual({ pending: true });
  });

  it('the writ and the other shaping answers can change while documents are still being collected — the checklist rebuilds (PO, 2026-09-12)', async () => {
    const before = (await prisma.checklistItem.findMany({ where: { caseId } })).map((i) => i.kind);
    expect(before).not.toContain('prior_writ_application');
    const res = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { priorWrit: 'yes' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().facts.priorWrit).toBe('yes');
    expect(res.json().factLines.find((l: { key: string }) => l.key === 'priorWrit').value).toMatch(/Yes/);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.subsequentWrit).toBe(true);
    const after = (await prisma.checklistItem.findMany({ where: { caseId } })).map((i) => i.kind);
    expect(after).toContain('prior_writ_application');
    expect(after).toContain('rr_volume');
    // And back: the writ items go away again, received items would have stayed.
    const back = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { priorWrit: 'no' } });
    expect(back.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subsequentWrit).toBe(false);
    expect((await prisma.checklistItem.findMany({ where: { caseId } })).map((i) => i.kind)).not.toContain('prior_writ_application');
    // A plea changes the lane and the template.
    const plea = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { trialOrPlea: 'plea' } });
    expect(plea.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).lane).toBe('PLEA');
    expect((await prisma.checklistItem.findMany({ where: { caseId } })).map((i) => i.kind)).toContain('plea_papers');
    await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { trialOrPlea: 'trial' } });
  });

  it('a judgment date typed the way people write it is normalized; an unreadable one gets a human message (Sentry, 2026-09-12)', async () => {
    const bad = await post(`/cases/${caseId}/interview`, { county: 'Travis', convictionYear: 2019, judgmentDate: 'last spring' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ field: 'judgmentDate' });
    expect(bad.json().error).toMatch(/YYYY-MM-DD \(for example 2019-09-12\)/);
    expect(bad.json().error).not.toBe('YYYY-MM-DD');

    const us = await post(`/cases/${caseId}/interview`, { county: 'Travis', convictionYear: 2019, judgmentDate: '06/14/2019' });
    expect(us.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).deadlineFacts).toMatchObject({ judgmentDate: '2019-06-14' });

    // Blank means "not given", not an error — and does not disturb the stored date.
    const blank = await post(`/cases/${caseId}/interview`, { county: 'Travis', convictionYear: 2019, judgmentDate: '' });
    expect(blank.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).facts).toMatchObject({ judgmentDate: '2019-06-14' });
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

    // Decision 3: a re-run with nothing new is refused, never charged a run.
    const nothingNew = await post(`/cases/${caseId}/records-complete`, {});
    expect(nothingNew.statusCode).toBe(409);
    expect(nothingNew.json().code).toBe('nothing_new');
    await prisma.document.create({ data: { filename: 'rr2.pdf', caseId } });

    // The interview is not required again; records-complete is open again.
    const done = await post(`/cases/${caseId}/records-complete`, {});
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('DOCS_COMPLETE');
    expect(await prisma.report.count({ where: { caseId } })).toBe(1); // v1 still there

    // The emails that used to have no link now do (G-D1); the re-run email exists (G-D2).
    const rerunMail = sent.find((m) => /re-run is paid for/.test(m.subject));
    expect(rerunMail?.text).toContain(`/case/${caseId}/documents`);
    const recordsMail = sent.find((m) => /your review has started/.test(m.subject));
    expect(recordsMail?.text).toContain(`/case/${caseId}/status`);
  });

  it('v1 stays readable during the re-run, and after v2 the family sees what changed', async () => {
    // v1 is served even though the case is back in DOCS_COMPLETE.
    const v1 = await get(`/cases/${caseId}/report`);
    expect(v1.statusCode).toBe(200);
    expect(v1.json().versionNo).toBe(1);

    // Simulate run 2 + report v2 with one finding kept, one added, one removed.
    const run1 = await prisma.analysisRun.findFirstOrThrow({ where: { caseId, runNo: 1 } });
    const mk = (runId: string, key: string, text: string) =>
      prisma.finding.create({ data: { runId, caseId, tenantId, stableKey: `${run}_${key}`, category: 'brady', severity: 'supportive', confidence: 0.7, partAText: text, partBText: 'B' } });
    await mk(run1.id, 'kept', 'Kept finding');
    await mk(run1.id, 'gone', 'Old finding that no longer holds');
    const run2 = await prisma.analysisRun.create({ data: { caseId, tenantId, runNo: 2, modelConfig: {}, completedAt: new Date() } });
    await mk(run2.id, 'kept', 'Kept finding');
    await mk(run2.id, 'new', 'A lab report the defense never received');
    await prisma.report.create({ data: { caseId, tenantId, runId: run2.id, versionNo: 2, templateVersion: 'AB-v1', approvedBy: 'auto_qa', findingsSnapshot: { findings: [] } } });

    const versions = (await get(`/cases/${caseId}/report/versions`)).json();
    expect(versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    expect((await get(`/cases/${caseId}/report`)).json().versionNo).toBe(2);
    expect((await get(`/cases/${caseId}/report?version=1`)).json().versionNo).toBe(1);

    const changes = (await get(`/cases/${caseId}/report/changes`)).json();
    expect(changes).toMatchObject({ fromVersion: 1, toVersion: 2, keptCount: 1 });
    expect(changes.added.map((f: { partAText: string }) => f.partAText)).toEqual(['A lab report the defense never received']);
    expect(changes.removed.map((f: { partAText: string }) => f.partAText)).toEqual(['Old finding that no longer holds']);
  });
});

describe('lock semantics (decision 1)', () => {
  it('after records-complete, county/year/dates can still be corrected; the shaping facts cannot', async () => {
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status).not.toBe('AWAITING_DOCS');
    // The interview route (which reseeds the checklist) is closed…
    expect((await post(`/cases/${caseId}/interview`, { county: 'Bexar', convictionYear: 2018 })).statusCode).toBe(409);
    // …the facts route accepts the contact-style facts…
    const eventsBefore = await prisma.caseEvent.count({ where: { caseId, type: 'facts.updated' } });
    const res = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { county: 'Bexar', judgmentDate: '2019-07-01' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().facts).toMatchObject({ county: 'Bexar', judgmentDate: '2019-07-01', appeal: 'decided', custody: 'probation' });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.county).toBe('Bexar');
    expect(kase.deadlineFacts).toMatchObject({ judgmentDate: '2019-07-01' });
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'facts.updated' } })).toBe(eventsBefore + 1);
    // …and refuses anything that shapes the review.
    const shaping = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { trialOrPlea: 'plea' } });
    expect(shaping.statusCode).toBe(409);
    expect(shaping.json().error).toMatch(/a re-run is where they can change/);
    // Clearing the judgment date removes it from both places.
    const cleared = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { judgmentDate: null } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().facts.judgmentDate).toBeUndefined();
    // The same normalization applies here: a US-shaped date is stored as ISO.
    const us = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { judgmentDate: '7/1/2019' } });
    expect(us.statusCode).toBe(200);
    expect(us.json().facts.judgmentDate).toBe('2019-07-01');
    const unreadable = await fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/facts`, headers: { cookie }, payload: { judgmentDate: 'sometime in 2019' } });
    expect(unreadable.statusCode).toBe(400);
    expect(unreadable.json().error).toMatch(/for example 2019-09-12/);
  });
});

describe('the emails the tracker promises', () => {
  it('marking a delay ours emails the family the new date and the progress link', async () => {
    sent.length = 0;
    const res = await fastify.inject({ method: 'POST', url: `/ops/cases/${caseId}/delay-ours`, headers: { cookie: adminCookie }, payload: { extendedToDate: '2026-10-01' } });
    expect(res.statusCode).toBe(200);
    // fire-and-forget: give the promise a tick
    await new Promise((r) => setTimeout(r, 50));
    const mail = sent.find((m) => /delayed on our side/.test(m.subject));
    expect(mail?.to).toBe(`${run}@x.com`);
    expect(mail?.text).toContain('2026-10-01');
    expect(mail?.text).toContain(`/case/${caseId}/status`);
  });
});
