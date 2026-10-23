/**
 * UPL review 2026-10-23, findings E2/E3 (recommendations 5 and 11): the
 * sealed attorney packet and the advice-language lint — live Postgres.
 *
 * U3-a  flag off → the family payload carries none of the five attorney
 *       fields and the family PDF has no attorney block; the attorney packet
 *       PDF carries them with the statutory statement. Flag on → the payload
 *       shape is byte-for-byte what it was before the split (inline snapshot
 *       generated from a fixture run on the pre-change code).
 * U3-b  the share-link JSON carries the same sections the packet renders.
 * U3-c  a Part A that advises is flagged on the finding and holds the case in
 *       QA_REVIEW with AUTO_APPROVE=1.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.ANALYSIS_SAMPLES = '1';

import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setFlag, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { NOT_A_LAW_FIRM } from '@hg/case-lifecycle';
import { runAnalysis, type AnalysisModel } from '../src/services/analysis.service';
import { autoApproveCase } from '../src/services/auto-qa.service';

// Each PDF test renders and parses two or three documents; under the full
// suite's load that outruns vitest's 5 s default.
vi.setConfig({ testTimeout: 60_000 });

const run = `u3_${Date.now()}`;
let tenantId: string;
let userId: string;
let caseId: string;
let cookie: string;

const CHUNK_A = `${run} THE COURT: Objection overruled. The bite mark comparison testimony will be admitted. MR. DAVIS: Note our exception.`;
const CHUNK_B = `${run} THE COURT: The fine of $10,000 is assessed in addition to the life sentence.`;

/** The structural shape of a JSON value: sorted keys, element shapes, primitive types. */
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length && v.every((x) => x === null || typeof x !== 'object') ? `${[...new Set(v.map((x) => (x === null ? 'null' : typeof x)))].join('|')}[]` : v.map(shape);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  }
  return v === null ? 'null' : typeof v;
}

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  cookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'READY', lane: 'TRIAL', vehicle: '11.07', county: 'Harris', convictionYear: 2019,
      slaStartedAt: new Date(),
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
  const r = await prisma.analysisRun.create({ data: { caseId, tenantId, runNo: 1, modelConfig: {}, completedAt: new Date() } });
  const doc = await prisma.document.create({ data: { filename: 'rr-vol-3.pdf', caseId } });
  const [chunkA, chunkB] = await Promise.all([
    prisma.documentChunk.create({ data: { documentId: doc.id, content: CHUNK_A, metadata: { volume: 'RR3', page: 214, line: 12 } } }),
    prisma.documentChunk.create({ data: { documentId: doc.id, content: CHUNK_B, metadata: { volume: 'RR9', page: 40 } } }),
  ]);
  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const strong = await prisma.finding.create({
    data: {
      runId: r.id, caseId, tenantId, stableKey: `${run}_strong`, category: 'sentencing', severity: 'dispositive', confidence: 0.9,
      screen: 'sentencing', preserved: 'unknown', harmStandard: 'none', vehicle: 'either',
      develop: 'Obtain the judgment and sentence for each count.',
      partAText: 'The record shows a fine was added to a life sentence.',
      partBText: 'Fine assessed alongside a life sentence; compare the judgment against the punishment range.',
      citations: { create: { documentId: doc.id, chunkId: chunkB.id, volume: 'RR9', page: 40, excerpt: 'The fine of $10,000 is assessed in addition to the life sentence.', excerptHash: sha(CHUNK_B) } },
    },
    include: { citations: true },
  });
  const possible = await prisma.finding.create({
    data: {
      runId: r.id, caseId, tenantId, stableKey: `${run}_possible`, category: 'junk_science', severity: 'supportive', confidence: 0.7,
      screen: 'junk_science', preserved: 'yes', harmStandard: 'constitutional', vehicle: 'direct_appeal',
      develop: 'Obtain the bite-mark analyst\'s report and qualifications.', dependsOn: ['Volume 6 exhibits'],
      partAText: 'The record shows bite-mark comparison testimony was admitted over an objection.',
      partBText: 'Bite-mark comparison admitted over objection; preserved under TRAP 33.1.',
      citations: { create: { documentId: doc.id, chunkId: chunkA.id, volume: 'RR3', page: 214, line: 12, excerpt: 'The bite mark comparison testimony will be admitted.', excerptHash: sha(CHUNK_A) } },
    },
    include: { citations: true },
  });
  // The snapshot exactly as the QA approve path writes it.
  await prisma.report.create({
    data: {
      caseId, tenantId, runId: r.id, versionNo: 1, templateVersion: 'AB-v2', approvedBy: 'qa',
      findingsSnapshot: {
        findings: [strong, possible].map((f) => ({
          id: f.id, category: f.category, severity: f.severity, confidence: f.confidence, provenance: f.provenance,
          partAText: f.partAText, partBText: f.partBText,
          preserved: f.preserved ?? undefined, harmStandard: f.harmStandard ?? undefined, vehicle: f.vehicle ?? undefined,
          develop: f.develop ?? undefined, dependsOn: f.dependsOn ?? [],
          citations: f.citations.map((c) => ({ volume: c.volume, page: c.page, line: c.line, excerpt: c.excerpt })),
        })),
      },
    },
  });
});

