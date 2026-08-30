/**
 * M4/M5 pipeline integration tests — live Postgres, deterministic fake model
 * (the AnalysisModel interface is the injection seam; production wires
 * Gemini). Proves the grounding hard filter, the state machine drive, the
 * QA approve/reject gates, and FR-7 tamper detection end to end.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { runAnalysis, type AnalysisModel } from '../src/services/analysis.service';

const run = `ana_${Date.now()}`;
let tenantId: string;
let userId: string;
let reviewerId: string;
let caseId: string;
let clientCookie: string;
let qaCookie: string;

const CHUNK_A = `${run} THE COURT: Objection overruled. The bite mark comparison testimony will be admitted. MR. DAVIS: Note our exception.`;
const CHUNK_B = `${run} Q: Did you disclose the lab notes to the defense? A: No, we kept those in the working file.`;

// One grounded finding per screen call on chunk 0/1 alternately, plus one
// HALLUCINATED quote that appears in no chunk — the filter must drop it.
const fakeModel: AnalysisModel = {
  name: 'fake-deterministic',
  invoke: async (system: string) => {
    const isJunk = system.includes('forensic-science');
    if (!isJunk) return JSON.stringify({ findings: [] });
    return JSON.stringify({
      findings: [
        {
          category: 'junk_science',
          severity: 'dispositive',
          confidence: 0.9,
          chunkIndex: 0,
          quote: 'The bite mark comparison testimony will be admitted.',
          partA: 'The trial used bite-mark comparison, a method now widely discredited.',
          partB: 'Bite-mark comparison admitted over objection; Art. 11.073 candidate.',
        },
        {
          category: 'brady',
          severity: 'supportive',
          confidence: 0.8,
          chunkIndex: 1,
          quote: 'THIS SENTENCE APPEARS NOWHERE IN THE RECORD.',
          partA: 'hallucinated',
          partB: 'hallucinated',
        },
      ],
    });
  },
};

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: `${run}@x.com`, tenantId, role: 'CLIENT' } });
  userId = u.id;
  const r = await prisma.user.create({ data: { email: `${run}_qa@x.com`, tenantId, role: 'ATTORNEY' } });
  reviewerId = r.id;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;
  qaCookie = `next-auth.session-token=${await encodeSessionToken({ userId: reviewerId, tenantId, role: 'ATTORNEY' })}`;

  const c = await prisma.case.create({
    data: {
      title: `${run}_case`, tenantId, status: 'DOCS_COMPLETE', lane: 'TRIAL', vehicle: '11.07',
      slaStartedAt: new Date(),
      accessList: { create: { userId, role: 'ADMIN' } },
    },
  });
  caseId = c.id;
  const doc = await prisma.document.create({ data: { filename: 'rr-vol-3.pdf', caseId } });
  await prisma.documentChunk.createMany({
    data: [
      { documentId: doc.id, content: CHUNK_A, metadata: { volume: 'RR3', page: 214, line: 12 } },
      { documentId: doc.id, content: CHUNK_B, metadata: { volume: 'RR4', page: 88 } },
    ],
  });
});

afterAll(async () => {
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId } } });
  await prisma.finding.deleteMany({ where: { tenantId } });
  await prisma.report.deleteMany({ where: { tenantId } });
  await prisma.analysisRun.deleteMany({ where: { tenantId } });
  await prisma.documentChunk.deleteMany({ where: { document: { caseId } } });
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { caseId } });
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('response salvage (live-run lesson: one bad element must not void the screen)', () => {
  it('keeps free-text categories and valid siblings; drops only malformed elements', async () => {
    const { executeScreen, buildRecord } = await import('../src/services/analysis.service');
    const chunks = [{ id: 'ch1', documentId: 'd1', content: `${run} the bite mark testimony was admitted over objection`, metadata: {} }];
    const salvageModel = {
      name: 'fake-salvage',
      invoke: async () => JSON.stringify({ findings: [
        { category: 'Surrogate DNA analyst testimony / Confrontation', severity: 'supportive', confidence: 0.7,
          chunkIndex: 0, quote: 'bite mark testimony was admitted', partA: 'ok', partB: 'ok' },
        { category: 'junk_science', severity: 'NOT_A_SEVERITY', confidence: 0.7, chunkIndex: 0,
          quote: 'bite mark testimony was admitted', partA: 'bad severity', partB: 'x' },
      ]}),
    };
    const res = await executeScreen(salvageModel, 'junk_science', buildRecord(chunks), chunks);
    expect(res.grounded).toHaveLength(1);
    expect(res.grounded[0].category).toBe('Surrogate DNA analyst testimony / Confrontation');
  });
});

describe('runAnalysis (FR-6 grounding + state machine)', () => {
  it('persists grounded findings, DROPS hallucinated quotes, drives the machine to QA_REVIEW', async () => {
    const summary = await runAnalysis(caseId, tenantId, fakeModel);
    expect(summary.findingsPersisted).toBe(1);
    expect(summary.droppedUngrounded).toBe(1);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.status).toBe('QA_REVIEW');

    const finding = await prisma.finding.findFirstOrThrow({
      where: { caseId },
      include: { citations: true },
    });
    expect(finding.category).toBe('junk_science');
    expect(finding.citations[0].volume).toBe('RR3');
    expect(finding.citations[0].page).toBe(214);
    expect(finding.citations[0].excerptHash).toHaveLength(64);

    const stages = await prisma.caseEvent.findMany({
      where: { caseId, type: 'stage.entered' },
      orderBy: { id: 'asc' },
    });
    expect(stages.map((e) => (e.payload as { status: string }).status)).toEqual([
      'DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW',
    ]);
  });

  it('customer report is 404 before QA approves — nothing legal leaks pre-QA', async () => {
    const res = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie: clientCookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('QA console (US-8)', () => {
  it('CLIENTs are locked out of the QA surface', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/qa/queue', headers: { cookie: clientCookie } });
    expect(res.statusCode).toBe(403);
  });

  it('lists the case in the queue with its finding count', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/qa/queue', headers: { cookie: qaCookie } });
    expect(res.statusCode).toBe(200);
    const row = res.json().find((c: { id: string }) => c.id === caseId);
    expect(row.findingCount).toBe(1);
  });

  it('a reading-level edit flips provenance and is audit-logged', async () => {
    const finding = await prisma.finding.findFirstOrThrow({ where: { caseId } });
    const res = await fastify.inject({
      method: 'PATCH', url: `/qa/findings/${finding.id}`, headers: { cookie: qaCookie },
      payload: { partAText: 'The trial used bite-mark matching — a method science has since rejected.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().provenance).toBe('ai_human_edited');
    expect(await prisma.auditLog.count({ where: { caseId, action: 'QA_EDIT' } })).toBe(1);
  });

  it('approve snapshots the findings, transitions to READY, and audit-logs the decision', async () => {
    const res = await fastify.inject({
      method: 'POST', url: `/qa/cases/${caseId}/approve`, headers: { cookie: qaCookie },
    });
    expect(res.statusCode).toBe(200);

    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.status).toBe('READY');

    const report = await prisma.report.findFirstOrThrow({ where: { caseId } });
    const snap = report.findingsSnapshot as { findings: { partAText: string }[] };
    expect(snap.findings[0].partAText).toMatch(/science has since rejected/);
    expect(await prisma.auditLog.count({ where: { caseId, action: 'QA_DECISION' } })).toBe(1);
  });

  it('the customer report now renders, grouped, with the QA-edited text', async () => {
    const res = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie: clientCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.strongSignals).toHaveLength(1);
    expect(body.strongSignals[0].partAText).toMatch(/science has since rejected/);
    expect(body.droppedByReverification).toBe(0);
  });

  it('FR-7: tampering with a source chunk after approval drops the finding at render', async () => {
    await prisma.documentChunk.updateMany({
      where: { content: CHUNK_A },
      data: { content: `${CHUNK_A} [TAMPERED]` },
    });
    const res = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/report`, headers: { cookie: clientCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().strongSignals).toHaveLength(0);
    expect(res.json().droppedByReverification).toBe(1);
    // restore
    await prisma.documentChunk.updateMany({
      where: { content: `${CHUNK_A} [TAMPERED]` },
      data: { content: CHUNK_A },
    });
  });
});
