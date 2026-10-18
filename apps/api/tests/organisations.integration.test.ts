/**
 * Identity expand step (persona_rollout_plan.md §5 A) — live Postgres.
 *  A1  the api route matrix per persona (incl. anonymous)
 *  A2  (web: Landing.test.tsx) — here: sign-up produces a PROFESSIONAL whose
 *      role column can never open a staff surface
 *  A3  demotion is refused on the NEXT request with the same session token
 *  A4  the migration's backfill, re-run against users created in the old shape
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { fastify } from '../src/index';
import prisma, { effectiveStaffGrants, effectiveAccountKind } from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { registerAuth } from '../src/plugins/auth';
import { requireGrant, requireAccountKind } from '../src/plugins/guards';

const run = `org_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;
const get = (url: string, cookie?: string) =>
  fastify.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });

let staffTenant: string;
let familyTenant: string;
let adminId: string;
let supportId: string;
let reviewerId: string;
let familyId: string;
let proId: string;
let proTenant: string;
let proOrgId: string;
const cookies: Record<string, string | undefined> = {};

const SIGNUP = {
  email: `${run}_counsel@example.com`,
  password: 'CorrectHorse9Battery!',
  name: 'Dana Reyes',
  barNumber: '24011111',
  practiceType: 'writ',
};

beforeAll(async () => {
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  familyTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  // Old shape on purpose: role only, accountKind left at the column default.
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, tenantId: staffTenant, role: 'ADMIN' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@example.com`, tenantId: staffTenant, role: 'SUPPORT' } })).id;
  reviewerId = (await prisma.user.create({ data: { email: `${run}_reviewer@example.com`, tenantId: staffTenant, role: 'ATTORNEY' } })).id;
  familyId = (await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: familyTenant, role: 'CLIENT' } })).id;
  cookies.admin = await cookieFor(adminId, staffTenant, 'ADMIN');
  cookies.support = await cookieFor(supportId, staffTenant, 'SUPPORT');
  cookies.reviewer = await cookieFor(reviewerId, staffTenant, 'ATTORNEY');
  cookies.family = await cookieFor(familyId, familyTenant, 'CLIENT');

  const res = await fastify.inject({ method: 'POST', url: '/counsel/signup', payload: SIGNUP });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  proId = body.userId;
  proOrgId = body.organisationId;
  proTenant = (await prisma.user.findUniqueOrThrow({ where: { id: proId } })).tenantId;
  cookies.professional = await cookieFor(proId, proTenant, 'CLIENT');
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: run } } });
  await prisma.tenant.deleteMany({ where: { name: { contains: run } } });
  await prisma.tenant.deleteMany({ where: { id: proTenant } });
  await prisma.$disconnect();
});

describe('POST /counsel/signup', () => {
  it('creates tenant + organisation + PROFESSIONAL user (role CLIENT) + OWNER membership, bar unverified, audited', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: proId }, include: { memberships: true, grants: true } });
    expect(user).toMatchObject({
      email: SIGNUP.email, name: 'Dana Reyes', role: 'CLIENT', accountKind: 'PROFESSIONAL',
      barNumber: '24011111', barState: 'TX', practiceType: 'writ', barVerifiedAt: null, barVerifiedBy: null,
    });
    expect(user.passwordHash).toBeTruthy();
    expect(user.grants).toEqual([]);
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0]).toMatchObject({ organisationId: proOrgId, tenantId: proTenant, role: 'OWNER' });

    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: proOrgId } });
    expect(org).toMatchObject({ tenantId: proTenant, kind: 'FIRM', name: 'Dana Reyes', pilot: false, allowanceRecords: 0, isTest: false });
    expect(await prisma.user.count({ where: { tenantId: proTenant } })).toBe(1);

    const audit = await prisma.auditLog.findFirst({ where: { caseId: `account:${proId}`, action: 'ACCOUNT_SIGNUP' } });
    expect(audit).toBeTruthy();
    expect(audit!.tenantId).toBe(proTenant);
    expect(JSON.stringify(audit!.details)).not.toContain('24011111');
    expect(audit!.details).toMatchObject({ organisationId: proOrgId, organisationKind: 'FIRM', practiceType: 'writ' });
  });

  it('honours organisationName, organisationKind and a lower-case bar state', async () => {
    const email = `${run}_pd@example.com`;
    const res = await fastify.inject({
      method: 'POST', url: '/counsel/signup',
      payload: { ...SIGNUP, email, barState: 'tx', practiceType: 'pd', organisationName: 'Bexar County Public Defender', organisationKind: 'PD_OFFICE' },
    });
    expect(res.statusCode).toBe(200);
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: res.json().organisationId } });
    expect(org).toMatchObject({ kind: 'PD_OFFICE', name: 'Bexar County Public Defender' });
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u).toMatchObject({ barState: 'TX', practiceType: 'pd', accountKind: 'PROFESSIONAL' });
    await prisma.user.delete({ where: { id: u.id } }); // cascades to the membership
    await prisma.tenant.delete({ where: { id: org.tenantId } }); // cascades to the organisation
  });

  it('a duplicate email answers the same enumeration-safe shape as /buy/account and creates nothing', async () => {
    const before = await prisma.user.count({ where: { email: { contains: run } } });
    const res = await fastify.inject({ method: 'POST', url: '/counsel/signup', payload: { ...SIGNUP, email: SIGNUP.email.toUpperCase() } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await prisma.user.count({ where: { email: { contains: run } } })).toBe(before);
  });

  it('validates like /buy/account: weak password, missing bar number, unknown practice type, family org kind', async () => {
    const post = (payload: Record<string, unknown>) => fastify.inject({ method: 'POST', url: '/counsel/signup', payload });
    expect((await post({ ...SIGNUP, email: `${run}_w@example.com`, password: 'short' })).statusCode).toBe(400);
    expect((await post({ ...SIGNUP, email: `${run}_w@example.com`, barNumber: '' })).statusCode).toBe(400);
    expect((await post({ ...SIGNUP, email: `${run}_w@example.com`, practiceType: 'wizard' })).statusCode).toBe(400);
    expect((await post({ ...SIGNUP, email: `${run}_w@example.com`, organisationKind: 'FAMILY' })).statusCode).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: `${run}_w@example.com` } })).toBeNull();
  });
});

describe('GET /counsel/me', () => {
  it('returns the professional, their organisation, their seat and barVerified', async () => {
    const res = await get('/counsel/me', cookies.professional);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { id: proId, email: SIGNUP.email, barNumber: '24011111', barState: 'TX', practiceType: 'writ', barVerified: false, barVerifiedAt: null },
      organisation: { id: proOrgId, kind: 'FIRM', name: 'Dana Reyes', pilot: false, allowanceRecords: 0 },
      membership: { role: 'OWNER' },
    });
  });

  it('barVerified flips when staff verify the number', async () => {
    await prisma.user.update({ where: { id: proId }, data: { barVerifiedAt: new Date(), barVerifiedBy: adminId } });
    expect((await get('/counsel/me', cookies.professional)).json().user.barVerified).toBe(true);
  });
});

describe('A1 — api route matrix', () => {
  const ROUTES = ['/counsel/me', '/me', '/ops/requests', '/qa/queue'] as const;
  const MATRIX: Record<string, [number, number, number, number]> = {
    anonymous:    [401, 401, 401, 401],
    family:       [403, 200, 403, 403],
    professional: [200, 200, 403, 403],
    admin:        [403, 200, 200, 200],
    support:      [403, 200, 200, 403],
    reviewer:     [403, 200, 403, 200],
  };
  for (const [who, expected] of Object.entries(MATRIX)) {
    it(`${who}: ${ROUTES.map((r, i) => `${r}=${expected[i]}`).join(' ')}`, async () => {
      const statuses = await Promise.all(ROUTES.map(async (r) => (await get(r, cookies[who])).statusCode));
      expect(statuses).toEqual(expected);
    });
  }

  it('request.auth carries accountKind and grants read from the database', async () => {
    const probe = Fastify();
    registerAuth(probe);
    probe.get('/whoami', async (request) => ({ accountKind: request.auth.accountKind, grants: request.auth.grants, role: request.auth.role }));
    const who = async (cookie?: string) => (await probe.inject({ method: 'GET', url: '/whoami', headers: cookie ? { cookie } : {} })).json();
    expect(await who(cookies.admin)).toEqual({ accountKind: 'STAFF', grants: ['ADMIN'], role: 'ADMIN' });
    expect(await who(cookies.support)).toEqual({ accountKind: 'STAFF', grants: ['SUPPORT'], role: 'SUPPORT' });
    expect(await who(cookies.reviewer)).toEqual({ accountKind: 'STAFF', grants: ['REVIEWER'], role: 'ATTORNEY' });
    expect(await who(cookies.family)).toEqual({ accountKind: 'FAMILY', grants: [], role: 'CLIENT' });
    expect(await who(cookies.professional)).toEqual({ accountKind: 'PROFESSIONAL', grants: [], role: 'CLIENT' });
    await probe.close();
  });

  it('a PROFESSIONAL is refused every staff prefix even if the role column AND the token say ATTORNEY', async () => {
    await prisma.user.update({ where: { id: proId }, data: { role: 'ATTORNEY' } });
    const forged = await cookieFor(proId, proTenant, 'ATTORNEY');
    try {
      expect((await get('/qa/queue', forged)).statusCode).toBe(403);
      expect((await get('/ops/requests', forged)).statusCode).toBe(403);
      expect((await get('/permissions/users', forged)).statusCode).toBe(403);
      expect((await get('/counsel/me', forged)).statusCode).toBe(200);
    } finally {
      await prisma.user.update({ where: { id: proId }, data: { role: 'CLIENT' } });
    }
  });
});

describe('A3 — demotion refused on the next request, token unchanged', () => {
  it('a revoked staff grant is refused by requireGrant on the very next call', async () => {
    const probe = Fastify();
    registerAuth(probe);
    probe.get('/admin-only', { preHandler: requireGrant('ADMIN') }, async () => ({ ok: true }));
    probe.get('/support-or-admin', { preHandler: requireGrant('SUPPORT') }, async () => ({ ok: true }));
    probe.get('/counsel-only', { preHandler: requireAccountKind('PROFESSIONAL') }, async () => ({ ok: true }));
    const hit = async (url: string, cookie?: string) => (await probe.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })).statusCode;

    // Old shape (no grant rows): the role decides, as the gates do today.
    expect(await hit('/admin-only', cookies.admin)).toBe(200);
    expect(await hit('/support-or-admin', cookies.admin)).toBe(200); // ADMIN ⊇ SUPPORT
    expect(await hit('/admin-only', cookies.support)).toBe(403);
    expect(await hit('/support-or-admin', cookies.support)).toBe(200);
    expect(await hit('/admin-only', cookies.professional)).toBe(403);
    expect(await hit('/counsel-only', cookies.admin)).toBe(403);
    expect(await hit('/counsel-only', cookies.professional)).toBe(200);
    expect(await hit('/admin-only')).toBe(401);

    // Backfilled shape: a grant row exists; revoking it is a timestamp.
    const grant = await prisma.staffGrant.create({ data: { userId: adminId, kind: 'ADMIN', grantedBy: 'test' } });
    expect(await hit('/admin-only', cookies.admin)).toBe(200);
    await prisma.staffGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    expect(await hit('/admin-only', cookies.admin)).toBe(403);
    expect(await hit('/support-or-admin', cookies.admin)).toBe(403);
    // Re-granting restores access on the next call too.
    await prisma.staffGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
    expect(await hit('/admin-only', cookies.admin)).toBe(200);
    await probe.close();
  });

  it("removing a professional's membership makes GET /counsel/me 403 on the very next request", async () => {
    expect((await get('/counsel/me', cookies.professional)).statusCode).toBe(200);
    await prisma.membership.deleteMany({ where: { userId: proId } });
    const res = await get('/counsel/me', cookies.professional);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/seat/i);
    // Setting the account kind back to FAMILY (the other demotion) is refused too.
    await prisma.membership.create({ data: { organisationId: proOrgId, tenantId: proTenant, userId: proId, role: 'OWNER' } });
    expect((await get('/counsel/me', cookies.professional)).statusCode).toBe(200);
    await prisma.user.update({ where: { id: proId }, data: { accountKind: 'FAMILY' } });
    expect((await get('/counsel/me', cookies.professional)).statusCode).toBe(403);
    await prisma.user.update({ where: { id: proId }, data: { accountKind: 'PROFESSIONAL' } });
  });
});

describe('A4 — expand is safe: the migration backfill against old-shape rows', () => {
  const sql = readFileSync(
    path.resolve(__dirname, '../../../packages/database/prisma/migrations/20261019000029_organisations/migration.sql'),
    'utf8'
  );
  const block = sql.split('-- BACKFILL BEGIN')[1]?.split('-- BACKFILL END')[0];
  const statements = (block ?? '')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  const runBackfill = async () => { for (const s of statements) await prisma.$executeRawUnsafe(s); };

  it('maps every Role to the right accountKind and grant, skips deleted rows, and is idempotent', async () => {
    expect(statements).toHaveLength(2);
    const t = (await prisma.tenant.create({ data: { name: `${run}_backfill` } })).id;
    const mk = (tag: string, data: Record<string, unknown>) =>
      prisma.user.create({ data: { email: `${run}_bf_${tag}@example.com`, tenantId: t, ...(data as object) } as never });
    const ids = {
      admin: (await mk('admin', { role: 'ADMIN' })).id,
      support: (await mk('support', { role: 'SUPPORT' })).id,
      attorney: (await mk('attorney', { role: 'ATTORNEY' })).id,
      viewer: (await mk('viewer', { role: 'VIEWER' })).id,
      family: (await mk('family', { role: 'CLIENT' })).id,
      pro: (await mk('pro', { role: 'CLIENT', accountKind: 'PROFESSIONAL' })).id,
      gone: (await mk('gone', { role: 'ADMIN', deletedAt: new Date() })).id,
    };
    // Before: every old-shape row sits at the column default.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } })).accountKind).toBe('FAMILY');

    await runBackfill();
    const after = async (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, include: { grants: true } });
    expect((await after(ids.admin))).toMatchObject({ accountKind: 'STAFF', grants: [expect.objectContaining({ kind: 'ADMIN', revokedAt: null })] });
    expect((await after(ids.support))).toMatchObject({ accountKind: 'STAFF', grants: [expect.objectContaining({ kind: 'SUPPORT' })] });
    expect((await after(ids.attorney))).toMatchObject({ accountKind: 'STAFF', grants: [expect.objectContaining({ kind: 'REVIEWER' })] });
    expect((await after(ids.viewer))).toMatchObject({ accountKind: 'STAFF', grants: [] });
    expect((await after(ids.family))).toMatchObject({ accountKind: 'FAMILY', grants: [] });
    expect((await after(ids.pro))).toMatchObject({ accountKind: 'PROFESSIONAL', grants: [] });
    expect((await after(ids.gone))).toMatchObject({ accountKind: 'STAFF', grants: [] });
    expect((await after(ids.admin)).grants[0].grantedBy).toMatch(/^migration:/);

    // Idempotent: a second run changes nothing and conflicts with nothing.
    const grantsBefore = await prisma.staffGrant.count({ where: { userId: { in: Object.values(ids) } } });
    await runBackfill();
    expect(await prisma.staffGrant.count({ where: { userId: { in: Object.values(ids) } } })).toBe(grantsBefore);
    expect((await after(ids.pro)).accountKind).toBe('PROFESSIONAL');

    // The helpers read the backfilled shape the same way the gates will.
    const admin = await after(ids.admin);
    expect(effectiveStaffGrants(admin)).toEqual(['ADMIN']);
    expect(effectiveAccountKind(admin)).toBe('STAFF');
    expect(effectiveStaffGrants(await after(ids.pro))).toEqual([]);
    // And an old-shape row that the backfill has NOT touched yet still reads as staff.
    expect(effectiveAccountKind({ role: 'SUPPORT', accountKind: 'FAMILY' })).toBe('STAFF');
    expect(effectiveStaffGrants({ role: 'SUPPORT', accountKind: 'FAMILY', grants: [] })).toEqual(['SUPPORT']);
  });
});
