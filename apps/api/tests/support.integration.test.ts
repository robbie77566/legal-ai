/**
 * SUPPORT role + the case file (staff_console_access_model §5) — live
 * Postgres. Support reads every customer-facing artifact and takes the
 * unblocking actions; money, deletion, and cost are walled off at the API.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';
// Deterministic presigning (the SDK signs with whatever creds exist).
process.env.AWS_ACCESS_KEY_ID ??= 'test-key';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret';
process.env.AWS_REGION ??= 'us-east-2';
process.env.S3_BUCKET ??= 'test-bucket';

import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `sup_${Date.now()}`;
let tenantId: string;
let userId: string;
let supportId: string;
let adminId: string;
let caseId: string;
let docId: string;
let quarantinedId: string;
let supportCookie: string;
let clientCookie: string;

const get = async (url: string, cookie = supportCookie) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const post = async (url: string, payload: Record<string, unknown> = {}, cookie = supportCookie) =>
  fastify.inject({ method: 'POST', url, headers: { cookie }, payload });

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  userId = (await prisma.user.create({ data: { email: `${run}@x.com`, name: 'Jo Whitfield', tenantId, role: 'CLIENT' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId, role: 'SUPPORT' } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId, role: 'ADMIN' } })).id;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: supportId, tenantId, role: 'SUPPORT' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

  const c = await prisma.case.create({
    data: { title: `${run} Travis County record`, tenantId, status: 'READY', lane: 'TRIAL', accessList: { create: { userId, role: 'ADMIN' } } },
  });
  caseId = c.id;
  const doc = await prisma.document.create({ data: { filename: 'RR_Vol1.pdf', caseId, s3Key: `cases/${caseId}/rr1.pdf`, suggestedChecklistItemId: 'reporters_record' } });
  docId = doc.id;
  for (const [pageNo, billable] of [[1, true], [2, true], [3, false]] as const) {
    await prisma.documentPage.create({
      data: { documentId: doc.id, pageNo, contentHash: `${run}_${pageNo}`, billable, dedupKind: billable ? null : 'exact', ocrConfidence: 1, ocrProvider: 'pdf-text' },
    });
  }
  quarantinedId = (await prisma.document.create({ data: { filename: 'malware.pdf', caseId, s3Key: `cases/${caseId}/bad.pdf`, quarantined: true } })).id;

  const r = await prisma.analysisRun.create({ data: { caseId, tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
  const chunk = await prisma.documentChunk.create({ data: { documentId: doc.id, content: `${run} withheld pending the DPS supplemental report`, metadata: {} } });
  const finding = await prisma.finding.create({
    data: {
      runId: r.id, caseId, tenantId, stableKey: `${run}_brady`, category: 'brady', severity: 'dispositive', confidence: 0.82,
      partAText: 'A lab report the defense never received.', partBText: 'Brady materiality analysis.',
      citations: { create: { documentId: doc.id, chunkId: chunk.id, volume: 'RR2', page: 116, excerpt: 'withheld pending the DPS supplemental report', excerptHash: createHash('sha256').update(chunk.content).digest('hex') } },
    },
  });
  await prisma.report.create({
    data: {
      caseId, tenantId, runId: r.id, versionNo: 1, templateVersion: 'AB-v1', approvedBy: adminId,
      findingsSnapshot: { findings: [{ id: finding.id, category: 'brady', severity: 'dispositive', provenance: 'ai', partAText: finding.partAText, partBText: finding.partBText, citations: [{ volume: 'RR2', page: 116, line: null, excerpt: 'withheld pending the DPS supplemental report' }] }] },
    },
  });
});

afterAll(async () => {
  await prisma.staffRequest.deleteMany({ where: { tenantId } });
  await prisma.supportNote.deleteMany({ where: { tenantId } });
  await prisma.report.deleteMany({ where: { tenantId } });
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId } } });
  await prisma.finding.deleteMany({ where: { tenantId } });
  await prisma.analysisRun.deleteMany({ where: { tenantId } });
  await prisma.documentChunk.deleteMany({ where: { document: { caseId } } });
  await prisma.documentPage.deleteMany({ where: { document: { caseId } } });
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { userId } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('what SUPPORT can and cannot do', () => {
  it('reads the queue, the case file, feedback, accounts, and status', async () => {
    for (const url of ['/ops/queue', `/ops/cases/${caseId}/file`, `/ops/cases/${caseId}/timeline`, '/ops/feedback', '/ops/accounts', '/ops/status']) {
      expect((await get(url)).statusCode, url).toBe(200);
    }
  });

  it('is walled off from money, cost, promos, deletion, and drills', async () => {
    for (const url of ['/ops/payments', '/ops/payments/summary', '/ops/refunds', '/ops/promos', `/ops/cases/${caseId}/cogs`, '/ops/retention-candidates', '/ops/sentry-test']) {
      expect((await get(url)).statusCode, url).toBe(403);
    }
    for (const url of [`/ops/cases/${caseId}/refund`, `/ops/cases/${caseId}/delete`, `/ops/accounts/${userId}/delete`, '/ops/reconcile-payments', '/ops/email-test', '/ops/promos']) {
      expect((await post(url, { reason: 'other', confirmEmail: 'x' })).statusCode, url).toBe(403);
    }
  });

  it('can mark a delay ours — the unblocking action a family is waiting on', async () => {
    const res = await post(`/ops/cases/${caseId}/delay-ours`, { extendedToDate: '2026-09-20' });
    expect(res.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).delayOurs).toBe(true);
    expect((await post(`/ops/cases/${caseId}/delay-cleared`)).statusCode).toBe(200);
  });

  it('logs a contact: note body stored, event carries only the id and channel, shows on the case file', async () => {
    const res = await post(`/ops/cases/${caseId}/contact`, { channel: 'phone', body: 'Family asked for an update; told them Sep 10.' });
    expect(res.statusCode).toBe(200);
    const note = res.json();
    expect(note).toMatchObject({ channel: 'phone', authorId: supportId });
    const ev = await prisma.caseEvent.findFirst({ where: { caseId, type: 'support.contacted' }, orderBy: { createdAt: 'desc' } });
    expect(ev?.payload).toEqual({ noteId: note.id, channel: 'phone' });
    expect(ev?.actor).toBe(supportId);
    const file = (await get(`/ops/cases/${caseId}/file`)).json();
    expect(file.notes[0]).toMatchObject({ body: 'Family asked for an update; told them Sep 10.', authorEmail: `${run}_support@x.com` });
    expect((await post(`/ops/cases/${caseId}/contact`, { channel: 'fax', body: 'x' })).statusCode).toBe(400);
  });

  it('raises a deletion request (never deletes), sees only its own requests, and cannot decide', async () => {
    const res = await post(`/ops/cases/${caseId}/requests`, { type: 'CASE_DELETE', reason: 'customer_request', note: 'Family emailed asking us to remove everything.' });
    expect(res.statusCode).toBe(200);
    const req = res.json();
    expect(req).toMatchObject({ type: 'CASE_DELETE', decision: null, requestedBy: supportId });
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('READY'); // nothing happened yet
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'request.opened' } })).toBe(1);

    const again = await post(`/ops/cases/${caseId}/requests`, { type: 'CASE_DELETE', reason: 'other' });
    expect(again.statusCode).toBe(409);
    expect(again.json().openRequestId).toBe(req.id);
    expect((await post(`/ops/cases/${caseId}/requests`, { type: 'REFUND', reason: 'bogus' })).statusCode).toBe(400);
    // No paid payment on this case → a refund request is refused up front.
    expect((await post(`/ops/cases/${caseId}/requests`, { type: 'REFUND', reason: 'other' })).statusCode).toBe(409);

    const mine = (await get('/ops/requests')).json();
    expect(mine.open.map((r: { id: string }) => r.id)).toContain(req.id);
    expect(mine.open.every((r: { requestedByEmail: string }) => r.requestedByEmail === `${run}_support@x.com`)).toBe(true);

    expect((await post(`/ops/requests/${req.id}/decide`, { decision: 'APPROVED' })).statusCode).toBe(403);
    const file = (await get(`/ops/cases/${caseId}/file`)).json();
    expect(file.requests.open[0]).toMatchObject({ id: req.id, type: 'CASE_DELETE' });
  });

  it('CLIENTs never reach the case file', async () => {
    expect((await get(`/ops/cases/${caseId}/file`, clientCookie)).statusCode).toBe(403);
  });
});

describe('the case file', () => {
  it('assembles uploads with page counts, the analysis, and the released report', async () => {
    const res = await get(`/ops/cases/${caseId}/file`);
    const file = res.json();
    expect(file.case).toMatchObject({ id: caseId, status: 'READY', customerEmail: `${run}@x.com`, customerName: 'Jo Whitfield' });
    expect(file.meter).toEqual({ billable: 2, duplicatesIgnored: 1 });

    const doc = file.documents.find((d: { id: string }) => d.id === docId);
    expect(doc).toMatchObject({ filename: 'RR_Vol1.pdf', pages: 3, billablePages: 2, ocrProvider: 'pdf-text', recognized: true, downloadable: true });
    const bad = file.documents.find((d: { id: string }) => d.id === quarantinedId);
    expect(bad).toMatchObject({ quarantined: true, downloadable: false, pages: 0 });

    expect(file.runs).toHaveLength(1);
    expect(file.runs[0].findings[0]).toMatchObject({ category: 'brady', severity: 'dispositive', partAText: 'A lab report the defense never received.' });
    expect(file.runs[0].findings[0].citations[0]).toMatchObject({ volume: 'RR2', page: 116 });

    expect(file.reports[0]).toMatchObject({ versionNo: 1, approvedByEmail: `${run}_admin@x.com`, findingsCount: 1 });
    expect(file.shareLinks).toEqual([]);
  });

  it('hands out a signed download for a real file, never for a quarantined one, and audits it', async () => {
    const ok = await get(`/ops/cases/${caseId}/documents/${docId}/download`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().url).toContain('X-Amz-Signature');
    expect(ok.json().filename).toBe('RR_Vol1.pdf');
    const audit = await prisma.auditLog.findFirst({ where: { caseId, userId: supportId, action: 'CASE_ACCESS' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.details).toMatchObject({ op: 'document_download', documentId: docId, staff: true });

    expect((await get(`/ops/cases/${caseId}/documents/${quarantinedId}/download`)).statusCode).toBe(404);
  });

  it('re-renders the family\'s PDF from the released snapshot', async () => {
    const res = await get(`/ops/cases/${caseId}/report/pdf`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`family-case-review-${caseId}-v1.pdf`);
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get(`/ops/cases/${caseId}/report/pdf?version=9`)).statusCode).toBe(404);
  });
});
