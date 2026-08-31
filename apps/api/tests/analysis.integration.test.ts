/**
 * M4/M5 pipeline integration tests — live Postgres, deterministic fake model
 * (the AnalysisModel interface is the injection seam; production wires
 * Gemini). Proves the grounding hard filter, the state machine drive, the
 * QA approve/reject gates, and FR-7 tamper detection end to end.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
// Pin sampling: src/index.ts dotenv-loads the root .env (ANALYSIS_SAMPLES=2);
// dotenv never overrides pre-set vars, so set before any import.
process.env.ANALYSIS_SAMPLES = '1';

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
  await prisma.documentChunk.deleteMany({ where: { document: { case: { tenantId } } } });
  await prisma.document.deleteMany({ where: { case: { tenantId } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId } } });
  await prisma.case.deleteMany({ where: { tenantId } });
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

  it('recovers complete findings from a max_tokens-truncated array (Fable comparison lesson)', async () => {
    const { executeScreen, buildRecord } = await import('../src/services/analysis.service');
    const chunks = [{ id: 'ch1', documentId: 'd1', content: `${run} the bite mark testimony was admitted over objection`, metadata: {} }];
    const mk = (quote: string) => JSON.stringify({
      category: 'junk_science', severity: 'supportive', confidence: 0.8, chunkIndex: 0,
      quote, partA: 'ok', partB: 'ok',
    });
    // Two complete DISTINCT elements (identical ones now merge in the
    // sample union), then the stream cuts off mid-third-object.
    const truncated = `{"findings":[${mk('bite mark testimony')},${mk('admitted over objection')},{"category":"iac","severity":"suppo`;
    const truncModel = { name: 'fake-truncated', invoke: async () => truncated };
    const res = await executeScreen(truncModel, 'junk_science', buildRecord(chunks), chunks);
    expect(res.grounded).toHaveLength(2);
  });

  it('escapes raw control characters inside quote strings (Brian record lesson)', async () => {
    const { executeScreen, buildRecord } = await import('../src/services/analysis.service');
    const content = `${run} THE COURT: Overruled.\nMR. SMITH: Note our exception.`;
    const chunks = [{ id: 'ch1', documentId: 'd1', content, metadata: {} }];
    // The model copies the transcript line break verbatim INSIDE the JSON
    // string — invalid JSON that must parse after the escape pass, and the
    // restored newline must still ground against the chunk.
    const rawWithNewline =
      '{"findings":[{"category":"preserved_error","severity":"supportive","confidence":0.7,' +
      '"chunkIndex":0,"quote":"THE COURT: Overruled.\nMR. SMITH: Note our exception.",' +
      '"partA":"ok","partB":"ok"}]}';
    const ctrlModel = { name: 'fake-ctrl', invoke: async () => rawWithNewline };
    const res = await executeScreen(ctrlModel, 'junk_science', buildRecord(chunks), chunks);
    expect(res.grounded).toHaveLength(1);
    expect(res.grounded[0].quote).toContain('\nMR. SMITH');
  });

  it('grounds a naturally-joined quote against line-broken transcript text (Willetts lesson)', async () => {
    const { executeScreen, buildRecord } = await import('../src/services/analysis.service');
    // The transcript breaks the sentence across lines with tabs; the model
    // quotes it joined with single spaces. Normalized matching must ground
    // it — while a fabricated quote must still be dropped.
    const content = `${run} JUROR WILLETTS: My husband is his corporal\nat Clute.\tI have never personally met him`;
    const chunks = [{ id: 'ch1', documentId: 'd1', content, metadata: {} }];
    const model = {
      name: 'fake-joined',
      invoke: async () => JSON.stringify({ findings: [
        { category: 'juror_bias', severity: 'supportive', confidence: 0.8, chunkIndex: 0,
          quote: 'My husband is his corporal at Clute. I have never personally met him', partA: 'ok', partB: 'ok' },
        { category: 'juror_bias', severity: 'supportive', confidence: 0.8, chunkIndex: 0,
          quote: 'ENTIRELY FABRICATED QUOTE', partA: 'x', partB: 'x' },
      ]}),
    };
    const res = await executeScreen(model, 'voir_dire', buildRecord(chunks), chunks);
    expect(res.grounded).toHaveLength(1);
    expect(res.dropped).toBe(1);
  });

  it('context pre-pass: header is prepended to screens; JSON-shaped context is rejected', async () => {
    const { buildContextHeader, executeScreen, buildRecord } = await import('../src/services/analysis.service');
    const chunks = [{ id: 'ch1', documentId: 'd1', content: `${run} some record text here`, metadata: {} }];
    const seen: string[] = [];
    const model = {
      name: 'fake-context',
      invoke: async (system: string) => {
        seen.push(system);
        if (system.includes('CASE CONTEXT')) return 'CASE CONTEXT: victim is Deputy Harper.';
        return JSON.stringify({ findings: [] });
      },
    };
    const header = await buildContextHeader(model, buildRecord(chunks));
    expect(header).toBe('CASE CONTEXT: victim is Deputy Harper.');
    await executeScreen(model, 'voir_dire', buildRecord(chunks), chunks, header);
    expect(seen[seen.length - 1].startsWith('CASE CONTEXT: victim is Deputy Harper.')).toBe(true);
    // A model that answers the pre-pass with JSON must yield an empty header.
    const jsonModel = { name: 'fake-json', invoke: async () => '{"findings":[]}' };
    expect(await buildContextHeader(jsonModel, 'x')).toBe('');
  });

  it('buildRecord labels excerpts with volume file and page', async () => {
    const { buildRecord } = await import('../src/services/analysis.service');
    const rec = buildRecord([
      { id: 'a', documentId: 'd', content: 'text one', metadata: { filename: 'RR-Vol002.pdf', page: 30 } },
      { id: 'b', documentId: 'd', content: 'text two', metadata: {} },
    ]);
    expect(rec).toContain('[Excerpt 0 | RR-Vol002.pdf p.30] text one');
    expect(rec).toContain('[Excerpt 1] text two');
  });

  it('anchors: principal-name × juror cross-reference and keyword classes', async () => {
    const { buildAnchors } = await import('../src/services/analysis.service');
    const chunks = [
      { id: 'a', documentId: 'd', content: 'JUROR WILLETTS: My husband is Harper his corporal', metadata: {} },
      { id: 'b', documentId: 'd', content: 'plain testimony about the truck', metadata: {} },
      { id: 'c', documentId: 'd', content: 'THE COURT: sentences shall run consecutive to Count I', metadata: {} },
    ];
    const vd = buildAnchors('voir_dire', chunks, 'CASE CONTEXT: the victim is Deputy Brian Harper.');
    expect(vd).toContain('0');
    expect(vd).not.toContain('1,');
    const sent = buildAnchors('sentencing', chunks, '');
    expect(sent).toContain('2');
  });

  it('self-consistency union: overlapping quotes dedup keeping the more severe copy', async () => {
    const { executeScreen, buildRecord } = await import('../src/services/analysis.service');
    const chunks = [{ id: 'ch1', documentId: 'd1', content: `${run} the court ordered the sentences to run consecutively over objection`, metadata: {} }];
    let call = 0;
    const model = {
      name: 'fake-sampler',
      invoke: async () => {
        call++;
        const quote = call === 1 ? 'sentences to run consecutively' : 'the sentences to run consecutively over objection';
        const severity = call === 1 ? 'supportive' : 'dispositive';
        return JSON.stringify({ findings: [
          { category: 'sentencing', severity, confidence: 0.6, chunkIndex: 0, quote, partA: 'a', partB: 'b' },
        ]});
      },
    };
    const res = await executeScreen(model, 'sentencing', buildRecord(chunks), chunks, '', 2);
    expect(call).toBe(2);
    expect(res.grounded).toHaveLength(1);
    expect(res.grounded[0].severity).toBe('dispositive');
  });
});

describe('batch path (invokeMany seam)', () => {
  it('runs all screens through invokeMany and persists identically', async () => {
    const c2 = await prisma.case.create({
      data: {
        title: `${run}_batch`, tenantId, status: 'DOCS_COMPLETE', lane: 'TRIAL', vehicle: '11.07',
        slaStartedAt: new Date(), accessList: { create: { userId, role: 'ADMIN' } },
      },
    });
    const doc2 = await prisma.document.create({ data: { filename: 'rr-batch.pdf', caseId: c2.id } });
    const chunk = await prisma.documentChunk.create({
      data: { documentId: doc2.id, content: CHUNK_A, metadata: { volume: 'RR3', page: 214 } },
    });

    const seenKeys: string[] = [];
    const batchModel: AnalysisModel = {
      name: 'fake-batch',
      invoke: async () => 'CASE CONTEXT: test case.', // context pre-pass only
      invokeMany: async (requests) => {
        const out = new Map<string, string>();
        for (const r of requests) {
          seenKeys.push(r.key);
          out.set(
            r.key,
            r.key.startsWith('junk_science')
              ? JSON.stringify({ findings: [{
                  category: 'junk_science', severity: 'dispositive', confidence: 0.9, chunkIndex: 0,
                  quote: 'The bite mark comparison testimony will be admitted.', partA: 'a', partB: 'b',
                }]})
              : '{"findings":[]}'
          );
        }
        return out;
      },
    };

    const summary = await runAnalysis(c2.id, tenantId, batchModel);
    // TRIAL lane × ANALYSIS_SAMPLES=1 → one request per screen, all via the batch seam.
    expect(seenKeys.length).toBe(5);
    expect(seenKeys).toContain('voir_dire__0');
    expect(summary.findingsPersisted).toBe(1);
    const f = await prisma.finding.findFirstOrThrow({ where: { caseId: c2.id }, include: { citations: true } });
    expect(f.citations[0].chunkId).toBe(chunk.id);
    expect((await prisma.case.findUniqueOrThrow({ where: { id: c2.id } })).status).toBe('QA_REVIEW');
  });
});

describe('multi-engine union', () => {
  it('unions engines into one QA set, tags engine, counts cross-engine agreements', async () => {
    const c3 = await prisma.case.create({
      data: {
        title: `${run}_union`, tenantId, status: 'DOCS_COMPLETE', lane: 'TRIAL', vehicle: '11.07',
        slaStartedAt: new Date(), accessList: { create: { userId, role: 'ADMIN' } },
      },
    });
    const doc3 = await prisma.document.create({ data: { filename: 'rr-union.pdf', caseId: c3.id } });
    await prisma.documentChunk.createMany({
      data: [
        { documentId: doc3.id, content: CHUNK_A, metadata: { page: 1 } },
        { documentId: doc3.id, content: CHUNK_B, metadata: { page: 2 } },
      ],
    });

    const mk = (name: string, findings: object[]): AnalysisModel => ({
      name,
      invoke: async (system: string) =>
        system.includes('forensic-science') ? JSON.stringify({ findings }) : '{"findings":[]}',
    });
    // Engine A and B agree on the bite-mark passage (same chunk, engine B's
    // quote contains engine A's); engine B alone finds the working-file one.
    const engineA = mk('engine-a', [{
      category: 'junk_science', severity: 'supportive', confidence: 0.7, chunkIndex: 0,
      quote: 'bite mark comparison testimony', partA: 'a', partB: 'a',
    }]);
    const engineB = mk('engine-b', [
      { category: 'junk_science', severity: 'dispositive', confidence: 0.9, chunkIndex: 0,
        quote: 'The bite mark comparison testimony will be admitted.', partA: 'b', partB: 'b' },
      { category: 'brady', severity: 'supportive', confidence: 0.6, chunkIndex: 1,
        quote: 'we kept those in the working file', partA: 'b2', partB: 'b2' },
    ]);

    const summary = await runAnalysis(c3.id, tenantId, [engineA, engineB]);
    expect(summary.findingsPersisted).toBe(2); // union: merged agreement + engine-B-only

    const fnds = await prisma.finding.findMany({ where: { caseId: c3.id } });
    const junk = fnds.find((f) => f.category === 'junk_science');
    expect(junk?.severity).toBe('dispositive'); // merge kept the more severe copy
    expect(junk?.engine).toBe('engine-b');
    expect(fnds.find((f) => f.category === 'brady')?.engine).toBe('engine-b');

    const adj = await prisma.caseEvent.findFirstOrThrow({
      where: { caseId: c3.id, type: 'adjudication.completed' },
    });
    expect((adj.payload as { agreements: number }).agreements).toBe(1);
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

  it('report PDF: renders the same verified payload as a well-formed PDF', async () => {
    const res = await fastify.inject({
      method: 'GET', url: `/cases/${caseId}/report/pdf`, headers: { cookie: clientCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.rawPayload.length).toBeGreaterThan(2000);
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
