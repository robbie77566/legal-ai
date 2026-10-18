/**
 * Workstream D (persona_rollout_plan.md §4, §5 D, January slice) — record
 * inventory through the routes, live Postgres:
 *   D2 the meter sets the bucket from reporter's-record pages alone
 *   D3 missing volumes; unlabelled files listed under UNKNOWN, never dropped
 *   D4 OCR confidence per volume once digitised
 *   D6 cross-tenant GET /cases/:id/inventory is 404 (RLS inherited)
 * plus the upload-complete contract (explicit label vs unconfirmed suggestion)
 * and the recompute hooks (volume change, removal).
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `inv_${Date.now()}`;
let tenantId: string;
let userId: string;
let cookie: string;
let otherTenantId: string;
let otherCookie: string;
let strangerCookie: string;
const caseIds: string[] = [];

const seedCase = async (title: string) => {
  const c = await prisma.case.create({
    data: {
      title: `${run}_${title}`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL', vehicle: '11.07',
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseIds.push(c.id);
  return c.id;
};

/** A document with `pages` billable pages (plus `dups` duplicate pages) and optional per-page confidences. */
const seedDoc = async (
  caseId: string,
  filename: string,
  opts: { kind?: 'REPORTER' | 'CLERK' | 'EXHIBIT' | 'UNKNOWN'; index?: number; count?: number; pages?: number; dups?: number; confidences?: number[] } = {}
) => {
  const d = await prisma.document.create({
    data: {
      filename, caseId, s3Key: null,
      volumeKind: opts.kind ?? 'UNKNOWN', volumeIndex: opts.index ?? null, volumeCount: opts.count ?? null,
    },
  });
  const pages = opts.pages ?? 0;
  const dups = opts.dups ?? 0;
  if (pages + dups > 0) {
    await prisma.documentPage.createMany({
      data: Array.from({ length: pages + dups }, (_, i) => ({
        documentId: d.id,
        pageNo: i + 1,
        contentHash: `${run}_${d.id}_${i + 1}`,
        billable: i < pages,
        dedupKind: i < pages ? null : 'exact',
        ocrConfidence: opts.confidences ? opts.confidences[i % opts.confidences.length] : null,
      })),
    });
  }
  return d.id;
};

const patchVolume = (caseId: string, docId: string, body: Record<string, unknown>, c = cookie) =>
  fastify.inject({ method: 'PATCH', url: `/cases/${caseId}/documents/${docId}/volume`, headers: { cookie: c }, payload: body });
const getInventory = (caseId: string, c = cookie) =>
  fastify.inject({ method: 'GET', url: `/cases/${caseId}/inventory`, headers: { cookie: c } });

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@example.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  const t2 = await prisma.tenant.create({ data: { name: `${run}_T2` } });
  otherTenantId = t2.id;
  const u2 = await prisma.user.create({ data: { email: `${run}_other@example.com`, tenantId: otherTenantId, role: 'CLIENT' } });
  otherCookie = `next-auth.session-token=${await encodeSessionToken({ userId: u2.id, tenantId: otherTenantId, role: 'CLIENT' })}`;
  const s = await prisma.user.create({ data: { email: `${run}_stranger@example.com`, tenantId, role: 'CLIENT' } });
  strangerCookie = `next-auth.session-token=${await encodeSessionToken({ userId: s.id, tenantId, role: 'CLIENT' })}`;
});

afterAll(async () => {
  await prisma.documentPage.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
  await prisma.documentChunk.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
  await prisma.document.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.caseAccess.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await prisma.$disconnect();
});

