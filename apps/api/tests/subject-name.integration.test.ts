/**
 * The name of the person in custody (Case.subjectName, 2026-11-01) — live
 * Postgres, route level. The founder's ask: "in the cases view, add the name
 * of person in jail as well as the account holder."
 *  X1  the interview stores it trimmed, capped at 120, blank → null; it rides
 *      on GET /cases/:id, the checklist, /ops/queue and the staff case file;
 *      PATCH /facts updates and clears it; the family's export carries it;
 *      another tenant cannot read it; deletion removes it with the Case row.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The export bundles from S3 — not in the loop here, exactly as me.integration does it.
vi.mock('../src/services/storage.service', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getObjectSize: async () => 1024,
  getObjectBytes: async () => Buffer.from('%PDF-1.4 test'),
}));
import AdmZip from 'adm-zip';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { deleteCaseScoped } from '../src/services/deletion.service';

const run = `subject_${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let userId: string;
let adminId: string;
let strangerId: string;
let caseId: string;
let cookie: string;
let adminCookie: string;
let strangerCookie: string;

const post = (url: string, payload: Record<string, unknown>, c = cookie) => fastify.inject({ method: 'POST', url, headers: { cookie: c }, payload });
const patch = (url: string, payload: Record<string, unknown>, c = cookie) => fastify.inject({ method: 'PATCH', url, headers: { cookie: c }, payload });
const get = (url: string, c = cookie) => fastify.inject({ method: 'GET', url, headers: { cookie: c } });
const INTERVIEW = { county: 'Harris', convictionYear: 2019, hadAppeal: true };

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { name: `${run}_T` } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: `${run}_T2` } })).id;
  userId = (await prisma.user.create({ data: { email: `${run}@example.com`, name: 'Maria Pérez', tenantId, role: 'CLIENT' } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, tenantId, role: 'ADMIN' } })).id;
  strangerId = (await prisma.user.create({ data: { email: `${run}_other@example.com`, tenantId: otherTenantId, role: 'CLIENT' } })).id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId, role: 'ADMIN' })}`;
  strangerCookie = `next-auth.session-token=${await encodeSessionToken({ userId: strangerId, tenantId: otherTenantId, role: 'CLIENT' })}`;
  caseId = (await prisma.case.create({
    data: { title: 'Case review', tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL', vehicle: '11.07', accessList: { create: { userId, role: 'ADMIN' } } },
  })).id;
  await prisma.document.create({ data: { filename: 'RR_Vol1.pdf', caseId, s3Key: `cases/${caseId}/rr1.pdf` } });
  await fastify.ready();
});

afterAll(async () => {
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.checklistItem.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { userId: { in: [userId, strangerId] } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.$disconnect();
});

describe('capture: the interview and the facts patch', () => {
  it('the interview stores the name trimmed, on the Case and not in the facts', async () => {
    const res = await post(`/cases/${caseId}/interview`, { ...INTERVIEW, subjectName: '  Juan Pérez  ' });
    expect(res.statusCode).toBe(200);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.subjectName).toBe('Juan Pérez');
    expect(kase.facts).not.toHaveProperty('subjectName');
  });

  it('121 characters is refused with a human message; 120 is kept', async () => {
    const long = await post(`/cases/${caseId}/interview`, { ...INTERVIEW, subjectName: 'x'.repeat(121) });
    expect(long.statusCode).toBe(400);
    expect(JSON.stringify(long.json())).toMatch(/120 characters/);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBe('Juan Pérez'); // untouched
    const max = await post(`/cases/${caseId}/interview`, { ...INTERVIEW, subjectName: 'y'.repeat(120) });
    expect(max.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBe('y'.repeat(120));
  });

  it('an interview without the field leaves the name alone (an existing interview still completes); blank clears it', async () => {
    const same = await post(`/cases/${caseId}/interview`, INTERVIEW);
    expect(same.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBe('y'.repeat(120));
    const blank = await post(`/cases/${caseId}/interview`, { ...INTERVIEW, subjectName: '   ' });
    expect(blank.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBeNull();
  });

  it('PATCH /facts sets it, echoes it, and clears it on an empty string — the facts stay enums and dates only', async () => {
    const set = await patch(`/cases/${caseId}/facts`, { subjectName: ' Juan Pérez ' });
    expect(set.statusCode).toBe(200);
    expect(set.json().subjectName).toBe('Juan Pérez');
    expect(set.json().facts).not.toHaveProperty('subjectName');
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBe('Juan Pérez');
    const events = await prisma.caseEvent.findMany({ where: { caseId, type: 'facts.updated' }, orderBy: { id: 'desc' }, take: 1 });
    expect(events[0]?.payload).toEqual({ keys: ['subjectName'] }); // the event names the key, never the value

    const clear = await patch(`/cases/${caseId}/facts`, { subjectName: '' });
    expect(clear.statusCode).toBe(200);
    expect(clear.json().subjectName).toBeNull();
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).subjectName).toBeNull();
    // Put it back for the reads below.
    await patch(`/cases/${caseId}/facts`, { subjectName: 'Juan Pérez' });
  });
});

describe('reads: the family, the staff console, the export', () => {
  it('GET /cases/:id and the checklist carry subjectName; another tenant gets nothing', async () => {
    const mine = await get(`/cases/${caseId}`);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().subjectName).toBe('Juan Pérez');
    const checklist = await get(`/cases/${caseId}/checklist`);
    expect(checklist.json().subjectName).toBe('Juan Pérez');
    const theirs = await get(`/cases/${caseId}`, strangerCookie);
    expect(theirs.statusCode).toBe(403);
    expect(JSON.stringify(theirs.json())).not.toContain('Juan');
  });

  it('/ops/queue rows and the case file read model carry it beside the account holder', async () => {
    const queue = await get('/ops/queue', adminCookie);
    expect(queue.statusCode).toBe(200);
    const row = queue.json().find((c: { id: string }) => c.id === caseId);
    expect(row).toMatchObject({ subjectName: 'Juan Pérez', customerName: 'Maria Pérez', customerEmail: `${run}@example.com` });
    const file = await get(`/ops/cases/${caseId}/file`, adminCookie);
    expect(file.statusCode).toBe(200);
    expect(file.json().case).toMatchObject({ subjectName: 'Juan Pérez', customerName: 'Maria Pérez' });
  });

  it('the family export bundles your-reviews.json with "recordOf"', async () => {
    const r = await get('/me/export');
    expect(r.statusCode).toBe(200);
    const zip = new AdmZip(r.rawPayload);
    const entry = zip.getEntry('your-reviews.json');
    expect(entry).toBeTruthy();
    const reviews = JSON.parse(zip.readAsText(entry!));
    expect(reviews).toEqual([expect.objectContaining({ review: 'Harris County · 2019', recordOf: 'Juan Pérez' })]);
  });
});

describe('deletion', () => {
  it('the scoped deletion removes the Case row, and the name with it; the queue no longer lists it', async () => {
    const before = await prisma.case.findUnique({ where: { id: caseId }, select: { subjectName: true } });
    expect(before?.subjectName).toBe('Juan Pérez');
    const out = await deleteCaseScoped(caseId, adminId);
    expect(out).toBeTruthy();
    expect(await prisma.case.findUnique({ where: { id: caseId } })).toBeNull();
    const queue = await get('/ops/queue', adminCookie);
    expect(queue.json().some((c: { id: string }) => c.id === caseId)).toBe(false);
    // The surviving event skeleton never carried the name.
    const events = await prisma.caseEvent.findMany({ where: { caseId } });
    expect(JSON.stringify(events.map((e) => e.payload))).not.toContain('Juan');
  });
});
