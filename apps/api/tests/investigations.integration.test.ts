/**
 * I4 — investigation requests (persona_rollout_plan.md §3 investigator,
 * §5 I; the Record Desk delivered by hand in January): an INVESTIGATOR
 * member files a chronology request; ops lists it; SUPPORT moves it to
 * IN_PROGRESS; ADMIN marks it DELIVERED with a note; the requester sees the
 * status; another organisation cannot see it; a VIEWER cannot file. Live
 * Postgres.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';

const run = `inv_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role = 'CLIENT') =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;

interface Seat { userId: string; cookie: string }
interface Org { tenantId: string; orgId: string; owner: Seat; investigator: Seat; viewer: Seat }
const mkOrg = async (tag: string): Promise<Org> => {
  const tenantId = (await prisma.tenant.create({ data: { name: `${run}_${tag}` } })).id;
  const orgId = (await prisma.organisation.create({ data: { tenantId, kind: 'PD_OFFICE', name: `${run} ${tag}` } })).id;
  const seat = async (role: 'OWNER' | 'INVESTIGATOR' | 'VIEWER'): Promise<Seat> => {
    const userId = (await prisma.user.create({
      data: { email: `${run}_${tag}_${role.toLowerCase()}@example.com`, name: `${tag} ${role.toLowerCase()}`, tenantId, role: 'CLIENT', accountKind: 'PROFESSIONAL' },
    })).id;
    await prisma.membership.create({ data: { organisationId: orgId, tenantId, userId, role } });
    return { userId, cookie: await cookieFor(userId, tenantId) };
  };
  return { tenantId, orgId, owner: await seat('OWNER'), investigator: await seat('INVESTIGATOR'), viewer: await seat('VIEWER') };
};

let x: Org;
let y: Org;
let z: Org; // record_desk stays dark here
let staffTenant: string;
let adminId: string;
let supportId: string;
let adminCookie: string;
let supportCookie: string;
let xCaseId: string;
let yCaseId: string;
const tenants: string[] = [];

beforeAll(async () => {
  x = await mkOrg('X');
  y = await mkOrg('Y');
  z = await mkOrg('Z');
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'Robbie', tenantId: staffTenant, role: 'ADMIN' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@example.com`, name: 'Dana', tenantId: staffTenant, role: 'SUPPORT' } })).id;
  adminCookie = await cookieFor(adminId, staffTenant, 'ADMIN');
  supportCookie = await cookieFor(supportId, staffTenant, 'SUPPORT');
  xCaseId = (await prisma.case.create({ data: { title: `${run} X matter`, tenantId: x.tenantId, accessList: { create: { userId: x.owner.userId, role: 'ADMIN' } } } })).id;
  yCaseId = (await prisma.case.create({ data: { title: `${run} Y matter`, tenantId: y.tenantId, accessList: { create: { userId: y.owner.userId, role: 'ADMIN' } } } })).id;
  tenants.push(x.tenantId, y.tenantId, z.tenantId, staffTenant);
  for (const t of [x.tenantId, y.tenantId]) await setOverride('record_desk', t, true, 'I4', 'test');
  __invalidateFlagCache();
});

afterAll(async () => {
  for (const t of [x.tenantId, y.tenantId]) await clearOverride('record_desk', t, 'test');
  await prisma.investigationRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.caseAccess.deleteMany({ where: { caseId: { in: [xCaseId, yCaseId] } } });
  await prisma.case.deleteMany({ where: { id: { in: [xCaseId, yCaseId] } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

const file = (cookie: string, payload: Record<string, unknown>) =>
  fastify.inject({ method: 'POST', url: '/counsel/investigations', headers: { cookie }, payload });
const mine = (cookie: string) => fastify.inject({ method: 'GET', url: '/counsel/investigations', headers: { cookie } });
const opsList = (cookie: string, qs = '') => fastify.inject({ method: 'GET', url: `/ops/investigations${qs}`, headers: { cookie } });
const opsPatch = (cookie: string, id: string, payload: Record<string, unknown>) =>
  fastify.inject({ method: 'PATCH', url: `/ops/investigations/${id}`, headers: { cookie }, payload });

const REQUEST = { kind: 'CHRONOLOGY', pages: 1200, dueBy: '2027-02-15', note: 'Chronology of the custodial interrogation, RR vols 3-5.' };

describe('I4 — investigation requests', () => {
  let requestId: string;

  it('flag off → 404; a VIEWER cannot file (403); a case from another tenant is 404', async () => {
    expect((await file(z.investigator.cookie, REQUEST)).statusCode).toBe(404);
    expect((await mine(z.owner.cookie)).statusCode).toBe(404);
    expect((await file(x.viewer.cookie, REQUEST)).statusCode).toBe(403);
    expect((await file(x.investigator.cookie, { ...REQUEST, caseId: yCaseId })).statusCode).toBe(404);
    expect((await file(x.investigator.cookie, { ...REQUEST, kind: 'TRIAGE' })).statusCode).toBe(400);
    expect((await file(x.investigator.cookie, { ...REQUEST, note: '' })).statusCode).toBe(400);
  });

  it('an INVESTIGATOR files a chronology request against a matter of the office', async () => {
    const res = await file(x.investigator.cookie, { ...REQUEST, caseId: xCaseId });
    expect(res.statusCode).toBe(200);
    expect(res.json().request).toMatchObject({ kind: 'CHRONOLOGY', status: 'OPEN', pages: 1200, caseId: xCaseId, requestedBy: x.investigator.userId });
    requestId = res.json().request.id;
    const row = await prisma.investigationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row).toMatchObject({ tenantId: x.tenantId, organisationId: x.orgId, dueBy: new Date('2027-02-15T00:00:00.000Z'), assignedTo: null, deliveredAt: null });
    expect(await prisma.auditLog.count({ where: { caseId: `investigation:${requestId}`, action: 'INVESTIGATION_REQUEST' } })).toBe(1);
    // An attorney-less OWNER can file too; the case is optional.
    expect((await file(x.owner.cookie, { kind: 'OTHER', note: 'Pull the DPS lab file.' })).statusCode).toBe(200);
  });

  it('the organisation sees its own requests; another organisation sees none of them', async () => {
    const ours = await mine(x.investigator.cookie);
    expect(ours.statusCode).toBe(200);
    expect(ours.json().requests.map((r: { id: string }) => r.id)).toContain(requestId);
    expect(ours.json().requests).toHaveLength(2);
    expect((await mine(x.viewer.cookie)).statusCode).toBe(200); // a viewer may read
    const theirs = await mine(y.owner.cookie);
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json().requests).toEqual([]);
  });

  it('ops lists it for Admin and Support with the organisation and requester; filters by status', async () => {
    const res = await opsList(supportCookie);
    expect(res.statusCode).toBe(200);
    const row = (res.json().requests as Record<string, unknown>[]).find((r) => r.id === requestId);
    expect(row).toMatchObject({ kind: 'CHRONOLOGY', status: 'OPEN', organisation: { id: x.orgId, name: `${run} X`, kind: 'PD_OFFICE' }, requester: { name: 'X investigator' } });
    expect((row!.caseLabel as string)).toMatch(/X matter/);
    expect((await opsList(adminCookie, '?status=DELIVERED')).json().requests.map((r: { id: string }) => r.id)).not.toContain(requestId);
    expect((await opsList(x.owner.cookie)).statusCode).toBe(403);
  });

  it('SUPPORT moves it to IN_PROGRESS (not DECLINED); ADMIN marks DELIVERED with a note; both audited', async () => {
    expect((await opsPatch(supportCookie, requestId, { status: 'DECLINED' })).statusCode).toBe(403);
    expect((await opsPatch(supportCookie, requestId, { status: 'OPEN' })).statusCode).toBe(403);
    const inProgress = await opsPatch(supportCookie, requestId, { status: 'IN_PROGRESS', assignedTo: supportId });
    expect(inProgress.statusCode).toBe(200);
    expect(inProgress.json().request).toMatchObject({ status: 'IN_PROGRESS', assignedTo: supportId });

    expect((await opsPatch(adminCookie, requestId, { status: 'SHIPPED' })).statusCode).toBe(400);
    expect((await opsPatch(adminCookie, 'nope', { status: 'DELIVERED' })).statusCode).toBe(404);
    const delivered = await opsPatch(adminCookie, requestId, { status: 'DELIVERED', note: 'Chronology emailed to counsel 2027-02-10.' });
    expect(delivered.statusCode).toBe(200);
    const row = await prisma.investigationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe('DELIVERED');
    expect(row.staffNote).toBe('Chronology emailed to counsel 2027-02-10.');
    expect(row.deliveredAt).toBeTruthy();
    const audits = await prisma.auditLog.findMany({ where: { caseId: `investigation:${requestId}`, action: 'INVESTIGATION_REQUEST' }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => (a.details as { op: string }).op)).toEqual(['request_filed', 'status_changed', 'status_changed']);
    expect(audits[1].userId).toBe(supportId);
    expect(audits[2].details).toMatchObject({ before: 'IN_PROGRESS', after: 'DELIVERED' });
    expect(audits[2].tenantId).toBe(x.tenantId);
  });

  it('the requester sees the status and the note; the other organisation still sees nothing', async () => {
    const ours = await mine(x.investigator.cookie);
    const row = (ours.json().requests as Record<string, unknown>[]).find((r) => r.id === requestId);
    expect(row).toMatchObject({ status: 'DELIVERED', staffNote: 'Chronology emailed to counsel 2027-02-10.' });
    expect(row!.deliveredAt).toBeTruthy();
    expect((await mine(y.investigator.cookie)).json().requests).toEqual([]);
  });
});