/** Text of a PDF through the same parser the site-reference test uses (pdfkit compresses page streams). */
async function pdfTextOf(buf: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  return (await parser.getText()).text.replace(/\s+/g, ' ');
}

const flag = async (on: boolean) => {
  await setFlag('family_part_b', on, 'u3-test');
  __invalidateFlagCache();
};

const ATTORNEY_FIELDS = ['partBText', 'preserved', 'harmStandard', 'vehicle', 'develop'];

afterAll(async () => {
  await flag(false);
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId } } });
  await prisma.finding.deleteMany({ where: { tenantId } });
  await prisma.report.deleteMany({ where: { tenantId } });
  await prisma.analysisRun.deleteMany({ where: { tenantId } });
  await prisma.documentChunk.deleteMany({ where: { document: { case: { tenantId } } } });
  await prisma.document.deleteMany({ where: { case: { tenantId } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('U3-a — the family report with Part B inline (flag on: today\'s shape)', () => {
  it('the payload shape is exactly the pre-split shape', async () => {
    await flag(true);
    const res = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The attorney fields are present and equal to the rows.
    const rows = await prisma.finding.findMany({ where: { caseId } });
    for (const f of [...body.strongSignals, ...body.possibleIssues]) {
      const row = rows.find((r) => r.id === f.id)!;
      expect(f.partBText).toBe(row.partBText);
      expect(f.preserved).toBe(row.preserved);
      expect(f.develop).toBe(row.develop);
    }
    expect(shape(body)).toMatchInlineSnapshot(`
      {
        "bottomLine": {
          "body": "string[]",
          "forLawyer": "string",
          "headline": "string",
          "tier": "string",
        },
        "caseSummary": [
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "string",
            "value": "string",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "string",
            "value": "string",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
          {
            "key": "string",
            "label": "string",
            "source": "null",
            "value": "null",
          },
        ],
        "deadlinePosture": "null",
        "droppedByReverification": "number",
        "newEvidence": "null",
        "possibleIssues": [
          {
            "category": "string",
            "citations": [
              {
                "excerpt": "string",
                "line": "number",
                "page": "number",
                "volume": "string",
              },
            ],
            "confidence": "number",
            "dependsOn": "string[]",
            "develop": "string",
            "harmStandard": "string",
            "id": "string",
            "partAText": "string",
            "partBText": "string",
            "preserved": "string",
            "provenance": "string",
            "severity": "string",
            "vehicle": "string",
          },
        ],
        "renderedAt": "string",
        "rerunPriceCents": "number",
        "strongSignals": [
          {
            "category": "string",
            "citations": [
              {
                "excerpt": "string",
                "line": "null",
                "page": "number",
                "volume": "string",
              },
            ],
            "confidence": "number",
            "dependsOn": [],
            "develop": "string",
            "harmStandard": "string",
            "id": "string",
            "partAText": "string",
            "partBText": "string",
            "preserved": "string",
            "provenance": "string",
            "severity": "string",
            "vehicle": "string",
          },
        ],
        "subsequentWritMode": "boolean",
        "summaryGap": {
          "documents": [],
          "labels": "string[]",
        },
        "templateVersion": "string",
        "versionNo": "number",
      }
    `);
  });
});

describe('U3-a — the family report with Part B sealed (flag off: the default)', () => {
  it('the payload has none of the five attorney fields; everything else is unchanged', async () => {
    await flag(true);
    const on = (await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie } })).json();
    await flag(false);
    const res = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const off = res.json();
    const all = [...off.strongSignals, ...off.possibleIssues];
    expect(all).toHaveLength(2);
    for (const f of all) for (const k of ATTORNEY_FIELDS) expect(f, k).not.toHaveProperty(k);
    expect(JSON.stringify(off)).not.toContain('Fine assessed alongside a life sentence');
    // Part A, the citations, the weight inputs and the family-actionable gap stay.
    expect(all.map((f) => f.partAText).sort()).toEqual(['The record shows a fine was added to a life sentence.', 'The record shows bite-mark comparison testimony was admitted over an objection.']);
    expect(off.possibleIssues[0].dependsOn).toEqual(['Volume 6 exhibits']);
    expect(off.possibleIssues[0].confidence).toBe(0.7);
    // Off is exactly on minus the five fields, finding by finding.
    const strip = (f: Record<string, unknown>) => Object.fromEntries(Object.entries(f).filter(([k]) => !ATTORNEY_FIELDS.includes(k)));
    expect({ ...off, renderedAt: 'x' }).toEqual({ ...on, renderedAt: 'x', strongSignals: on.strongSignals.map(strip), possibleIssues: on.possibleIssues.map(strip) });
  });

  it('the family PDF has no attorney block and prints "For your lawyer"; with the flag on it has both', async () => {
    await flag(false);
    const off = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report/pdf`, headers: { cookie } });
    expect(off.statusCode).toBe(200);
    expect(off.headers['content-type']).toContain('application/pdf');
    const offText = await pdfTextOf(off.rawPayload);
    expect(offText).not.toContain('For an attorney');
    expect(offText).not.toContain('To develop');
    expect(offText).not.toContain('issues by priority');
    expect(offText).not.toContain('Investigation checklist');
    expect(offText).not.toContain('Fine assessed alongside a life sentence');
    expect(offText).toContain('For your lawyer');
    expect(offText).toContain('Para su abogado');
    expect(offText).toContain('The record shows a fine was added to a life sentence.');

    await flag(true);
    const onText = await pdfTextOf((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/report/pdf`, headers: { cookie } })).rawPayload);
    expect(onText).toContain('For an attorney');
    expect(onText).toContain('To develop');
    expect(onText).toContain('issues by priority');
    expect(onText).toContain('Investigation checklist');
    expect(onText).not.toContain('Para su abogado');
    await flag(false);
  });

  it('attorney-packet.pdf carries the attorney content, the cover line and the statutory statement, whatever the flag says', async () => {
    for (const on of [false, true]) {
      await flag(on);
      const res = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/attorney-packet.pdf`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`snot-nose-legal-attorney-packet-${caseId}.pdf`);
      const text = await pdfTextOf(res.rawPayload);
      expect(text).toContain('Attorney packet');
      expect(text).toContain('For the attorney. Prepared for the family to hand to licensed counsel; information about a court record, not legal advice.');
      expect(text).toContain(NOT_A_LAW_FIRM);
      expect(text).toContain('For an attorney');
      expect(text).toContain('Fine assessed alongside a life sentence');
      expect(text).toContain('To develop: Obtain the judgment and sentence for each count.');
      expect(text).toContain('issues by priority');
      expect(text).toContain('Investigation checklist');
      expect(text).not.toContain('For your family (plain English)');
    }
    await flag(false);
    // Someone without access to the case cannot fetch it; an unknown version is 404.
    const other = await prisma.user.create({ data: { email: `${run}_other@x.com`, tenantId, role: 'CLIENT' } });
    const otherCookie = `next-auth.session-token=${await encodeSessionToken({ userId: other.id, tenantId, role: 'CLIENT' })}`;
    expect((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/attorney-packet.pdf`, headers: { cookie: otherCookie } })).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/attorney-packet.pdf?version=9`, headers: { cookie } })).statusCode).toBe(404);
  });
});

describe('U3-b — the share link serves the attorney packet\'s sections', () => {
  it('GET /shared/:token sections equal the renderer\'s, and the packet PDF prints each of them', async () => {
    const made = await fastify.inject({ method: 'POST', url: `/cases/${caseId}/share-link`, headers: { cookie } });
    expect(made.statusCode).toBe(200);
    const shared = await fastify.inject({ method: 'GET', url: `/shared/${made.json().token}` });
    expect(shared.statusCode).toBe(200);
    const body = shared.json();
    expect(body.notice).toMatch(/does not itself create an attorney-client relationship/);
    expect(body.notice).not.toMatch(/approved by a trained reviewer/);
    const ids = body.sections.map((s: { id: string }) => s.id);
    expect(ids).toEqual(['cover', 'case_summary', 'posture', 'part_b', 'priority', 'checklist']); // no deadline facts → no time_computation
    const cover = body.sections[0];
    expect(cover.statement).toBe(NOT_A_LAW_FIRM);
    expect(cover.coverLine.en).toMatch(/^For the attorney\./);
    const partB = body.sections.find((s: { id: string }) => s.id === 'part_b');
    expect(partB.findings.map((f: { partBText: string }) => f.partBText).sort()).toEqual([
      'Bite-mark comparison admitted over objection; preserved under TRAP 33.1.',
      'Fine assessed alongside a life sentence; compare the judgment against the punishment range.',
    ]);
    // The same input, rendered: every section's content is in the PDF the family downloads.
    const pdf = await pdfTextOf((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/attorney-packet.pdf`, headers: { cookie } })).rawPayload);
    for (const f of partB.findings) {
      expect(pdf).toContain(f.partBText);
      if (f.develop) expect(pdf).toContain(`To develop: ${f.develop}`);
    }
    const checklist = body.sections.find((s: { id: string }) => s.id === 'checklist');
    for (const item of checklist.items) expect(pdf).toContain(item);
    const priority = body.sections.find((s: { id: string }) => s.id === 'priority');
    expect(priority.items.map((i: { category: string }) => i.category)).toEqual(['sentencing', 'junk_science']);
    expect(pdf).toContain(body.sections.find((s: { id: string }) => s.id === 'posture').line);
    // The flat fields older callers read are still there.
    expect(body.findings).toHaveLength(2);
    expect(body.caseSummary.length).toBeGreaterThan(0);
  });
});

