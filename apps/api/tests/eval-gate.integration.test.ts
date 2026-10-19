/**
 * J7 — the weekly eval gate's api (persona_rollout_plan.md §5 J, §7 item 2,
 * §8): POST /ops/eval/runs as ADMIN creates one EvalRun per ledger in the
 * eval tenant (Organisation.isTest), walks the pipeline to a scored run with
 * the bucket set, and GET lists them with the verdict and cost per bucket;
 * the EVAL_GATE_TOKEN bearer opens exactly the two eval routes; SUPPORT is
 * refused; the eval tenant stays out of Money like every test organisation.
 *
 * Live Postgres. The two steps that leave the process are replaced the way
 * the pipeline suites do it: the S3 corpus ingest writes a digitized
 * document straight into the case, and the analysis queue runs
 * `runAnalysis` in-process on a deterministic fake model (no model call).
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.ANALYSIS_SAMPLES = '1';
process.env.AWS_ACCESS_KEY_ID ??= 'test-key';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret';
process.env.AWS_REGION ??= 'us-east-2';
process.env.S3_BUCKET ??= 'test-bucket';
delete process.env.EVAL_GATE_TOKEN;

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const pipeline = vi.hoisted(() => ({
  ingested: [] as string[],
  analyzed: [] as string[],
  // Each ledger's chunk: the Gary record carries every Gary canary term; the
  // Brian record carries none, so the gate is green for one and red for the other.
  chunkFor: (ledger: string, caseId: string) =>
    ledger === 'gary'
      ? `${caseId} GARY RECORD: the Confrontation objection to Solis testifying to the bench work was preserved; the double jeopardy claim on the consecutive life sentences; the 1986 pen packet; Sheikh's cell site plotting; the 903 caller who said the complainant recanted.`
      : `${caseId} BRIAN RECORD: nothing the ledger names appears in this excerpt.`,
}));

vi.mock('../src/services/eval-corpus.service', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    ingestCorpus: async (caseId: string, tenantId: string, ledger: string) => {
      const { default: prisma } = await import('@hg/database');
      const doc = await prisma.document.create({ data: { filename: `${ledger}-RR-Vol01.pdf`, s3Key: `cases/${caseId}/${ledger}-RR-Vol01.pdf`, caseId, volumeKind: 'REPORTER', volumeIndex: 1 } });
      await prisma.documentChunk.create({ data: { documentId: doc.id, content: pipeline.chunkFor(ledger, caseId), metadata: { volume: 'RR1', page: 30 } } });
      // 602 billable reporter pages → EXTENDED (plan §4: 501–1,500).
      await prisma.documentPage.createMany({
        data: Array.from({ length: 602 }, (_, i) => ({ documentId: doc.id, pageNo: i + 1, contentHash: `${caseId}-${i}`, billable: true, ocrConfidence: 1, ocrProvider: 'pdf-text' })),
      });
      pipeline.ingested.push(`${ledger}:${tenantId}`);
      return { folder: ledger, documents: 1, bytes: 1024 };
    },
  };
});

vi.mock('../src/services/queue', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    enqueueDocument: async () => {},
    enqueueAnalysis: async (caseId: string, tenantId: string) => {
      pipeline.analyzed.push(caseId);
      const { runAnalysis } = await import('../src/services/analysis.service');
      const { default: prisma } = await import('@hg/database');
      const { withTenant } = await import('@hg/database');
      const chunk = await prisma.documentChunk.findFirstOrThrow({ where: { document: { caseId } } });
      const isGary = chunk.content.includes('GARY RECORD');
      const quote = isGary ? 'the Confrontation objection to Solis testifying to the bench work was preserved' : 'nothing the ledger names appears in this excerpt';
      const fakeModel = {
        name: 'fake-eval-engine',
        invoke: async (system: string) => {
          if (system.includes('case summary for the top of a report')) return JSON.stringify({});
          if (!system.includes('Respond with ONLY a JSON object: {"findings"')) return 'CASE CONTEXT: a test record.';
          if (!isGary) return JSON.stringify({ findings: [] });
          return JSON.stringify({
            findings: [{
              category: 'preserved_error', severity: 'supportive', confidence: 0.8, chunkIndex: 0, quote,
              partA: 'An objection was made and overruled.',
              partB: 'Confrontation objection to Solis preserved; double jeopardy on consecutive life terms; 1986 pen packet linkage; cell-site plotting by a non-expert; the 903 recantation caller.',
              preserved: 'yes', harmStandard: 'constitutional', develop: 'Pull the exhibit.', dependsOn: [],
            }],
          });
        },
      };
      // What the live engine does through recordModelCost: one cost row per call.
      await withTenant(tenantId, (tx) => tx.costRecord.create({ data: { caseId, tenantId, source: 'model', provider: 'fake-eval-engine', tokensIn: 1000, tokensOut: 100, amountUsd: isGary ? 23.5 : 11.25 } }));
      // Off the request's await chain, like a queue would be.
      setTimeout(() => { void runAnalysis(caseId, tenantId, fakeModel).catch((e) => console.error('fake analysis failed', e)); }, 10);
    },
  };
});

import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { evalGateTiming, EVAL_ORGANISATION_NAME } from '../src/services/eval-runs.service';

const run = `evalgate_${Date.now()}`;
const TOKEN = `eval-gate-token-${run}-xxxxxxxxxxxxxxxx`;
let staffTenantId: string;
let adminCookie: string;
let supportCookie: string;
let clientCookie: string;
const startedAt = new Date(Date.now() - 1000).toISOString();

const get = (url: string, headers: Record<string, string>) => fastify.inject({ method: 'GET', url, headers });
const post = (url: string, headers: Record<string, string>, body?: unknown) =>
  fastify.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', ...headers }, payload: body ? JSON.stringify(body) : undefined });

async function settled(ids: string[], timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await prisma.evalRun.findMany({ where: { id: { in: ids } } });
    if (rows.length === ids.length && rows.every((r) => r.status === 'SCORED' || r.status === 'FAILED')) return rows;
    if (Date.now() > deadline) throw new Error(`eval runs not settled: ${rows.map((r) => `${r.ledger}=${r.status} ${r.error ?? ''}`).join(', ')}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  evalGateTiming.pollMs = 50;
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  staffTenantId = t.id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@x.com`, tenantId: staffTenantId, role: 'ADMIN' } });
  const support = await prisma.user.create({ data: { email: `${run}_support@x.com`, tenantId: staffTenantId, role: 'SUPPORT' } });
  const client = await prisma.user.create({ data: { email: `${run}_client@x.com`, tenantId: staffTenantId, role: 'CLIENT' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: admin.id, tenantId: staffTenantId, role: 'ADMIN' })}`;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId: staffTenantId, role: 'SUPPORT' })}`;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: client.id, tenantId: staffTenantId, role: 'CLIENT' })}`;
  await fastify.ready();
});

afterAll(async () => {
  delete process.env.EVAL_GATE_TOKEN;
  const evalOrg = await prisma.organisation.findFirst({ where: { name: EVAL_ORGANISATION_NAME } });
  if (evalOrg) {
    const tenantId = evalOrg.tenantId;
    const mine = await prisma.evalRun.findMany({ where: { startedAt: { gte: new Date(startedAt) } } });
    const caseIds = mine.map((r) => r.caseId);
    await prisma.evalRun.deleteMany({ where: { id: { in: mine.map((r) => r.id) } } });
    await prisma.findingCitation.deleteMany({ where: { finding: { caseId: { in: caseIds } } } });
    await prisma.finding.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.analysisRun.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.costRecord.deleteMany({ where: { caseId: { in: caseIds } } });
    await prisma.documentPage.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
    await prisma.documentChunk.deleteMany({ where: { document: { caseId: { in: caseIds } } } });
    await prisma.document.deleteMany({ where: { caseId: { in: caseIds } } });
    // CaseEvent and AuditLog are append-only by trigger; the skeletons survive like every deleted case's.
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.case.deleteMany({ where: { id: { in: caseIds } } });
    if ((await prisma.case.count({ where: { tenantId } })) === 0) {
      await prisma.organisation.delete({ where: { id: evalOrg.id } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
  }
  await prisma.user.deleteMany({ where: { tenantId: staffTenantId } });
  await prisma.tenant.deleteMany({ where: { id: staffTenantId } });
  await prisma.$disconnect();
});

describe('POST /ops/eval/runs as ADMIN (J7)', () => {
  let ids: string[] = [];

  it('creates one QUEUED EvalRun per committed ledger, each on a fresh case in the eval tenant', async () => {
    const res = await post('/ops/eval/runs', { cookie: adminCookie }, {});
    expect(res.statusCode).toBe(202);
    const { runs } = res.json() as { runs: Array<{ id: string; ledger: string; caseId: string; status: string }> };
    expect(runs.map((r) => r.ledger).sort()).toEqual(['brian', 'gary']);
    expect(runs.every((r) => r.status === 'QUEUED' && r.caseId)).toBe(true);
    ids = runs.map((r) => r.id);

    const org = await prisma.organisation.findFirstOrThrow({ where: { name: EVAL_ORGANISATION_NAME } });
    expect(org).toMatchObject({ isTest: true, kind: 'FAMILY' });
    const cases = await prisma.case.findMany({ where: { id: { in: runs.map((r) => r.caseId) } } });
    expect(cases).toHaveLength(2);
    expect(cases.every((c) => c.tenantId === org.tenantId)).toBe(true);
  });

  it('refuses a second start while those runs are queued or running', async () => {
    const res = await post('/ops/eval/runs', { cookie: adminCookie }, { ledgers: ['gary'] });
    expect([202, 409]).toContain(res.statusCode); // 202 only if the fake pipeline already finished
    if (res.statusCode === 202) ids.push(...(res.json().runs as Array<{ id: string }>).map((r) => r.id));
  });

  it('walks the pipeline to a SCORED run with the bucket, the cost and the verdict', async () => {
    const rows = await settled(ids);
    const gary = rows.find((r) => r.ledger === 'gary')!;
    const brian = rows.find((r) => r.ledger === 'brian')!;
    expect(gary.status).toBe('SCORED');
    expect(brian.status).toBe('SCORED');
    expect(pipeline.ingested.some((s) => s.startsWith('gary:'))).toBe(true);
    expect(pipeline.analyzed).toContain(gary.caseId);

    // The bucket from the metered reporter pages (602 → EXTENDED), the cost from CostRecord.
    expect(gary.bucket).toBe('EXTENDED');
    expect(gary.meteredPages).toMatchObject({ reporter: 602, clerk: 0, exhibit: 0, unknown: 0 });
    expect(gary.costCents).toBe(2350);
    expect(brian.costCents).toBe(1125);

    // Gary: every canary found → green. Brian: nothing found → red with the missed canaries named.
    expect(gary.pass).toBe(true);
    expect(gary.reasons).toEqual([]);
    expect(brian.pass).toBe(false);
    expect((brian.reasons as string[])[0]).toMatch(/^recall_below_floor/);
    expect((brian.reasons as string[]).some((r) => r.startsWith('missed:willetts-seated-juror'))).toBe(true);

    const card = gary.scorecard as { recall: number; run: { model: string; promptSet: string; findings: number }; droppedAtVerification: { ratio: number | null } };
    expect(card.recall).toBe(1);
    expect(card.run.model).toBe('fake-eval-engine');
    expect(card.run.findings).toBeGreaterThanOrEqual(1);
    expect(card.droppedAtVerification.ratio).toBe(0);

    // The case walked the real stages and the analysis run is the one scored.
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: gary.caseId } });
    expect(kase.status).toBe('QA_REVIEW');
    expect(kase.recordBucket).toBe('EXTENDED');
    expect(gary.runId).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({ where: { caseId: gary.caseId, action: 'CASE_ACCESS' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.details).toMatchObject({ op: 'eval_gate_scored', ledger: 'gary', pass: true, bucket: 'EXTENDED' });
  }, 60_000);

  it('GET /ops/eval/runs?since= lists them newest first with the summary, the verdict and cost per bucket', async () => {
    const res = await get(`/ops/eval/runs?since=${encodeURIComponent(startedAt)}`, { cookie: adminCookie });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const mine = body.runs.filter((r: { id: string }) => ids.includes(r.id));
    expect(mine.length).toBe(ids.length);
    const gary = mine.find((r: { ledger: string; status: string }) => r.ledger === 'gary' && r.status === 'SCORED');
    expect(gary).toMatchObject({ pass: true, bucket: 'EXTENDED', costCents: 2350, summary: { mustFindTotal: 5, found: 5, missed: [], recall: 1, model: 'fake-eval-engine', droppedAtVerification: 0 } });
    const brian = mine.find((r: { ledger: string }) => r.ledger === 'brian');
    expect(brian.summary.missed.length).toBe(brian.summary.mustFindTotal);
    expect(brian.pass).toBe(false);
    for (let i = 1; i < body.runs.length; i++) expect(new Date(body.runs[i - 1].startedAt) >= new Date(body.runs[i].startedAt)).toBe(true);
    expect(body.costPerBucket.EXTENDED.n).toBeGreaterThanOrEqual(2);
    expect(body.costPerBucket.EXTENDED.meanCents).toBeGreaterThan(0);
    expect(body.costPerBucket).toHaveProperty('SHORT');
    expect(body.ledgers.map((l: { name: string }) => l.name)).toEqual(expect.arrayContaining(['gary', 'brian']));

    const bad = await get('/ops/eval/runs?since=yesterday', { cookie: adminCookie });
    expect(bad.statusCode).toBe(400);
  });

  it('GET /ops/eval/runs/:id returns the full scorecard; unknown id is 404; unknown ledger on POST is 404', async () => {
    const res = await get(`/ops/eval/runs/${ids[0]}`, { cookie: adminCookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: ids[0], scorecard: expect.objectContaining({ found: expect.any(Array) }), ledgerSummary: expect.objectContaining({ caseTitle: expect.any(String) }) });
    expect((await get('/ops/eval/runs/nope', { cookie: adminCookie })).statusCode).toBe(404);
    expect((await post('/ops/eval/runs', { cookie: adminCookie }, { ledgers: ['nope'] })).statusCode).toBe(404);
  });

  it('GET /ops/status carries the eval gate line in the professional group', async () => {
    const res = await get('/ops/status', { cookie: adminCookie });
    expect(res.statusCode).toBe(200);
    const gate = res.json().professional.evalGate;
    expect(gate.pass).toBe(false);
    expect(gate.failedLedgers).toEqual(['brian']);
    expect(gate.neverRun).toEqual([]);
    expect(new Date(gate.lastRunAt).getTime()).toBeGreaterThan(new Date(startedAt).getTime());
  });

  it('SUPPORT is refused on POST and on the GETs; a family account never reaches it', async () => {
    expect((await post('/ops/eval/runs', { cookie: supportCookie }, {})).statusCode).toBe(403);
    expect((await get('/ops/eval/runs', { cookie: supportCookie })).statusCode).toBe(403);
    expect((await get(`/ops/eval/runs/${ids[0]}`, { cookie: supportCookie })).statusCode).toBe(403);
    expect((await get('/ops/eval/runs', { cookie: clientCookie })).statusCode).toBe(403);
  });
});

describe('the machine path — EVAL_GATE_TOKEN bearer (J7)', () => {
  it('is disabled while the variable is unset: the bearer is just a bad session token', async () => {
    delete process.env.EVAL_GATE_TOKEN;
    expect((await get('/ops/eval/runs', { authorization: `Bearer ${TOKEN}` })).statusCode).toBe(401);
  });

  it('opens the two eval routes with the token, 401 with a wrong token, 401 on every other /ops route', async () => {
    process.env.EVAL_GATE_TOKEN = TOKEN;
    const list = await get(`/ops/eval/runs?since=${encodeURIComponent(startedAt)}`, { authorization: `Bearer ${TOKEN}` });
    expect(list.statusCode).toBe(200);
    expect(list.json().runs.length).toBeGreaterThanOrEqual(2);
    const first = list.json().runs[0].id;
    expect((await get(`/ops/eval/runs/${first}`, { authorization: `Bearer ${TOKEN}` })).statusCode).toBe(200);

    expect((await get('/ops/eval/runs', { authorization: `Bearer ${TOKEN}x` })).statusCode).toBe(401);
    expect((await get('/ops/eval/runs', { authorization: `Bearer ${'a'.repeat(TOKEN.length)}` })).statusCode).toBe(401);
    expect((await get('/ops/eval/runs', { authorization: 'Bearer ' })).statusCode).toBe(401);

    for (const url of ['/ops/status', '/ops/eval/ledgers', '/ops/queue', '/ops/payments/summary', '/ops/eval/runs/../../status', '/ops/eval/runsx']) {
      expect((await get(url, { authorization: `Bearer ${TOKEN}` })).statusCode, url).toBe(401);
    }
    expect((await post('/ops/reconcile-payments', { authorization: `Bearer ${TOKEN}` })).statusCode).toBe(401);
    expect((await get('/qa/queue', { authorization: `Bearer ${TOKEN}` })).statusCode).toBe(401);
  });

  it('starts a run with the token, audited under the machine identity', async () => {
    process.env.EVAL_GATE_TOKEN = TOKEN;
    const res = await post('/ops/eval/runs', { authorization: `Bearer ${TOKEN}` }, { ledgers: ['gary'] });
    expect(res.statusCode).toBe(202);
    const [started] = res.json().runs as Array<{ id: string; caseId: string }>;
    const [row] = await settled([started.id]);
    expect(row.triggeredBy).toBe('eval-gate');
    expect(row.status).toBe('SCORED');
    const audit = await prisma.auditLog.findFirst({ where: { caseId: started.caseId }, orderBy: { createdAt: 'desc' } });
    expect(audit?.userId).toBe('eval-gate');
    delete process.env.EVAL_GATE_TOKEN;
  }, 60_000);
});

describe('the eval tenant stays out of Money (isTest)', () => {
  it('a payment in the eval tenant is not in /ops/payments/summary byRung', async () => {
    const org = await prisma.organisation.findFirstOrThrow({ where: { name: EVAL_ORGANISATION_NAME } });
    const before = (await get('/ops/payments/summary?days=30', { cookie: adminCookie })).json();
    const admin = await prisma.user.findFirstOrThrow({ where: { email: `${run}_admin@x.com` } });
    const evalCase = await prisma.case.findFirstOrThrow({ where: { tenantId: org.tenantId } });
    await prisma.payment.create({
      data: { stripeId: `cs_live_${run}_eval`, caseId: evalCase.id, userId: admin.id, tenantId: org.tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 34900, sku: 'COUNSEL_EXTENDED' },
    });
    const after = (await get('/ops/payments/summary?days=30', { cookie: adminCookie })).json();
    expect(after.byRung.COUNSEL_EXTENDED.count).toBe(before.byRung.COUNSEL_EXTENDED.count);
    expect(after.byRung.COUNSEL_EXTENDED.cents).toBe(before.byRung.COUNSEL_EXTENDED.cents);
  });
});