describe('upload complete — the uploader labels, or the filename suggests (unconfirmed)', () => {
  let caseId: string;
  beforeAll(async () => { caseId = await seedCase('upload'); });

  it('stores the filename suggestion unconfirmed and recomputes the meter', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/upload/complete', headers: { cookie },
      payload: { caseId, filename: 'RR Vol 3 of 7.pdf', s3Key: `cases/${caseId}/a-rr3.pdf` },
    });
    expect(res.statusCode).toBe(200);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.json().documentId } });
    expect(doc).toMatchObject({ volumeKind: 'REPORTER', volumeIndex: 3, volumeCount: 7, volumeLabel: 'RR vol. 3 of 7', volumeConfirmed: false });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.recordBucket).toBe('SHORT'); // no pages read yet
    expect(kase.meteredPages).toEqual({ reporter: 0, clerk: 0, exhibit: 0, unknown: 0 });
    expect(kase.inventoryAt).toBeInstanceOf(Date);
  });

  it('an explicit volume from the uploader is stored confirmed, whatever the filename says', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/upload/complete', headers: { cookie },
      payload: { caseId, filename: 'scan0001.pdf', s3Key: `cases/${caseId}/b-scan.pdf`, volume: { kind: 'CLERK', index: 1, count: 2 } },
    });
    expect(res.statusCode).toBe(200);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: res.json().documentId } });
    expect(doc).toMatchObject({ volumeKind: 'CLERK', volumeIndex: 1, volumeCount: 2, volumeLabel: 'CR vol. 1 of 2', volumeConfirmed: true });
  });

  it('a nonsense volume (index above count) is refused, the file is not registered', async () => {
    const before = await prisma.document.count({ where: { caseId } });
    const res = await fastify.inject({
      method: 'POST', url: '/upload/complete', headers: { cookie },
      payload: { caseId, filename: 'x.pdf', s3Key: `cases/${caseId}/c-x.pdf`, volume: { kind: 'REPORTER', index: 5, count: 2 } },
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma.document.count({ where: { caseId } })).toBe(before);
  });

  it('the checklist lists each file with its volume fields', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/checklist`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const docs = res.json().documents as Array<Record<string, unknown>>;
    expect(docs.find((d) => d.filename === 'RR Vol 3 of 7.pdf')).toMatchObject({ volumeKind: 'REPORTER', volumeLabel: 'RR vol. 3 of 7', volumeIndex: 3, volumeCount: 7, volumeConfirmed: false });
    expect(docs.find((d) => d.filename === 'scan0001.pdf')).toMatchObject({ volumeKind: 'CLERK', volumeConfirmed: true });
  });
});

describe('D2 — the meter sets the bucket from reporter pages alone', () => {
  let caseId: string;
  let rr1: string;
  let cr: string;
  beforeAll(async () => {
    caseId = await seedCase('meter');
    // 412 reporter pages across two volumes (+5 duplicate pages that never meter), 88 clerk, 20 exhibit.
    rr1 = await seedDoc(caseId, 'RR vol 1 of 2.pdf', { kind: 'REPORTER', index: 1, count: 2, pages: 300, dups: 5 });
    await seedDoc(caseId, 'RR vol 2 of 2.pdf', { kind: 'REPORTER', index: 2, count: 2, pages: 112 });
    cr = await seedDoc(caseId, "Clerk's record.pdf", { kind: 'CLERK', pages: 88 });
    await seedDoc(caseId, 'Exhibits.pdf', { kind: 'EXHIBIT', pages: 20 });
  });

  it('412 reporter / 88 clerk / 20 exhibit → STANDARD with exact metered pages, on the case and in the inventory', async () => {
    // Confirming a label is one of the recompute triggers.
    const confirm = await patchVolume(caseId, rr1, { kind: 'REPORTER', index: 1, count: 2, confirmed: true });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().document).toMatchObject({ volumeKind: 'REPORTER', volumeLabel: 'RR vol. 1 of 2', volumeConfirmed: true });

    const kase = await fastify.inject({ method: 'GET', url: `/cases/${caseId}`, headers: { cookie } });
    expect(kase.statusCode).toBe(200);
    expect(kase.json().recordBucket).toBe('STANDARD');
    expect(kase.json().meteredPages).toEqual({ reporter: 412, clerk: 88, exhibit: 20, unknown: 0 });

    const inv = await getInventory(caseId);
    expect(inv.statusCode).toBe(200);
    const body = inv.json();
    expect(body.bucket).toBe('STANDARD');
    expect(body.meteredPages).toEqual({ reporter: 412, clerk: 88, exhibit: 20, unknown: 0, total: 520 });
    expect(body.bucketNote).toBeNull();
    const reporter = body.volumes.find((v: { kind: string }) => v.kind === 'REPORTER');
    expect(reporter.pages).toBe(412);
    expect(reporter.docs.map((d: { label: string; pages: number; confirmed: boolean }) => [d.label, d.pages, d.confirmed])).toEqual([
      ['RR vol. 1 of 2', 300, true],
      ['RR vol. 2 of 2', 112, false],
    ]);
    expect(reporter.docs[0].duplicatesIgnored).toBe(5);
    expect(body.missing).toEqual([]);
    expect(body.unknownCount).toBe(0);
    const ev = await prisma.caseEvent.findFirst({ where: { caseId, type: 'doc.volume_set' }, orderBy: { id: 'desc' } });
    expect(ev?.payload).toEqual({ documentId: rr1, kind: 'REPORTER', index: 1, count: 2, confirmed: true });
  });

  it('501 reporter pages → EXTENDED; relabelling a file moves its pages between kinds', async () => {
    const rr3 = await seedDoc(caseId, 'scan.pdf', { pages: 89 });
    // Seeded directly, so the stored projection is stale until a trigger fires.
    const label = await patchVolume(caseId, rr3, { kind: 'REPORTER', index: 3, confirmed: true });
    expect(label.statusCode).toBe(200);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: caseId } })).recordBucket).toBe('EXTENDED');
    expect(label.json().inventory.meteredPages).toMatchObject({ reporter: 501, unknown: 0 });

    // Back to UNKNOWN: the pages leave the bucket count but are still metered.
    const unlabel = await patchVolume(caseId, rr3, { kind: 'UNKNOWN', confirmed: true });
    expect(unlabel.statusCode).toBe(200);
    expect(unlabel.json().inventory).toMatchObject({ bucket: 'STANDARD', meteredPages: { reporter: 412, unknown: 89, total: 609 } });
    expect(unlabel.json().document).toMatchObject({ volumeKind: 'UNKNOWN', volumeIndex: null, volumeCount: null, volumeLabel: null });
  });

  it('removing a file recomputes the meter', async () => {
    const res = await fastify.inject({ method: 'DELETE', url: `/cases/${caseId}/documents/${cr}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.meteredPages).toMatchObject({ clerk: 0, reporter: 412 });
  });

  it("clerk's pages alone never set the bucket: reporter 0, clerk 2,000 → SHORT with a note", async () => {
    const clerkOnly = await seedCase('clerk_only');
    const doc = await seedDoc(clerkOnly, 'CR.pdf', { kind: 'CLERK', pages: 2000 });
    await patchVolume(clerkOnly, doc, { kind: 'CLERK', confirmed: true });
    const inv = await getInventory(clerkOnly);
    expect(inv.json().bucket).toBe('SHORT');
    expect(inv.json().meteredPages).toEqual({ reporter: 0, clerk: 2000, exhibit: 0, unknown: 0, total: 2000 });
    expect(inv.json().bucketNote).toMatch(/reporter/i);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: clerkOnly } })).recordBucket).toBe('SHORT');
  });

  it('validation: an unknown kind or an index above the count is 400; a file from another case is 404', async () => {
    expect((await patchVolume(caseId, rr1, { kind: 'TRANSCRIPT', confirmed: true })).statusCode).toBe(400);
    expect((await patchVolume(caseId, rr1, { kind: 'REPORTER', index: 4, count: 2, confirmed: true })).statusCode).toBe(400);
    expect((await patchVolume(caseId, 'nope', { kind: 'REPORTER', confirmed: true })).statusCode).toBe(404);
  });
});

