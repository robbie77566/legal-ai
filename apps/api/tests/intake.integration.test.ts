/**
 * S2/S3 intake integration tests (US-2/US-3) — live Postgres, route level.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `intake_${Date.now()}`;
let tenantId: string;
let userId: string;
let caseId: string;
let swCaseId: string;
let cookie: string;

const seedCase = async (subsequentWrit: boolean) => {
  const c = await prisma.case.create({
    data: {
      title: `${run}${subsequentWrit ? '_sw' : ''}`,
      tenantId,
      status: 'AWAITING_DOCS',
      lane: 'TRIAL',
      vehicle: '11.07',
      subsequentWrit,
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  return c.id;
};

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' },
  });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  caseId = await seedCase(false);
  swCaseId = await seedCase(true);
});

afterAll(async () => {
  await prisma.checklistItem.deleteMany({ where: { caseId: { in: [caseId, swCaseId] } } });
  await prisma.document.deleteMany({ where: { caseId: { in: [caseId, swCaseId] } } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('interview → checklist', () => {
  it('generates the trial checklist, stores county/year, appends the event', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: { cookie },
      payload: { county: 'Harris', convictionYear: 2019, trialDays: 4, hadAppeal: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().checklistItemCount).toBe(5);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.county).toBe('Harris');
    expect(kase.convictionYear).toBe(2019);

    const events = await prisma.caseEvent.findMany({ where: { caseId, type: 'interview.completed' } });
    expect(events).toHaveLength(1);
  });

  it('drops the appellate-opinion item when there was no appeal', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: { cookie },
      payload: { county: 'Harris', convictionYear: 2019, hadAppeal: false },
    });
    expect(res.statusCode).toBe(200);
    const items = await prisma.checklistItem.findMany({ where: { caseId } });
    expect(items.map((i) => i.kind)).not.toContain('appellate_opinion');
    expect(items).toHaveLength(4);
  });

  it('subsequent-writ mode adds the prior-writ items (§4 analysis needs them)', async () => {
    await fastify.inject({
      method: 'POST',
      url: `/cases/${swCaseId}/interview`,
      headers: { cookie },
      payload: { county: 'Brazoria', convictionYear: 2015, hadAppeal: true },
    });
    const kinds = (await prisma.checklistItem.findMany({ where: { caseId: swCaseId } })).map((i) => i.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['prior_writ_application', 'prior_writ_answer', 'prior_writ_findings'])
    );
    expect(kinds).toHaveLength(8);
  });

  it("another user's case is forbidden", async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/interview`,
      headers: {
        cookie: `next-auth.session-token=${await encodeSessionToken({ userId: 'stranger', tenantId, role: 'CLIENT' })}`,
      },
      payload: { county: 'Harris', convictionYear: 2019, hadAppeal: true },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('checklist home + records complete', () => {
  it('returns items with the customer-visible stage', async () => {
    const res = await fastify.inject({
      method: 'GET',
      url: `/cases/${caseId}/checklist`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('AWAITING_DOCS');
    expect(body.customer.stage).toBe('awaiting_documents');
    expect(body.items.length).toBeGreaterThan(0);
    // Document priority (PO, 2026-09-12): the transcript is the trial essential;
    // nothing uploaded yet → not enough, and the page can say why.
    expect(body.items[0].kind).toBe('rr_volume');
    expect(body.readiness).toMatchObject({ enough: false, essentialTotal: 1, essentialHave: 0 });
    expect(body.readiness.missing.essential).toMatchObject([{ kind: 'rr_volume', label: "Reporter's record (trial transcript) volumes" }]);
  });

  it('refuses records-complete with zero documents', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('upload completion appends doc.uploaded; records-complete then starts the clock', async () => {
    const up = await fastify.inject({
      method: 'POST',
      url: '/upload/complete',
      headers: { cookie },
      payload: { caseId, filename: 'rr-vol-1.pdf', s3Key: `cases/${caseId}/x-rr.pdf` },
    });
    expect(up.statusCode).toBe(200);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.uploaded' } })).toBe(1);

    const rc = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(rc.statusCode).toBe(200);
    expect(rc.json().status).toBe('DOCS_COMPLETE');
    expect(rc.json().slaStartedAt).toBeTruthy();
  });

  it('records-complete is once-only (409 on repeat)', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: `/cases/${caseId}/records-complete`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('removing uploaded files (2026-09-27)', () => {
  let rmCaseId: string;
  let rrItem: string;
  beforeAll(async () => {
    rmCaseId = await seedCase(false);
    const it = await prisma.checklistItem.create({ data: { caseId: rmCaseId, kind: 'rr_volume', label: 'RR', state: 'NEEDED' } });
    rrItem = it.id;
  });
  afterAll(async () => {
    await prisma.findingCitation.deleteMany({ where: { finding: { caseId: rmCaseId } } });
    await prisma.finding.deleteMany({ where: { caseId: rmCaseId } });
    await prisma.analysisRun.deleteMany({ where: { caseId: rmCaseId } });
    await prisma.documentChunk.deleteMany({ where: { document: { caseId: rmCaseId } } });
    await prisma.documentPage.deleteMany({ where: { document: { caseId: rmCaseId } } });
    await prisma.document.deleteMany({ where: { caseId: rmCaseId } });
    await prisma.checklistItem.deleteMany({ where: { caseId: rmCaseId } });
  });

  const seedDoc = async (filename: string, item: string | null, pages = 2) => {
    const d = await prisma.document.create({ data: { filename, caseId: rmCaseId, s3Key: null, suggestedChecklistItemId: item, classificationConfirmed: !!item } });
    for (let i = 1; i <= pages; i++) {
      await prisma.documentPage.create({ data: { documentId: d.id, pageNo: i, contentHash: `${run}_${filename}_${i}`, billable: true } });
      await prisma.documentChunk.create({ data: { documentId: d.id, content: `${filename} page ${i}`, metadata: { page: i } } });
    }
    if (item) await prisma.checklistItem.update({ where: { id: item }, data: { state: 'UPLOADED' } });
    return d.id;
  };

  it('DELETE removes the file, its pages and chunks, returns the checklist item to NEEDED, and records the event', async () => {
    const docId = await seedDoc('rr-vol-2.pdf', rrItem);
    const res = await fastify.inject({ method: 'DELETE', url: `/cases/${rmCaseId}/documents/${docId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toEqual([{ id: docId, filename: 'rr-vol-2.pdf', pages: 2 }]);
    expect(await prisma.document.findUnique({ where: { id: docId } })).toBeNull();
    expect(await prisma.documentPage.count({ where: { documentId: docId } })).toBe(0);
    expect(await prisma.documentChunk.count({ where: { documentId: docId } })).toBe(0);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: rrItem } })).state).toBe('NEEDED');
    const ev = await prisma.caseEvent.findFirst({ where: { caseId: rmCaseId, type: 'doc.removed' }, orderBy: { id: 'desc' } });
    expect(ev?.payload).toEqual({ documentId: docId, pages: 2 });
    expect(await prisma.auditLog.count({ where: { caseId: rmCaseId, action: 'DOCUMENT_REMOVE' } })).toBe(1);
  });

  it('the checklist tick survives when another file still covers the item; bulk removal reports each file', async () => {
    const a = await seedDoc('rr-vol-3.pdf', rrItem);
    const b = await seedDoc('rr-vol-4.pdf', rrItem);
    const one = await fastify.inject({ method: 'DELETE', url: `/cases/${rmCaseId}/documents/${a}`, headers: { cookie } });
    expect(one.statusCode).toBe(200);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: rrItem } })).state).toBe('UPLOADED');
    const bulk = await fastify.inject({ method: 'POST', url: `/cases/${rmCaseId}/documents/remove`, headers: { cookie }, payload: { documentIds: [b, 'nope'] } });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json().removed.map((r: { id: string }) => r.id)).toEqual([b]);
    expect(bulk.json().refused).toEqual([{ id: 'nope', reason: 'not_found' }]);
    expect(bulk.json().refusedWhy.nope).toMatch(/not in this review/);
    expect((await prisma.checklistItem.findUniqueOrThrow({ where: { id: rrItem } })).state).toBe('NEEDED');
  });

  it('a file a finding cites is refused, with the reason; so is any removal once the review has started', async () => {
    const cited = await seedDoc('rr-vol-5.pdf', rrItem, 1);
    const chunk = await prisma.documentChunk.findFirstOrThrow({ where: { documentId: cited } });
    const r = await prisma.analysisRun.create({ data: { caseId: rmCaseId, tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
    await prisma.finding.create({
      data: {
        runId: r.id, caseId: rmCaseId, tenantId, stableKey: `${run}_cited`, category: 'iac', severity: 'supportive', confidence: 0.5, partAText: 'a', partBText: 'b',
        citations: { create: { documentId: cited, chunkId: chunk.id, excerpt: 'x', excerptHash: 'h' } },
      },
    });
    const res = await fastify.inject({ method: 'DELETE', url: `/cases/${rmCaseId}/documents/${cited}`, headers: { cookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/cited in your report/);
    expect(await prisma.document.findUnique({ where: { id: cited } })).not.toBeNull();

    await prisma.case.update({ where: { id: rmCaseId }, data: { status: 'ANALYZING' } });
    const free = await seedDoc('late.pdf', null, 1);
    const locked = await fastify.inject({ method: 'DELETE', url: `/cases/${rmCaseId}/documents/${free}`, headers: { cookie } });
    expect(locked.statusCode).toBe(409);
    expect(locked.json().error).toMatch(/already started/);
    await prisma.case.update({ where: { id: rmCaseId }, data: { status: 'AWAITING_DOCS' } });
  });

  it('another account cannot remove a file from this case', async () => {
    const other = await prisma.user.create({ data: { email: `${run}_other@example.com`, tenantId, role: 'CLIENT' } });
    const otherCookie = `next-auth.session-token=${await encodeSessionToken({ userId: other.id, tenantId, role: 'CLIENT' })}`;
    const d = await seedDoc('mine.pdf', null, 1);
    const res = await fastify.inject({ method: 'DELETE', url: `/cases/${rmCaseId}/documents/${d}`, headers: { cookie: otherCookie } });
    expect(res.statusCode).toBe(403);
    expect(await prisma.document.findUnique({ where: { id: d } })).not.toBeNull();
    await prisma.user.delete({ where: { id: other.id } });
  });
});
