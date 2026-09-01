/**
 * M3 digitization integration tests — live Postgres, real pdf-parse on a
 * pdf-lib-generated PDF (born-digital path), deterministic fake extractor
 * for the low-confidence/halt path. Proves the DocumentPage billable ledger,
 * exact-hash dedup (§11a.3), real chunking with page provenance, and E-1.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { digitizeDocument, buildDefaultExtractor, type Extractor, type DocClassifier } from '../src/services/digitize.service';

const run = `dig_${Date.now()}`;
let tenantId: string;
let userId: string;
let caseId: string;
let cookie: string;
let pdfBytes: Buffer;

const PAGE1 = `${run} REPORTER'S RECORD VOLUME 3. THE COURT: The objection to the bite mark comparison is overruled and the testimony will be received into evidence for all purposes.`;
const PAGE2 = `${run} CROSS-EXAMINATION CONTINUED. Q: And you never disclosed the laboratory bench notes to the defense before trial, correct? A: We kept those in our working file.`;

async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of [PAGE1, PAGE2]) {
    const page = doc.addPage([612, 792]);
    page.drawText(text, { x: 40, y: 700, size: 10, font, maxWidth: 530, lineHeight: 14 });
  }
  return Buffer.from(await doc.save());
}

const seedDoc = (filename: string) =>
  prisma.document.create({ data: { filename, caseId } });

beforeAll(async () => {
  pdfBytes = await makePdf();
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL',
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
  await prisma.checklistItem.create({
    data: { caseId, kind: 'rr_volume', label: "Reporter's record volumes", howToKey: 'howto.rr_volume' },
  });
});

afterAll(async () => {
  await prisma.checklistItem.deleteMany({ where: { caseId } });
  await prisma.documentPage.deleteMany({ where: { document: { caseId } } });
  await prisma.documentChunk.deleteMany({ where: { document: { caseId } } });
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { caseId } });
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('Tier-1 classifier confidence policy (upload_page_ux_review.md)', () => {
  const stub = (kind: string | null, confidence: 'high' | 'medium' | 'low'): DocClassifier => ({
    classify: async () => ({ kind, confidence }),
  });
  const uniqueExtractor = (tag: string): Extractor => ({
    extract: async () => [{ text: `classifier-policy fixture ${tag} ${Date.now()}`, confidence: 1 }],
  });
  // Own case: the born-digital suite asserts exact event/page counts on the
  // shared case, so this suite must not write into it.
  let polCaseId: string;
  const polDoc = (filename: string) => prisma.document.create({ data: { filename, caseId: polCaseId } });
  beforeAll(async () => {
    const c = await prisma.case.create({
      data: {
        title: `${run}_pol`, tenantId, status: 'AWAITING_DOCS', lane: 'TRIAL',
        accessList: { create: { userId, role: 'ADMIN' } },
      },
    });
    polCaseId = c.id;
    await prisma.checklistItem.create({ data: { caseId: polCaseId, kind: 'judgment', label: 'Judgment and sentence', howToKey: 'howto.judgment' } });
    await prisma.checklistItem.create({ data: { caseId: polCaseId, kind: 'indictment', label: 'Indictment', howToKey: 'howto.indictment' } });
  });
  afterAll(async () => {
    await prisma.checklistItem.deleteMany({ where: { caseId: polCaseId } });
    await prisma.documentPage.deleteMany({ where: { document: { caseId: polCaseId } } });
    await prisma.documentChunk.deleteMany({ where: { document: { caseId: polCaseId } } });
    await prisma.document.deleteMany({ where: { caseId: polCaseId } });
    await prisma.caseAccess.deleteMany({ where: { caseId: polCaseId } });
    await prisma.case.deleteMany({ where: { id: polCaseId } });
  });

  it('HIGH confidence files silently: item checked, no echo-back card (classificationConfirmed)', async () => {
    const doc = await polDoc('judgment-scan.pdf');
    await digitizeDocument(doc.id, {
      bytes: pdfBytes,
      s3Key: `cases/${polCaseId}/judgment-scan.pdf`,
      extractor: uniqueExtractor('high'),
      classifier: stub('judgment', 'high'),
    });
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { caseId: polCaseId, kind: 'judgment' } });
    expect(updated.suggestedChecklistItemId).toBe(item.id);
    expect(updated.classificationConfirmed).toBe(true); // the card never shows
    expect(item.state).toBe('UPLOADED');
  });

  it('LOW confidence proposes nothing — a wrong guess is worse than none', async () => {
    const doc = await polDoc('mystery.pdf');
    const summary = await digitizeDocument(doc.id, {
      bytes: pdfBytes,
      s3Key: `cases/${polCaseId}/mystery.pdf`,
      extractor: uniqueExtractor('low'),
      classifier: stub('indictment', 'low'),
    });
    expect(summary.suggestedKind).toBeNull();
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.suggestedChecklistItemId).toBeNull();
    expect(updated.classificationConfirmed).toBe(false);
  });

  it('MEDIUM confidence keeps the confirm/correct contract (suggested, unconfirmed)', async () => {
    const doc = await polDoc('maybe-indictment.pdf');
    await digitizeDocument(doc.id, {
      bytes: pdfBytes,
      s3Key: `cases/${polCaseId}/maybe-indictment.pdf`,
      extractor: uniqueExtractor('medium'),
      classifier: stub('indictment', 'medium'),
    });
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.suggestedChecklistItemId).not.toBeNull();
    expect(updated.classificationConfirmed).toBe(false); // card shows
  });
});

describe('born-digital PDF digitization (pdf-parse, no network)', () => {
  it('extracts per-page text, writes the billable ledger, chunks with page provenance, and appends doc.ocr_done', async () => {
    const doc = await seedDoc('rr-vol-3.pdf');
    const summary = await digitizeDocument(doc.id, {
      bytes: pdfBytes,
      s3Key: `cases/${caseId}/rr-vol-3.pdf`,
      extractor: buildDefaultExtractor(),
    });

    expect(summary).toMatchObject({ pages: 2, billable: 2, duplicatesIgnored: 0, halted: false });

    const pages = await prisma.documentPage.findMany({ where: { documentId: doc.id }, orderBy: { pageNo: 'asc' } });
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.billable && p.ocrProvider === 'pdf-text' && p.ocrConfidence === 1)).toBe(true);

    const chunks = await prisma.documentChunk.findMany({ where: { documentId: doc.id } });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.content.includes('bite mark comparison'))).toBe(true);
    expect((chunks[0].metadata as { page: number }).page).toBeGreaterThan(0);

    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.ocr_done' } })).toBe(1);

    // Echo-back: "REPORTER'S RECORD" text classifies to the rr_volume item
    expect(summary.suggestedKind).toBe('rr_volume');
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { caseId, kind: 'rr_volume' } });
    expect(item.state).toBe('UPLOADED');
    const updatedDoc = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updatedDoc.suggestedChecklistItemId).toBe(item.id);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.classified' } })).toBe(1);
  });

  it('the customer confirms the echo-back — item goes CONFIRMED, event appended', async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { caseId, filename: 'rr-vol-3.pdf' } });
    const res = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/documents/${doc.id}/confirm`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const item = await prisma.checklistItem.findFirstOrThrow({ where: { caseId, kind: 'rr_volume' } });
    expect(item.state).toBe('CONFIRMED');
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.confirmed' } })).toBe(1);
  });

  it('the SAME pages uploaded again dedup exactly: zero new billable pages, zero new analysis chunks (§11a.3)', async () => {
    const dup = await seedDoc('rr-vol-3-again.pdf');
    const summary = await digitizeDocument(dup.id, {
      bytes: pdfBytes,
      s3Key: `cases/${caseId}/again.pdf`,
      extractor: buildDefaultExtractor(),
    });

    expect(summary.billable).toBe(0);
    expect(summary.duplicatesIgnored).toBe(2);
    expect(await prisma.documentChunk.count({ where: { documentId: dup.id } })).toBe(0);
    const dupPages = await prisma.documentPage.findMany({ where: { documentId: dup.id } });
    expect(dupPages.every((p) => p.dedupKind === 'exact' && !p.billable)).toBe(true);
  });

  it('the page meter (one authority) reports billable + duplicatesIgnored', async () => {
    const res = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/pages`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ billable: 2, duplicatesIgnored: 2, cap: 5000 });
  });
});

describe('quarantine (ENG-4)', () => {
  it('an infected upload quarantines: no pages, no chunks, doc.quarantined event', async () => {
    const doc = await seedDoc('virus.pdf');
    const summary = await digitizeDocument(doc.id, {
      bytes: Buffer.from('EICAR-ish'),
      s3Key: `cases/${caseId}/virus.pdf`,
      extractor: buildDefaultExtractor(),
      scanner: { scan: async () => ({ clean: false, signature: 'Eicar-Test-Signature FOUND' }) },
    });
    expect(summary.quarantined).toBe(true);
    expect(summary.pages).toBe(0);
    const d = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(d.quarantined).toBe(true);
    expect(await prisma.documentPage.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'doc.quarantined' } })).toBe(1);
  });
});

describe('E-1 low-confidence halt', () => {
  it('a bad-scan cohort sets OCR_HALT before any analysis spend', async () => {
    const scan = await seedDoc('bad-scan.pdf');
    const badExtractor: Extractor = {
      extract: async () =>
        Array.from({ length: 12 }, (_, i) => ({
          text: `${run} illegible page ${i} with barely readable smudged content here`,
          confidence: 0.3,
        })),
    };
    const summary = await digitizeDocument(scan.id, {
      bytes: Buffer.from('x'),
      s3Key: `cases/${caseId}/bad.pdf`,
      extractor: badExtractor,
    });

    expect(summary.halted).toBe(true);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.ocrHalt).toBe(true);
    const halts = await prisma.caseEvent.findMany({ where: { caseId, type: 'ocr.halted' } });
    expect(halts).toHaveLength(1);
    expect((halts[0].payload as { lowConfidenceShare: number }).lowConfidenceShare).toBeGreaterThan(0.3);
  });
});
