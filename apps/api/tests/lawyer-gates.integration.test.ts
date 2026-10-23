/**
 * U4 — the lawyer gate (UPL review 2026-10-23, recommendation 4; findings
 * P1 + P2; staff_console.md §11 "The lawyer gate"). Live Postgres.
 *
 *  U4-a the route matrix: PENDING professional, REJECTED professional,
 *       VERIFIED owner, VERIFIED attorney seat, investigator seat, viewer
 *       seat × (POST matters, GET matter detail fields, quote, packet.pdf,
 *       inbox, investigations POST) — the codes and the fields each gets.
 *  U4-b verify → VERIFIED and the routes open; reject → REJECTED and they
 *       close on the very next request; re-verify reopens. Plus: the
 *       sign-up answer and /counsel/me carry barVerificationStatus and
 *       lawyerSeat; an invited attorney adds a bar number through
 *       PATCH /counsel/me and reaches the queue; an `investigator`
 *       practice type cannot be verified as a lawyer.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests } from '@hg/email';
import type { MatterCreateInput } from '@hg/case-lifecycle';

const run = `u4gate_${Date.now()}`;
const json = { 'content-type': 'application/json' };
const cookieFor = async (userId: string, tenantId: string, role = 'CLIENT') =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;

interface Seat { userId: string; cookie: string; email: string }
interface Org { tenantId: string; orgId: string; owner: Seat }

const signup = async (tag: string, extra: Record<string, unknown> = {}): Promise<Org & { body: Record<string, unknown> }> => {
  const email = `${run}_${tag}@example.com`;
  const res = await fastify.inject({
    method: 'POST', url: '/counsel/signup',
    payload: { email, password: 'CorrectHorse9Battery!', name: `Counsel ${tag}`, barNumber: `2409${tag.length}${tag.charCodeAt(0)}`, practiceType: 'writ', ...extra },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { userId: string; organisationId: string };
  const { tenantId } = await prisma.user.findUniqueOrThrow({ where: { id: body.userId } });
  return { tenantId, orgId: body.organisationId, owner: { userId: body.userId, cookie: await cookieFor(body.userId, tenantId), email }, body };
};

const seat = async (org: Org, tag: string, role: 'ATTORNEY' | 'INVESTIGATOR' | 'VIEWER', bar: 'VERIFIED' | 'REJECTED' | 'NONE'): Promise<Seat> => {
  const email = `${run}_${tag}@example.com`;
  const user = await prisma.user.create({
    data: {
      email, name: `Seat ${tag}`, tenantId: org.tenantId, role: 'CLIENT', accountKind: 'PROFESSIONAL',
      practiceType: role === 'INVESTIGATOR' ? 'investigator' : 'writ',
      ...(bar === 'VERIFIED' ? { barNumber: `2408${tag.length}`, barState: 'TX', barVerifiedAt: new Date(), barVerificationStatus: 'VERIFIED' } : {}),
      ...(bar === 'REJECTED' ? { barNumber: `2407${tag.length}`, barState: 'TX', barVerificationStatus: 'REJECTED', barRejectedAt: new Date(), barRejectionNote: 'directory lists another name' } : {}),
    },
  });
  await prisma.membership.create({ data: { organisationId: org.orgId, tenantId: org.tenantId, userId: user.id, role } });
  return { userId: user.id, cookie: await cookieFor(user.id, org.tenantId), email };
};

const FLAGS = ['counsel_surfaces', 'counsel_checkout', 'record_desk', 'clinic_inbox'] as const;

let staffTenant: string;
let adminCookie: string;
let firm: Org & { body: Record<string, unknown> }; // the owner signs up PENDING
let other: Org; // its owner is verified by staff before the matrix
let attorneyV: Seat;
let attorneyR: Seat;
let investigator: Seat;
let viewer: Seat;
let caseId: string;
const tenants: string[] = [];

const MATTER: MatterCreateInput = {
  vehicle: 'direct_appeal', lane: 'TRIAL', county: 'Harris', court: '176th District Court', causeNumber: '1234567', clientInitials: 'gw',
  sentenceImposedAt: '2026-09-01', judgmentSignedAt: '2026-09-03', noticeOfAppealFiledAt: '2026-09-20', priorWrits: 1, outsideRecordNote: 'a recantation letter',
};

const post = (url: string, cookie: string, payload: unknown = {}) => fastify.inject({ method: 'POST', url, headers: { cookie, ...json }, payload: payload as Record<string, unknown> });
const get = (url: string, cookie: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const patch = (url: string, cookie: string, payload: unknown = {}) => fastify.inject({ method: 'PATCH', url, headers: { cookie, ...json }, payload: payload as Record<string, unknown> });

beforeAll(async () => {
  __setEmailProviderForTests({ send: async () => ({ delivered: true, id: 'test' }) });
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'Robbie', tenantId: staffTenant, role: 'ADMIN' } });
  adminCookie = await cookieFor(admin.id, staffTenant, 'ADMIN');

  firm = await signup('firm');
  other = await signup('other');
  await prisma.user.update({ where: { id: other.owner.userId }, data: { barVerifiedAt: new Date(), barVerifiedBy: admin.id, barVerificationStatus: 'VERIFIED' } });
  attorneyV = await seat(firm, 'attv', 'ATTORNEY', 'VERIFIED');
  attorneyR = await seat(firm, 'attr', 'ATTORNEY', 'REJECTED');
  investigator = await seat(firm, 'inv', 'INVESTIGATOR', 'NONE');
  viewer = await seat(firm, 'view', 'VIEWER', 'NONE');
  tenants.push(staffTenant, firm.tenantId, other.tenantId);
  for (const t of [firm.tenantId, other.tenantId]) for (const f of FLAGS) await setOverride(f, t, true, 'U4', 'test');
  __invalidateFlagCache();

  // The verified attorney seat opens the firm's matter; the record is then metered so the quote answers.
  const opened = await post('/counsel/matters', attorneyV.cookie, MATTER);
  expect(opened.statusCode).toBe(201);
  caseId = opened.json().caseId;
  await prisma.case.update({ where: { id: caseId }, data: { status: 'DOCS_COMPLETE', recordBucket: 'STANDARD', meteredPages: { reporter: 300, clerk: 0, exhibit: 0, unknown: 0 } } });
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  for (const t of [firm.tenantId, other.tenantId]) for (const f of FLAGS) await clearOverride(f, t, 'test');
  await prisma.investigationRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.checklistItem.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.matter.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId: { in: tenants } } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.organisation.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

const expectRefused = (res: { statusCode: number; json: () => { reason?: string; error?: string } }, reason: string, message?: RegExp) => {
  expect(res.statusCode).toBe(403);
  expect(res.json().reason).toBe(reason);
  if (message) expect(res.json().error).toMatch(message);
};

/** Everything a lawyer reads on the detail and a non-lawyer must not. */
const LAWYER_ONLY_MATTER_FIELDS = ['judgmentSignedAt', 'sentenceImposedAt', 'noticeOfAppealFiledAt', 'recordFiledAt', 'priorWrits', 'subsequentWrit', 'outsideRecordNote', 'offence', 'sentence', 'lane', 'capital'];