describe('U3-c — a Part A that advises holds the case', () => {
  it('fake model says "You should file a writ" → finding flagged, case stays QA_REVIEW with AUTO_APPROVE=1', async () => {
    const c = await prisma.case.create({
      data: {
        title: `${run}_advice`, tenantId, status: 'DOCS_COMPLETE', lane: 'TRIAL', vehicle: '11.07', slaStartedAt: new Date(),
        accessList: { create: { userId, role: 'ADMIN' } },
      },
    });
    const doc = await prisma.document.create({ data: { filename: 'rr-vol-9.pdf', caseId: c.id } });
    await prisma.documentChunk.create({ data: { documentId: doc.id, content: CHUNK_B, metadata: { volume: 'RR9', page: 40 } } });
    const advising: AnalysisModel = {
      name: 'fake-advising',
      invoke: async (system: string) => {
        if (system.includes('case summary for the top of a report')) return JSON.stringify({});
        if (!system.includes('sentencing')) return JSON.stringify({ findings: [] });
        return JSON.stringify({ findings: [{
          category: 'sentencing', severity: 'dispositive', confidence: 0.9, chunkIndex: 0,
          quote: 'The fine of $10,000 is assessed in addition to the life sentence.',
          partA: 'You should file a writ: a fine was added to a life sentence.',
          partB: 'Fine assessed alongside a life sentence; compare the judgment against the punishment range.',
        }] });
      },
    };
    const summary = await runAnalysis(c.id, tenantId, advising);
    expect(summary.findingsPersisted).toBeGreaterThan(0);
    const finding = await prisma.finding.findFirstOrThrow({ where: { caseId: c.id } });
    const flags = finding.lintFlags as { adviceLintHit: boolean; partA: { phrase: string }[]; partB: unknown[] };
    expect(flags.adviceLintHit).toBe(true);
    expect(flags.partA.map((h) => h.phrase)).toEqual(['should', 'file a']);
    expect(flags.partB).toEqual([]);

    process.env.AUTO_APPROVE = '1';
    try {
      const res = await autoApproveCase(c.id, tenantId, { ...summary, screensExpected: summary.screensRun });
      expect(res.outcome).toBe('held');
      expect(res.reasons?.join()).toContain('advice wording in 1 finding(s)');
      expect((await prisma.case.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('QA_REVIEW');
      expect(await prisma.report.count({ where: { caseId: c.id } })).toBe(0);

      // A reviewer rewrites Part A as a description → the gate clears (linted live, not from the stored flags).
      await prisma.finding.update({ where: { id: finding.id }, data: { partAText: 'The judgment lists a fine alongside a life sentence.' } });
      const again = await autoApproveCase(c.id, tenantId, { ...summary, screensExpected: summary.screensRun });
      expect(again.outcome).toBe('approved');
    } finally {
      delete process.env.AUTO_APPROVE;
    }
  });
});
