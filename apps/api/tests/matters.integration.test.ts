/**
 * Matter intake for counsel (persona_rollout_plan.md §5 C) — live Postgres.
 *  C1  a PROFESSIONAL with the flag on opens a matter for every non-capital
 *      vehicle: Case + Matter + CaseAccess, Case.vehicle set, facts/deadline
 *      facts seeded, the TRAP clock steps for a direct appeal (literal dates)
 *  C2  capital refused: capital=true → 422 CAPITAL_REFUSED; vehicle 11.071 →
 *      422; nothing created
 *  C3  flag off → 404 everywhere; FAMILY with the flag on → 403; a
 *      PROFESSIONAL from another organisation gets 404 on read and patch
 *  C4  weighting: a matter's run carries the vehicle's weighted screens and
 *      runs them in that order; a family case's plan and modelConfig are
 *      byte-identical to today's builder
 *  +   PATCH: editable fields, the post-DOCS_COMPLETE lock, audit rows
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';
process.env.ANALYSIS_SAMPLES = '1';
process.env.ANALYSIS_PROMPT_SET = 'v2';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { VEHICLES, VEHICLE_IDS, type CounselVehicle, type MatterCreateInput } from '@hg/case-lifecycle';
import { planScreens, runModelConfig, screensForLane, promptSet, promptHash, runAnalysis, type AnalysisModel } from '../src/services/analysis.service';

const run = `matter_${Date.now()}`;
const json = { 'content-type': 'application/json' };
const cookieFor = async (userId: string, tenantId: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

let proA: { userId: string; tenantId: string; orgId: string; cookie: string };
let proB: { userId: string; tenantId: string; orgId: string; cookie: string };
let family: { userId: string; tenantId: string; cookie: string };

const signup = async (tag: string) => {
  const res = await fastify.inject({
    method: 'POST', url: '/counsel/signup',
    payload: { email: `${run}_${tag}@example.com`, password: 'CorrectHorse9Battery!', name: `Counsel ${tag}`, barNumber: `2401${tag.length}`, practiceType: 'writ' },
  });
  expect(res.statusCode).toBe(200);
  const { userId, organisationId } = res.json();
  // The lawyer gate (UPL review 2026-10-23, P1): matters open once staff verify the bar; proven in lawyer-gates.integration.test.ts.
  const { tenantId } = await prisma.user.update({ where: { id: userId }, data: { barVerifiedAt: new Date(), barVerificationStatus: 'VERIFIED' } });
  return { userId, tenantId, orgId: organisationId as string, cookie: await cookieFor(userId, tenantId) };
};

const flag = async (tenantId: string, enabled: boolean) => {
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_tenantId: { flagKey: 'counsel_surfaces', tenantId } },
    create: { flagKey: 'counsel_surfaces', tenantId, enabled, updatedBy: 'test' },
    update: { enabled },
  });
  __invalidateFlagCache();
};

const post = (body: object, cookie = proA.cookie) =>
  fastify.inject({ method: 'POST', url: '/counsel/matters', headers: { cookie, ...json }, payload: body });
const get = (url: string, cookie = proA.cookie) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const patch = (caseId: string, body: object, cookie = proA.cookie) =>
  fastify.inject({ method: 'PATCH', url: `/counsel/matters/${caseId}`, headers: { cookie, ...json }, payload: body });

const BASE: MatterCreateInput = {
  vehicle: 'direct_appeal',
  lane: 'TRIAL',
  county: 'Harris',
  court: '176th District Court',
  causeNumber: '1234567',
  clientInitials: 'jd',
  offence: 'Aggravated robbery',
  sentence: '25 years TDCJ',
  sentenceImposedAt: '2026-09-01',
  judgmentSignedAt: '2026-09-03',
};

beforeAll(async () => {
  proA = await signup('a');
  proB = await signup('b');
  const ft = await prisma.tenant.create({ data: { name: `${run}_family` } });
  const fu = await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: ft.id, role: 'CLIENT' } });
  family = { userId: fu.id, tenantId: ft.id, cookie: await cookieFor(fu.id, ft.id) };
  await flag(proA.tenantId, true);
  await flag(proB.tenantId, true);
  await flag(family.tenantId, true);
});

afterAll(async () => {
  const tenants = [proA.tenantId, proB.tenantId, family.tenantId];
  await prisma.featureFlagOverride.deleteMany({ where: { tenantId: { in: tenants } } });
  __invalidateFlagCache();
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId: { in: tenants } } } });
  await prisma.finding.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.analysisRun.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.documentChunk.deleteMany({ where: { document: { case: { tenantId: { in: tenants } } } } });
  await prisma.document.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.checklistItem.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  // CaseEvent and AuditLog rows are append-only by trigger and survive the case (retention matrix).
  await prisma.matter.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

describe('C1 — a professional opens a matter', () => {
  const NON_CAPITAL = VEHICLE_IDS.filter((v) => !VEHICLES[v].refused);

  it('creates Case + Matter + CaseAccess for every non-capital vehicle, sets Case.vehicle, seeds facts and the checklist, audits', async () => {
    expect(NON_CAPITAL).toEqual(['direct_appeal', 'pdr_clock', '11.07', '11.072', '11.09', '2254']);
    for (const vehicle of NON_CAPITAL) {
      const res = await post({ ...BASE, vehicle, clientInitials: 'ab' });
      expect(res.statusCode, vehicle).toBe(201);
      const { caseId, matterId } = res.json();
      expect(caseId).toBeTruthy();
      expect(matterId).toBeTruthy();

      const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { accessList: true, matter: true, checklist: true } });
      expect(kase).toMatchObject({
        title: `AB — ${VEHICLES[vehicle].label}`,
        tenantId: proA.tenantId,
        status: 'AWAITING_DOCS',
        lane: 'TRIAL',
        vehicle,
        subsequentWrit: false,
        county: 'Harris',
        convictionYear: 2026,
      });
      expect(kase.accessList).toEqual([expect.objectContaining({ userId: proA.userId, role: 'ADMIN' })]);
      expect(kase.matter).toMatchObject({ id: matterId, organisationId: proA.orgId, openedBy: proA.userId, vehicle, clientInitials: 'AB', capital: false, priorWrits: 0 });
      // The interview's shape, so the family-built pipeline reads it unchanged.
      expect(kase.facts).toMatchObject({ jurisdiction: 'texas', capital: 'no', county: 'Harris', convictionYear: 2026, trialOrPlea: 'trial', priorWrit: 'no', judgmentDate: '2026-09-01' });
      expect(kase.deadlineFacts).toEqual({ judgmentDate: '2026-09-01' });
      expect(kase.checklist.length).toBeGreaterThan(0);
      // Never a name anywhere on the case.
      expect(JSON.stringify(kase)).not.toMatch(/Counsel a|John|Doe/);

      const events = await prisma.caseEvent.findMany({ where: { caseId }, orderBy: { id: 'asc' }, select: { type: true, version: true, payload: true } });
      expect(events.map((e) => e.type)).toEqual(['case.created', 'interview.completed']);
      expect(events[0]).toMatchObject({ version: 2, payload: { lane: 'TRIAL', vehicle, matterId } });

      const audit = await prisma.auditLog.findFirst({ where: { caseId, action: 'MATTER_OPENED' } });
      expect(audit).toMatchObject({ tenantId: proA.tenantId, userId: proA.userId, details: { matterId, vehicle, organisationId: proA.orgId } });
      expect(JSON.stringify(audit!.details)).not.toContain('AB');
    }
  });

  it('prior writs put the case in subsequent-writ mode (hold + facts), and a plea lane is kept', async () => {
    const res = await post({ ...BASE, vehicle: '11.07', lane: 'PLEA', clientInitials: 'RW', priorWrits: 1 });
    expect(res.statusCode).toBe(201);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: res.json().caseId }, include: { matter: true } });
    expect(kase).toMatchObject({ lane: 'PLEA', subsequentWrit: true });
    expect(kase.facts).toMatchObject({ trialOrPlea: 'plea', priorWrit: 'yes' });
    expect(kase.matter).toMatchObject({ priorWrits: 1, subsequentWrit: true });
    const types = (await prisma.caseEvent.findMany({ where: { caseId: kase.id }, orderBy: { id: 'asc' } })).map((e) => e.type);
    expect(types).toContain('hold.set');
  });

  it('no dates: no deadline facts, no conviction year, and the clock reports every step not_yet', async () => {
    const res = await post({ vehicle: '11.07', county: 'Bexar', clientInitials: 'nd' });
    expect(res.statusCode).toBe(201);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: res.json().caseId } });
    expect(kase.deadlineFacts).toBeNull();
    expect(kase.convictionYear).toBeNull();
    const detail = await get(`/counsel/matters/${kase.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().trapClock.steps.every((s: { status: string }) => s.status === 'not_yet')).toBe(true);
  });

  it('validation: a name instead of initials, an unknown vehicle, a bad date and an unknown key are 400 and create nothing', async () => {
    const before = await prisma.matter.count({ where: { tenantId: proA.tenantId } });
    expect((await post({ ...BASE, clientInitials: 'John Doe' })).statusCode).toBe(400);
    expect((await post({ ...BASE, vehicle: 'mandamus' })).statusCode).toBe(400);
    expect((await post({ ...BASE, judgmentSignedAt: 'last Tuesday' })).statusCode).toBe(400);
    expect((await post({ ...BASE, clientName: 'John Doe' })).statusCode).toBe(400);
    expect(await prisma.matter.count({ where: { tenantId: proA.tenantId } })).toBe(before);
  });

  it('GET /counsel/matters lists the organisation\'s matters; GET /:caseId returns the matter, the case, the checklist and the TRAP clock', async () => {
    const list = await get('/counsel/matters');
    expect(list.statusCode).toBe(200);
    const { matters } = list.json();
    expect(matters.length).toBeGreaterThanOrEqual(NON_CAPITAL.length);
    expect(matters[0]).toEqual(expect.objectContaining({
      matterId: expect.any(String), caseId: expect.any(String), title: expect.any(String), vehicle: expect.any(String),
      vehicleLabel: expect.any(String), clientInitials: expect.any(String), status: 'AWAITING_DOCS', bucket: null, createdAt: expect.any(String),
    }));
    expect(matters.every((m: { caseId: string }) => m.caseId)).toBe(true);

    // `bucket` is Case.recordBucket (the record inventory's meter, workstream D): null until set, then passed through.
    const metered = matters[0].caseId as string;
    await prisma.case.update({ where: { id: metered }, data: { recordBucket: 'STANDARD' } });
    try {
      const again = (await get('/counsel/matters')).json().matters.find((m: { caseId: string }) => m.caseId === metered);
      expect(again.bucket).toBe('STANDARD');
    } finally {
      await prisma.case.update({ where: { id: metered }, data: { recordBucket: null } });
    }

    // The direct-appeal matter with a judgment date: the TRAP steps, literal dates.
    const created = await post({ ...BASE, clientInitials: 'da', noticeOfAppealFiledAt: '2026-09-20' });
    const { caseId } = created.json();
    const detail = await get(`/counsel/matters/${caseId}?asOf=2026-10-01`);
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.matter).toMatchObject({
      caseId, vehicle: 'direct_appeal', vehicleLabel: 'Direct appeal', clientInitials: 'DA', county: 'Harris',
      court: '176th District Court', causeNumber: '1234567', sentenceImposedAt: '2026-09-01', judgmentSignedAt: '2026-09-03',
      noticeOfAppealFiledAt: '2026-09-20', recordFiledAt: null,
    });
    expect(body.case).toMatchObject({ id: caseId, status: 'AWAITING_DOCS', vehicle: 'direct_appeal', lane: 'TRIAL' });
    expect(body.checklist.items.length).toBeGreaterThan(0);
    expect(body.checklist.readiness).toMatchObject({ enough: false });
    expect(body.locked).toEqual([]);

    const clock = body.trapClock;
    expect(clock).toMatchObject({ vehicle: 'direct_appeal', asOf: '2026-10-01', disclaimerKey: 'deadline.verify_with_attorney' });
    const byId = Object.fromEntries(clock.steps.map((s: { id: string }) => [s.id, s]));
    // TRAP 26.2(a)(1): notice of appeal within 30 days of sentencing (2026-09-01 → 2026-10-01); filed 2026-09-20 → done, on time.
    expect(byId['noa']).toMatchObject({ rule: 'TRAP 26.2', due: '2026-10-01', status: 'done', filedAt: '2026-09-20', late: false, jurisdictional: true });
    // TRAP 21.4: motion for new trial within 30 days of sentencing — optional; not filed, and as of 10-01 still open.
    expect(byId['mnt']).toMatchObject({ rule: 'TRAP 21.4', due: '2026-10-01', status: 'open', optional: true });
    // TRAP 35.2(a): the record is due 60 days after sentencing — 2026-10-31 is a Saturday, so Rule 4.1 rolls it to Monday 11-02; still open on 10-01.
    expect(byId['record']).toMatchObject({ rule: 'TRAP 35.2', rawDue: '2026-10-31', due: '2026-11-02', rolled: true, status: 'open' });
    // TRAP 38.6(a): the brief runs from the record, which is not filed yet.
    expect(byId['brief']).toMatchObject({ rule: 'TRAP 38.6', status: 'not_yet', due: null });
    expect(clock.missedJurisdictional).toBe(false);
  });
});

describe('C2 — capital refused', () => {
  it('capital: true → 422 CAPITAL_REFUSED; vehicle 11.071 → 422; nothing is created', async () => {
    const before = { matters: await prisma.matter.count({ where: { tenantId: proA.tenantId } }), cases: await prisma.case.count({ where: { tenantId: proA.tenantId } }) };
    const a = await post({ ...BASE, capital: true });
    expect(a.statusCode).toBe(422);
    expect(a.json()).toMatchObject({ reason: 'CAPITAL_REFUSED', error: expect.stringMatching(/capital/i) });
    const b = await post({ ...BASE, vehicle: '11.071' });
    expect(b.statusCode).toBe(422);
    expect(b.json()).toMatchObject({ reason: 'CAPITAL_REFUSED' });
    const c = await post({ ...BASE, vehicle: '11.071', capital: true });
    expect(c.statusCode).toBe(422);
    expect(await prisma.matter.count({ where: { tenantId: proA.tenantId } })).toBe(before.matters);
    expect(await prisma.case.count({ where: { tenantId: proA.tenantId } })).toBe(before.cases);
    expect(await prisma.auditLog.count({ where: { tenantId: proA.tenantId, action: 'MATTER_OPENED', createdAt: { gt: new Date(Date.now() - 2000) }, details: { path: ['vehicle'], equals: '11.071' } } })).toBe(0);
  });
});

describe('C3 — flag and account kind', () => {
  let caseId: string;
  beforeAll(async () => {
    caseId = (await post({ ...BASE, clientInitials: 'sc' })).json().caseId;
  });

  it('flag off → 404 on every /counsel/matters* route, for a professional too', async () => {
    await flag(proA.tenantId, false);
    try {
      expect((await post(BASE)).statusCode).toBe(404);
      expect((await get('/counsel/matters')).statusCode).toBe(404);
      expect((await get(`/counsel/matters/${caseId}`)).statusCode).toBe(404);
      expect((await patch(caseId, { court: 'x' })).statusCode).toBe(404);
      // /counsel/me is not behind the flag (workstream A) and still answers.
      expect((await get('/counsel/me')).statusCode).toBe(200);
    } finally {
      await flag(proA.tenantId, true);
    }
  });

  it('a FAMILY account with the flag on → 403 everywhere', async () => {
    expect((await post(BASE, family.cookie)).statusCode).toBe(403);
    expect((await get('/counsel/matters', family.cookie)).statusCode).toBe(403);
    expect((await get(`/counsel/matters/${caseId}`, family.cookie)).statusCode).toBe(403);
    expect((await patch(caseId, { court: 'x' }, family.cookie)).statusCode).toBe(403);
    expect(await prisma.matter.count({ where: { tenantId: family.tenantId } })).toBe(0);
  });

  it('anonymous → 401', async () => {
    expect((await fastify.inject({ method: 'GET', url: '/counsel/matters' })).statusCode).toBe(401);
  });

  it("a PROFESSIONAL from another organisation cannot read, list or patch the matter (404), and never sees it in their list", async () => {
    expect((await get(`/counsel/matters/${caseId}`, proB.cookie)).statusCode).toBe(404);
    const res = await patch(caseId, { court: 'Hijacked' }, proB.cookie);
    expect(res.statusCode).toBe(404);
    expect((await prisma.matter.findUniqueOrThrow({ where: { caseId } })).court).toBe('176th District Court');
    const list = await get('/counsel/matters', proB.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().matters.map((m: { caseId: string }) => m.caseId)).not.toContain(caseId);
  });

  it('a professional whose seat is gone → 403', async () => {
    const seat = await prisma.membership.findFirstOrThrow({ where: { userId: proB.userId } });
    await prisma.membership.delete({ where: { id: seat.id } });
    try {
      expect((await get('/counsel/matters', proB.cookie)).statusCode).toBe(403);
    } finally {
      await prisma.membership.create({ data: { organisationId: seat.organisationId, tenantId: seat.tenantId, userId: seat.userId, role: seat.role } });
    }
  });
});

describe('PATCH /counsel/matters/:caseId', () => {
  let caseId: string;
  beforeAll(async () => {
    caseId = (await post({ ...BASE, clientInitials: 'pt' })).json().caseId;
  });

  it('edits dates, cause number, court and the note; keeps Case.facts / deadlineFacts in step; audits the keys only', async () => {
    const res = await patch(caseId, { sentenceImposedAt: '9/15/2026', recordFiledAt: '2026-11-02', causeNumber: '7654321', court: null, outsideRecordNote: 'Affidavit from trial counsel expected.' });
    expect(res.statusCode).toBe(200);
    expect(res.json().matter).toMatchObject({ sentenceImposedAt: '2026-09-15', judgmentSignedAt: '2026-09-03', recordFiledAt: '2026-11-02', causeNumber: '7654321', court: null, outsideRecordNote: 'Affidavit from trial counsel expected.' });
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.facts).toMatchObject({ judgmentDate: '2026-09-15', convictionYear: 2026 });
    expect(kase.deadlineFacts).toEqual({ judgmentDate: '2026-09-15' });
    const audit = await prisma.auditLog.findFirst({ where: { caseId, action: 'MATTER_UPDATED' }, orderBy: { createdAt: 'desc' } });
    expect(audit!.details).toEqual({ keys: ['sentenceImposedAt', 'recordFiledAt', 'causeNumber', 'court', 'outsideRecordNote'] });
    expect(JSON.stringify(audit!.details)).not.toContain('Affidavit');
    // The clock follows the new dates.
    const detail = await get(`/counsel/matters/${caseId}?asOf=2026-11-10`);
    const byId = Object.fromEntries(detail.json().trapClock.steps.map((s: { id: string }) => [s.id, s]));
    expect(byId['noa']).toMatchObject({ due: '2026-10-15', status: 'missed' });
    expect(byId['brief']).toMatchObject({ rule: 'TRAP 38.6', due: '2026-12-02', status: 'open' });
  });

  it('clearing both judgment dates clears the deadline facts and the conviction year', async () => {
    const res = await patch(caseId, { sentenceImposedAt: null, judgmentSignedAt: null });
    expect(res.statusCode).toBe(200);
    const kase = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(kase.deadlineFacts).toBeNull();
    expect(kase.convictionYear).toBeNull();
    expect((kase.facts as { judgmentDate?: string }).judgmentDate).toBeUndefined();
    await patch(caseId, { judgmentSignedAt: '2026-09-03' });
  });

  it('refuses an empty patch (400), an unknown field (400) and a fixed field like vehicle or clientInitials (400)', async () => {
    expect((await patch(caseId, {})).statusCode).toBe(400);
    expect((await patch(caseId, { vehicle: '11.07' })).statusCode).toBe(400);
    expect((await patch(caseId, { clientInitials: 'XY' })).statusCode).toBe(400);
    expect((await patch(caseId, { clientName: 'Someone' })).statusCode).toBe(400);
  });

  it('past DOCS_COMPLETE the judgment and sentencing dates are locked (409 LOCKED); the appeal dates, cause number, court and note still edit', async () => {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'ANALYZING' } });
    try {
      const locked = await patch(caseId, { judgmentSignedAt: '2026-09-04', court: 'still fine' });
      expect(locked.statusCode).toBe(409);
      expect(locked.json()).toMatchObject({ reason: 'LOCKED', locked: ['judgmentSignedAt'] });
      expect((await prisma.matter.findUniqueOrThrow({ where: { caseId } })).court).toBe(null); // nothing applied
      expect((await patch(caseId, { sentenceImposedAt: '2026-09-04' })).statusCode).toBe(409);
      const ok = await patch(caseId, { noticeOfAppealFiledAt: '2026-10-01', recordFiledAt: null, causeNumber: '1', court: 'CCA', outsideRecordNote: null });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().matter).toMatchObject({ noticeOfAppealFiledAt: '2026-10-01', recordFiledAt: null, causeNumber: '1', court: 'CCA', outsideRecordNote: null });
      expect((await get(`/counsel/matters/${caseId}`)).json().locked).toEqual(['judgmentSignedAt', 'sentenceImposedAt']);
      // At DOCS_COMPLETE itself (the pipeline has not read anything yet) they still edit.
      await prisma.case.update({ where: { id: caseId }, data: { status: 'DOCS_COMPLETE' } });
      expect((await patch(caseId, { judgmentSignedAt: '2026-09-04' })).statusCode).toBe(200);
    } finally {
      await prisma.case.update({ where: { id: caseId }, data: { status: 'AWAITING_DOCS' } });
    }
  });

  it('a deleted case is 404', async () => {
    await prisma.case.update({ where: { id: caseId }, data: { status: 'DELETED' } });
    try {
      expect((await get(`/counsel/matters/${caseId}`)).statusCode).toBe(404);
      expect((await patch(caseId, { court: 'x' })).statusCode).toBe(404);
      expect((await get('/counsel/matters')).json().matters.map((m: { caseId: string }) => m.caseId)).not.toContain(caseId);
    } finally {
      await prisma.case.update({ where: { id: caseId }, data: { status: 'AWAITING_DOCS' } });
    }
  });
});

describe('C4 — screens weighted by vehicle', () => {
  it('the family plan (no vehicle) is byte-identical to today\'s builder, for both lanes', () => {
    for (const lane of ['TRIAL', 'PLEA'] as const) {
      expect(planScreens(lane, null)).toEqual({ lane, screens: screensForLane(lane) });
      expect(planScreens(lane)).toEqual({ lane, screens: screensForLane(lane) });
      expect(runModelConfig('claude-opus-5', planScreens(lane, null))).toEqual({ model: 'claude-opus-5', screens: promptSet(), promptHash: promptHash() });
    }
  });

  it('a matter\'s plan orders the lane\'s screens by the vehicle\'s weights without dropping any', () => {
    const direct = planScreens('TRIAL', 'direct_appeal');
    expect(direct.screens).toEqual(['preserved_error', 'voir_dire', 'identification', 'sentencing', 'junk_science', 'iac', 'brady']);
    expect(direct.screenWeights).toEqual({ preserved_error: 1, voir_dire: 2, identification: 3, sentencing: 4, junk_science: 5, iac: 6, brady: 7 });
    expect([...direct.screens].sort()).toEqual([...screensForLane('TRIAL')].sort());

    // 11.07 weights plea_lane, which the TRIAL lane never runs; voir_dire is unweighted and runs last.
    const writ = planScreens('TRIAL', '11.07');
    expect(writ.screens).toEqual(['iac', 'brady', 'junk_science', 'sentencing', 'identification', 'preserved_error', 'voir_dire']);
    expect(writ.screens).not.toContain('plea_lane');
    // The PLEA lane keeps its two screens, ordered by the writ's weights.
    expect(planScreens('PLEA', '11.07').screens).toEqual(['sentencing', 'plea_lane']);
    expect(planScreens('PLEA', '11.072').screens).toEqual(['plea_lane', 'sentencing']);
    // pdr_clock weights two screens; the rest follow in lane order.
    expect(planScreens('TRIAL', 'pdr_clock').screens).toEqual(['preserved_error', 'sentencing', 'iac', 'brady', 'junk_science', 'voir_dire', 'identification']);

    const cfg = runModelConfig('m', direct) as Record<string, unknown>;
    expect(cfg).toEqual({ model: 'm', screens: promptSet(), promptHash: promptHash(), vehicle: 'direct_appeal', screenWeights: direct.screenWeights });
  });

  it('a real run on a matter records the weights on the AnalysisRun and runs the screens in weighted order; a family run records exactly today\'s modelConfig', async () => {
    const seen: string[] = [];
    const fake: AnalysisModel = { name: 'fake', invoke: async (system: string) => { seen.push(system.slice(0, 80)); return JSON.stringify({ findings: [] }); } };
    const chunk = async (caseId: string) => {
      const doc = await prisma.document.create({ data: { filename: 'rr-vol-1.pdf', caseId } });
      await prisma.documentChunk.create({ data: { documentId: doc.id, content: `${run} THE COURT: Objection overruled.`, metadata: { volume: 'RR1', page: 1 } } });
    };

    // The matter.
    const { caseId } = (await post({ ...BASE, vehicle: '11.07', clientInitials: 'wt' })).json();
    await prisma.case.update({ where: { id: caseId }, data: { status: 'DOCS_COMPLETE', slaStartedAt: new Date() } });
    await chunk(caseId);
    // A counsel matter is quoted before analysis (workstream B): settle it
    // the way the card webhook does — the paid row plus the acceptance event.
    await withTenant(proA.tenantId, async (tx) => {
      const payment = await tx.payment.create({
        data: { stripeId: `cs_test_${run}_c4`, caseId, userId: proA.userId, tenantId: proA.tenantId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 24900, sku: 'COUNSEL_STANDARD', rung: 'STANDARD' },
      });
      await appendCaseEvent(tx, { caseId, tenantId: proA.tenantId, type: 'quote.accepted', actor: 'system', payload: { method: 'CARD', sku: 'COUNSEL_STANDARD', rung: 'STANDARD', paymentId: payment.id } });
    });
    const summary = await runAnalysis(caseId, proA.tenantId, fake);
    expect(summary.screensRun).toBe(7);
    const mrun = await prisma.analysisRun.findFirstOrThrow({ where: { caseId } });
    expect(mrun.modelConfig).toEqual({ model: 'fake', screens: 'v2', promptHash: promptHash(), vehicle: '11.07', screenWeights: { iac: 1, brady: 2, junk_science: 3, sentencing: 4, identification: 5, plea_lane: 6, preserved_error: 7 } });
    const order = (await prisma.caseEvent.findMany({ where: { caseId, type: 'screen.completed' }, orderBy: { id: 'asc' } })).map((e) => (e.payload as { screen: string }).screen);
    expect(order).toEqual(['iac', 'brady', 'junk_science', 'sentencing', 'identification', 'preserved_error', 'voir_dire']);

    // The family case: no matter row → today's order and today's modelConfig, nothing more.
    const fam = await prisma.case.create({ data: { title: `${run}_family_case`, tenantId: family.tenantId, status: 'DOCS_COMPLETE', lane: 'TRIAL', vehicle: '11.07', slaStartedAt: new Date(), accessList: { create: { userId: family.userId, role: 'ADMIN' } } } });
    await chunk(fam.id);
    await runAnalysis(fam.id, family.tenantId, fake);
    const frun = await prisma.analysisRun.findFirstOrThrow({ where: { caseId: fam.id } });
    expect(frun.modelConfig).toEqual({ model: 'fake', screens: 'v2', promptHash: promptHash() });
    const forder = (await prisma.caseEvent.findMany({ where: { caseId: fam.id, type: 'screen.completed' }, orderBy: { id: 'asc' } })).map((e) => (e.payload as { screen: string }).screen);
    expect(forder).toEqual(screensForLane('TRIAL'));
  });
});