describe('U4-a — the route matrix', () => {
  const closed = (who: () => Seat, reason: string, message: RegExp) => {
    it(`POST matters, PATCH matter, quote, accept, request, packs and packet.pdf are 403 ${reason}`, async () => {
      const c = who().cookie;
      expectRefused(await post('/counsel/matters', c, MATTER), reason, message);
      expectRefused(await patch(`/counsel/matters/${caseId}`, c, { court: 'x' }), reason);
      expectRefused(await get(`/counsel/matters/${caseId}/quote`, c), reason);
      expectRefused(await post(`/counsel/matters/${caseId}/quote/accept`, c, { method: 'CARD' }), reason);
      expectRefused(await post(`/counsel/matters/${caseId}/quote/request`, c, { note: 'x' }), reason);
      expectRefused(await post('/counsel/packs', c, { rung: 'STANDARD' }), reason);
      expectRefused(await get(`/counsel/matters/${caseId}/packet.pdf`, c), reason);
      expectRefused(await get(`/counsel/matters/${caseId}/packet.json`, c), reason);
      // Nothing was created by the refused POST.
      expect(await prisma.matter.count({ where: { organisationId: firm.orgId } })).toBe(1);
    });
    it(`GET matter detail is the stripped view (no clock, lock list, dates or posture) ${reason}`, async () => {
      const res = await get(`/counsel/matters/${caseId}`, who().cookie);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ lawyerSeat: false, lawyerSeatReason: reason, case: { id: caseId, status: 'DOCS_COMPLETE' } });
      expect(body.case.title).toBe('GW — Direct appeal');
      expect(body.trapClock).toBeUndefined();
      expect(body.locked).toBeUndefined();
      for (const k of LAWYER_ONLY_MATTER_FIELDS) expect(body.matter, k).not.toHaveProperty(k);
      expect(body.matter).toMatchObject({ caseId, vehicle: 'direct_appeal', county: 'Harris', causeNumber: '1234567', clientInitials: 'GW' });
      expect(body.checklist).toMatchObject({ documents: 0 });
      expect(Array.isArray(body.checklist.items)).toBe(true);
      expect(JSON.stringify(body)).not.toContain('recantation');
    });
    it(`GET matters list still answers 200 with titles and status ${reason}`, async () => {
      const res = await get('/counsel/matters', who().cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().matters).toEqual([expect.objectContaining({ caseId, title: 'GW — Direct appeal', status: 'DOCS_COMPLETE' })]);
    });
  };

  describe('PENDING professional (the firm owner, straight from sign-up)', () => {
    closed(() => firm.owner, 'BAR_PENDING', /awaiting verification/);
    it('the sign-up answered barVerificationStatus PENDING and /counsel/me says so with lawyerSeat false', async () => {
      expect(firm.body).toMatchObject({ ok: true, barVerificationStatus: 'PENDING' });
      const me = await get('/counsel/me', firm.owner.cookie);
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ user: { barVerified: false, barVerificationStatus: 'PENDING' }, membership: { role: 'OWNER' }, lawyerSeat: false, lawyerSeatReason: 'BAR_PENDING' });
    });
    it('may still file a Record Desk request (an owner is a filer); the inbox is not a clinic\'s', async () => {
      expect((await post('/counsel/investigations', firm.owner.cookie, { kind: 'CHRONOLOGY', note: 'Chronology of the suppression hearing' })).statusCode).toBe(200);
      expectRefused(await get('/counsel/inbox', firm.owner.cookie), 'NOT_A_CLINIC');
    });
  });

  describe('REJECTED professional (an attorney seat whose number could not be verified)', () => {
    closed(() => attorneyR, 'BAR_REJECTED', /could not be verified/);
    it('/counsel/me carries REJECTED; the request form still files', async () => {
      expect((await get('/counsel/me', attorneyR.cookie)).json()).toMatchObject({ user: { barVerificationStatus: 'REJECTED', barVerified: false }, lawyerSeat: false, lawyerSeatReason: 'BAR_REJECTED' });
      expect((await post('/counsel/investigations', attorneyR.cookie, { kind: 'OTHER', note: 'Pull the DPS lab file' })).statusCode).toBe(200);
    });
  });

  describe('investigator seat', () => {
    closed(() => investigator, 'LAWYER_SEAT_REQUIRED', /attorneys/);
    it('files a Record Desk request (200) — the seat is for uploading the record and asking the desk', async () => {
      expect((await post('/counsel/investigations', investigator.cookie, { kind: 'RECORDS_TRACKER', caseId, note: 'Tracker for the clerk\'s record' })).statusCode).toBe(200);
      expect((await get('/counsel/me', investigator.cookie)).json()).toMatchObject({ membership: { role: 'INVESTIGATOR' }, lawyerSeat: false, lawyerSeatReason: 'LAWYER_SEAT_REQUIRED' });
    });
  });

  describe('viewer seat', () => {
    closed(() => viewer, 'LAWYER_SEAT_REQUIRED', /attorneys/);
    it('cannot file a Record Desk request either (403, the existing rule)', async () => {
      expect((await post('/counsel/investigations', viewer.cookie, { kind: 'OTHER', note: 'x' })).statusCode).toBe(403);
    });
  });

  const open = (who: () => Seat, label: string) => {
    it(`${label}: matter detail carries the clock, the lock list, the dates and the posture; quote 200; packet 409 (no released report, so the gate passed); PATCH 200`, async () => {
      const c = who().cookie;
      const detail = await get(`/counsel/matters/${caseId}`, c);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({ lawyerSeat: true, matter: { priorWrits: 1, subsequentWrit: true, judgmentSignedAt: '2026-09-03', outsideRecordNote: 'a recantation letter' } });
      expect(detail.json().trapClock).toBeTruthy();
      expect(Array.isArray(detail.json().locked)).toBe(true);
      const quote = await get(`/counsel/matters/${caseId}/quote`, c);
      expect(quote.statusCode).toBe(200);
      expect(quote.json()).toMatchObject({ caseId, bucket: 'STANDARD' });
      const packet = await get(`/counsel/matters/${caseId}/packet.pdf`, c);
      expect(packet.statusCode).toBe(409);
      expect(packet.json().reason).toBe('NO_RELEASED_REPORT');
      expect((await get(`/counsel/matters/${caseId}/packet.json`, c)).statusCode).toBe(409);
      expect((await patch(`/counsel/matters/${caseId}`, c, { court: '176th District Court' })).statusCode).toBe(200);
      expect((await get('/counsel/me', c)).json()).toMatchObject({ user: { barVerificationStatus: 'VERIFIED', barVerified: true }, lawyerSeat: true });
    });
  };
  describe('VERIFIED attorney seat (in the firm)', () => {
    open(() => attorneyV, 'attorney seat');
    it('opens a second matter (201) and files a Record Desk request (200)', async () => {
      const res = await post('/counsel/matters', attorneyV.cookie, { ...MATTER, clientInitials: 'ab' });
      expect(res.statusCode).toBe(201);
      await prisma.case.update({ where: { id: res.json().caseId }, data: { status: 'DELETED' } });
      expect((await post('/counsel/investigations', attorneyV.cookie, { kind: 'CHRONOLOGY', note: 'Chronology of voir dire' })).statusCode).toBe(200);
    });
  });
  describe('VERIFIED owner (the other organisation)', () => {
    it('opens a matter (201); another organisation\'s matter is still a 404, never a hint', async () => {
      const res = await post('/counsel/matters', other.owner.cookie, MATTER);
      expect(res.statusCode).toBe(201);
      expect((await get(`/counsel/matters/${caseId}`, other.owner.cookie)).statusCode).toBe(404);
      expect((await get(`/counsel/matters/${res.json().caseId}`, other.owner.cookie)).json()).toMatchObject({ lawyerSeat: true });
      expect((await get('/counsel/me', other.owner.cookie)).json()).toMatchObject({ membership: { role: 'OWNER' }, lawyerSeat: true });
    });
  });
});