describe('D3 — missing volumes; unlabelled files are listed, never dropped', () => {
  let caseId: string;
  beforeAll(async () => {
    caseId = await seedCase('missing');
    await seedDoc(caseId, 'RR vol 1 of 4.pdf', { kind: 'REPORTER', index: 1, count: 4, pages: 10 });
    await seedDoc(caseId, 'RR vol 2 of 4.pdf', { kind: 'REPORTER', index: 2, count: 4, pages: 10 });
    await seedDoc(caseId, 'RR vol 4 of 4.pdf', { kind: 'REPORTER', index: 4, count: 4, pages: 10 });
    await seedDoc(caseId, 'scan0001.pdf', { pages: 3 });
    await seedDoc(caseId, 'IMG_1.heic', {}); // not even digitised yet
  });

  it('RR vols 1, 2, 4 of 4 → vol 3 is missing; UNKNOWN holds the unlabelled files and counts their pages', async () => {
    const inv = await getInventory(caseId);
    expect(inv.statusCode).toBe(200);
    const body = inv.json();
    expect(body.missing).toEqual([{ kind: 'REPORTER', index: 3, count: 4, label: 'RR vol. 3 of 4' }]);
    const unknown = body.volumes.find((v: { kind: string }) => v.kind === 'UNKNOWN');
    expect(unknown.docs.map((d: { filename: string; pages: number; digitised: boolean }) => [d.filename, d.pages, d.digitised])).toEqual([
      ['IMG_1.heic', 0, false],
      ['scan0001.pdf', 3, true],
    ]);
    expect(body.unknownCount).toBe(2);
    expect(body.meteredPages).toEqual({ reporter: 30, clerk: 0, exhibit: 0, unknown: 3, total: 33 });
    expect(body.bucketNote).toMatch(/not yet labelled/);
  });
});