describe('U4-b — verify opens, reject closes on the next request, re-verify reopens', () => {
  it('verify → VERIFIED; the owner\'s POST matters is 201 and the detail is the lawyer view', async () => {
    const res = await post(`/ops/verifications/${firm.owner.userId}/verify`, adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, barVerificationStatus: 'VERIFIED', emailed: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: firm.owner.userId } })).toMatchObject({ barVerificationStatus: 'VERIFIED' });
    const opened = await post('/counsel/matters', firm.owner.cookie, { ...MATTER, clientInitials: 'cd' });
    expect(opened.statusCode).toBe(201);
    await prisma.case.update({ where: { id: opened.json().caseId }, data: { status: 'DELETED' } });
    expect((await get(`/counsel/matters/${caseId}`, firm.owner.cookie)).json()).toMatchObject({ lawyerSeat: true });
    expect((await get(`/counsel/matters/${caseId}/quote`, firm.owner.cookie)).statusCode).toBe(200);
    expect((await get('/counsel/me', firm.owner.cookie)).json()).toMatchObject({ user: { barVerificationStatus: 'VERIFIED' }, lawyerSeat: true });
    // Verifying twice is a 409, like before.
    expect((await post(`/ops/verifications/${firm.owner.userId}/verify`, adminCookie)).statusCode).toBe(409);
  });

  it('reject → REJECTED (revoking the verification); the same session is refused on its very next request; the note is internal', async () => {
    const res = await post(`/ops/verifications/${firm.owner.userId}/reject`, adminCookie, { note: 'Directory shows the licence suspended' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, barVerificationStatus: 'REJECTED', revoked: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: firm.owner.userId } });
    expect(user).toMatchObject({ barVerificationStatus: 'REJECTED', barVerifiedAt: null, barRejectionNote: 'Directory shows the licence suspended' });
    expect(user.barRejectedAt).toBeTruthy();
    expect(user.barNumber).toBeTruthy(); // the number stays; the decision is what changed

    expectRefused(await post('/counsel/matters', firm.owner.cookie, MATTER), 'BAR_REJECTED');
    expectRefused(await get(`/counsel/matters/${caseId}/quote`, firm.owner.cookie), 'BAR_REJECTED');
    expectRefused(await get(`/counsel/matters/${caseId}/packet.pdf`, firm.owner.cookie), 'BAR_REJECTED');
    expect((await get(`/counsel/matters/${caseId}`, firm.owner.cookie)).json()).toMatchObject({ lawyerSeat: false, lawyerSeatReason: 'BAR_REJECTED' });
    const me = await get('/counsel/me', firm.owner.cookie);
    expect(me.json()).toMatchObject({ user: { barVerificationStatus: 'REJECTED' }, lawyerSeat: false });
    expect(JSON.stringify(me.json())).not.toContain('suspended'); // the note never reaches the professional
    // The queue does not list a rejected person; rejecting twice is a 409.
    expect((await get('/ops/verifications', adminCookie)).json().verifications.map((v: { id: string }) => v.id)).not.toContain(firm.owner.userId);
    expect((await post(`/ops/verifications/${firm.owner.userId}/reject`, adminCookie, { note: 'again' })).statusCode).toBe(409);
    // Audited under the attorney's tenant, never with the bar number.
    const audit = await prisma.auditLog.findMany({ where: { action: 'BAR_VERIFICATION', caseId: `verification:${firm.owner.userId}` }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => (a.details as { op: string }).op)).toEqual(['verified', 'rejected']);
    expect(audit[1].details).toMatchObject({ op: 'rejected', revoked: true, after: { barVerificationStatus: 'REJECTED' } });
    expect(JSON.stringify(audit.map((a) => a.details))).not.toContain(user.barNumber!);
  });

  it('re-verify → VERIFIED again and the routes reopen; the rejection note is cleared', async () => {
    const res = await post(`/ops/verifications/${firm.owner.userId}/verify`, adminCookie);
    expect(res.statusCode).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: firm.owner.userId } })).toMatchObject({ barVerificationStatus: 'VERIFIED', barRejectedAt: null, barRejectionNote: null });
    expect((await get(`/counsel/matters/${caseId}/quote`, firm.owner.cookie)).statusCode).toBe(200);
    expect((await get(`/counsel/matters/${caseId}`, firm.owner.cookie)).json()).toMatchObject({ lawyerSeat: true });
  });

  it('an invited attorney has no bar number: PATCH /counsel/me adds one (PENDING) and the queue lists them; a verified number is not changed there', async () => {
    const invited = await seat(firm, 'invited', 'ATTORNEY', 'NONE');
    expectRefused(await post('/counsel/matters', invited.cookie, MATTER), 'BAR_PENDING');
    expect((await get('/ops/verifications', adminCookie)).json().verifications.map((v: { id: string }) => v.id)).not.toContain(invited.userId); // no number yet
    expect((await patch('/counsel/me', invited.cookie, { barNumber: '' })).statusCode).toBe(400);
    const added = await patch('/counsel/me', invited.cookie, { barNumber: '24077777' });
    expect(added.statusCode).toBe(200);
    expect(added.json()).toMatchObject({ ok: true, user: { barNumber: '24077777', barState: 'TX', barVerificationStatus: 'PENDING' } });
    const queue = (await get('/ops/verifications', adminCookie)).json().verifications as Array<{ id: string; lawyerPracticeType: boolean; seat: string }>;
    expect(queue.find((v) => v.id === invited.userId)).toMatchObject({ lawyerPracticeType: true, seat: 'ATTORNEY' });
    expectRefused(await post('/counsel/matters', invited.cookie, MATTER), 'BAR_PENDING');
    // Once verified, the number is staff's to change.
    expect((await post(`/ops/verifications/${invited.userId}/verify`, adminCookie)).statusCode).toBe(200);
    expect((await patch('/counsel/me', invited.cookie, { barNumber: '24000000' })).statusCode).toBe(409);
    expect((await post('/counsel/matters', invited.cookie, { ...MATTER, clientInitials: 'ef' })).statusCode).toBe(201);
  });

  it('an `investigator` practice type signs up PENDING, shows in the queue as a non-lawyer practice, and cannot be verified as a lawyer', async () => {
    const inv = await signup('invsignup', { practiceType: 'investigator' });
    tenants.push(inv.tenantId);
    expect(inv.body).toMatchObject({ barVerificationStatus: 'PENDING' });
    const queue = (await get('/ops/verifications', adminCookie)).json().verifications as Array<{ id: string; lawyerPracticeType: boolean; practiceType: string }>;
    expect(queue.find((v) => v.id === inv.owner.userId)).toMatchObject({ practiceType: 'investigator', lawyerPracticeType: false });
    const res = await post(`/ops/verifications/${inv.owner.userId}/verify`, adminCookie);
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('NOT_A_LAWYER_PRACTICE');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: inv.owner.userId } })).barVerificationStatus).toBe('PENDING');
    // Declining it is the intended path; the account stays for the invite flow.
    expect((await post(`/ops/verifications/${inv.owner.userId}/reject`, adminCookie, { note: 'Investigator — join by invitation' })).statusCode).toBe(200);
  });
});