describe('D4 — OCR confidence per volume once digitised', () => {
  let caseId: string;
  let scanned: string;
  beforeAll(async () => {
    caseId = await seedCase('ocr');
    scanned = await seedDoc(caseId, 'RR vol 1 of 2.pdf', { kind: 'REPORTER', index: 1, count: 2, pages: 4, confidences: [0.9, 0.7] });
    await seedDoc(caseId, 'RR vol 2 of 2.pdf', { kind: 'REPORTER', index: 2, count: 2, pages: 2, confidences: [1] });
    await seedDoc(caseId, 'CR.pdf', { kind: 'CLERK' }); // not read yet → no confidence
  });

  it('the inventory carries the mean per file and per kind; recompute stores it on the document', async () => {
    const inv = await getInventory(caseId);
    const reporter = inv.json().volumes.find((v: { kind: string }) => v.kind === 'REPORTER');
    expect(reporter.docs[0].ocrConfidence).toBeCloseTo(0.8, 5);
    expect(reporter.docs[1].ocrConfidence).toBe(1);
    expect(reporter.ocrConfidence).toBeCloseTo((0.9 + 0.7 + 0.9 + 0.7 + 1 + 1) / 6, 5);
    const clerk = inv.json().volumes.find((v: { kind: string }) => v.kind === 'CLERK');
    expect(clerk.docs[0].ocrConfidence).toBeNull();
    expect(clerk.ocrConfidence).toBeNull();

    await patchVolume(caseId, scanned, { kind: 'REPORTER', index: 1, count: 2, confirmed: true });
    expect((await prisma.document.findUniqueOrThrow({ where: { id: scanned } })).ocrConfidence).toBeCloseTo(0.8, 5);
  });
});

describe('D6 — RLS inherited: the inventory of another tenant\'s case does not exist', () => {
  let caseId: string;
  beforeAll(async () => { caseId = await seedCase('rls'); });

  it('cross-tenant GET /cases/:id/inventory is 404; PATCH volume too', async () => {
    expect((await getInventory(caseId, otherCookie)).statusCode).toBe(404);
    const doc = await seedDoc(caseId, 'RR.pdf', { kind: 'REPORTER' });
    expect((await patchVolume(caseId, doc, { kind: 'CLERK', confirmed: true }, otherCookie)).statusCode).toBe(404);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc } })).volumeKind).toBe('REPORTER');
  });

  it('a same-tenant account without case access is 403, like /pages', async () => {
    expect((await getInventory(caseId, strangerCookie)).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/pages`, headers: { cookie: strangerCookie } })).statusCode).toBe(403);
  });
});
