/**
 * I2 — staff grants on organisations (persona_rollout_plan.md §4, §5 I;
 * staff_console.md §11): the PD pilot sets exactly 15 records for 90 days,
 * public-interest sets 25 for a year, SUPPORT is refused both, every write
 * is audited; the list, the edit and the pilot metrics. Live Postgres.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { PILOT_RECORDS, PILOT_DAYS, PUBLIC_INTEREST_RECORDS_PER_YEAR } from '@hg/case-lifecycle';

const run = `opsorg_${Date.now()}`;
let staffTenant: string;
let adminId: string;
let supportId: string;
let adminCookie: string;
let supportCookie: string;
let familyCookie: string;
let officeTenant: string;
let officeId: string;
let officeOwnerId: string;
let officeCookie: string;
let clinicTenant: string;
let clinicId: string;
let officeCaseId: string;

beforeAll(async () => {
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, tenantId: staffTenant, role: 'ADMIN' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@example.com`, tenantId: staffTenant, role: 'SUPPORT' } })).id;
  const familyId = (await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: staffTenant, role: 'CLIENT' } })).id;
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId: staffTenant, role: 'ADMIN' })}`;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: supportId, tenantId: staffTenant, role: 'SUPPORT' })}`;
  familyCookie = `next-auth.session-token=${await encodeSessionToken({ userId: familyId, tenantId: staffTenant, role: 'CLIENT' })}`;

  officeTenant = (await prisma.tenant.create({ data: { name: `${run}_office` } })).id;
  officeId = (await prisma.organisation.create({ data: { tenantId: officeTenant, kind: 'PD_OFFICE', name: `${run} Bexar PD` } })).id;
  officeOwnerId = (await prisma.user.create({ data: { email: `${run}_pd@example.com`, tenantId: officeTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id;
  const inv = (await prisma.user.create({ data: { email: `${run}_inv@example.com`, tenantId: officeTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id;
  await prisma.membership.create({ data: { organisationId: officeId, tenantId: officeTenant, userId: officeOwnerId, role: 'OWNER' } });
  await prisma.membership.create({ data: { organisationId: officeId, tenantId: officeTenant, userId: inv, role: 'INVESTIGATOR' } });
  officeCookie = `next-auth.session-token=${await encodeSessionToken({ userId: officeOwnerId, tenantId: officeTenant, role: 'CLIENT' })}`;
  officeCaseId = (await prisma.case.create({
    data: { title: `${run} matter`, tenantId: officeTenant, status: 'ANALYZING', accessList: { create: { userId: officeOwnerId, role: 'ADMIN' } } },
  })).id;
  await prisma.analysisRun.create({ data: { caseId: officeCaseId, tenantId: officeTenant, modelConfig: {} } });

  clinicTenant = (await prisma.tenant.create({ data: { name: `${run}_clinic` } })).id;
  clinicId = (await prisma.organisation.create({ data: { tenantId: clinicTenant, kind: 'CLINIC', name: `${run} Innocence Clinic` } })).id;
});

afterAll(async () => {
  await prisma.analysisRun.deleteMany({ where: { tenantId: officeTenant } });
  await prisma.caseAccess.deleteMany({ where: { caseId: officeCaseId } });
  await prisma.case.deleteMany({ where: { tenantId: officeTenant } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [staffTenant, officeTenant, clinicTenant] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [staffTenant, officeTenant, clinicTenant] } } });
  await prisma.$disconnect();
});

const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe('GET /ops/organisations', () => {
  it('lists kind, name, pilot, allowance, isTest and member count for Admin and Support; refuses everyone else', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/ops/organisations', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const office = (res.json().organisations as Record<string, unknown>[]).find((o) => o.id === officeId);
    expect(office).toMatchObject({
      kind: 'PD_OFFICE', name: `${run} Bexar PD`, pilot: false, allowanceRecords: 0, publicInterest: false, isTest: false, memberCount: 2, tenantId: officeTenant,
    });
    expect((await fastify.inject({ method: 'GET', url: '/ops/organisations', headers: { cookie: supportCookie } })).statusCode).toBe(200);
    expect((await fastify.inject({ method: 'GET', url: '/ops/organisations', headers: { cookie: familyCookie } })).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'GET', url: '/ops/organisations', headers: { cookie: officeCookie } })).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'GET', url: '/ops/organisations' })).statusCode).toBe(401);
  });

  it('filters by kind and shows one organisation with its members and pending invitations', async () => {
    const clinics = await fastify.inject({ method: 'GET', url: '/ops/organisations?kind=CLINIC', headers: { cookie: supportCookie } });
    const ids = (clinics.json().organisations as { id: string }[]).map((o) => o.id);
    expect(ids).toContain(clinicId);
    expect(ids).not.toContain(officeId);
    const one = await fastify.inject({ method: 'GET', url: `/ops/organisations/${officeId}`, headers: { cookie: supportCookie } });
    expect(one.statusCode).toBe(200);
    expect(one.json().organisation.id).toBe(officeId);
    expect(one.json().members.map((m: { role: string }) => m.role).sort()).toEqual(['INVESTIGATOR', 'OWNER']);
    expect(one.json().invitations).toEqual([]);
    expect((await fastify.inject({ method: 'GET', url: `/ops/organisations/nope`, headers: { cookie: adminCookie } })).statusCode).toBe(404);
  });
});

describe('I2 — pilot and public-interest grants', () => {
  it(`POST /pilot: SUPPORT 403; ADMIN sets exactly ${PILOT_RECORDS} records and +${PILOT_DAYS} days, audited`, async () => {
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/${officeId}/pilot`, headers: { cookie: supportCookie } })).statusCode).toBe(403);
    const before = new Date();
    const res = await fastify.inject({ method: 'POST', url: `/ops/organisations/${officeId}/pilot`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: officeId } });
    expect(org.pilot).toBe(true);
    expect(org.allowanceRecords).toBe(15);
    expect(org.pilotEndsAt).toBeTruthy();
    expect(daysBetween(before, org.pilotEndsAt!)).toBe(90);
    expect(org.allowanceResetsAt).toEqual(org.pilotEndsAt);
    expect(res.json().organisation).toMatchObject({ pilot: true, allowanceRecords: 15 });

    const audit = await prisma.auditLog.findFirst({ where: { caseId: `organisation:${officeId}`, action: 'ORGANISATION_CHANGE' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(adminId);
    expect(audit!.tenantId).toBe(officeTenant);
    expect(audit!.details).toMatchObject({ op: 'pilot_started', after: { pilot: true, allowanceRecords: 15 } });
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/nope/pilot`, headers: { cookie: adminCookie } })).statusCode).toBe(404);
  });

  it(`POST /public-interest: SUPPORT 403; ADMIN sets ${PUBLIC_INTEREST_RECORDS_PER_YEAR} records resetting in a year, audited`, async () => {
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicId}/public-interest`, headers: { cookie: supportCookie } })).statusCode).toBe(403);
    const before = new Date();
    const res = await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicId}/public-interest`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: clinicId } });
    expect(org.publicInterest).toBe(true);
    expect(org.allowanceRecords).toBe(25);
    expect(org.pilot).toBe(false);
    expect(org.allowanceResetsAt!.getUTCFullYear()).toBe(before.getUTCFullYear() + 1);
    expect(org.allowanceResetsAt!.getUTCMonth()).toBe(before.getUTCMonth());
    const audit = await prisma.auditLog.findFirst({ where: { caseId: `organisation:${clinicId}`, action: 'ORGANISATION_CHANGE' }, orderBy: { createdAt: 'desc' } });
    expect(audit!.details).toMatchObject({ op: 'public_interest_granted', after: { publicInterest: true, allowanceRecords: 25 } });
  });

  it('PATCH edits the profile fields for ADMIN with before/after in the audit row; SUPPORT 403; FAMILY kind and junk 400', async () => {
    const patch = (cookie: string, payload: Record<string, unknown>) =>
      fastify.inject({ method: 'PATCH', url: `/ops/organisations/${officeId}`, headers: { cookie }, payload });
    expect((await patch(supportCookie, { isTest: true })).statusCode).toBe(403);
    expect((await patch(adminCookie, { kind: 'FAMILY' })).statusCode).toBe(400);
    expect((await patch(adminCookie, { allowanceRecords: -1 })).statusCode).toBe(400);
    expect((await patch(adminCookie, {})).statusCode).toBe(400);

    const res = await patch(adminCookie, { isTest: true, legalName: 'Bexar County Public Defender', billingEmail: 'ap@bexar.example', securityContact: 'it@bexar.example', allowanceRecords: 20 });
    expect(res.statusCode).toBe(200);
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: officeId } });
    expect(org).toMatchObject({ isTest: true, legalName: 'Bexar County Public Defender', billingEmail: 'ap@bexar.example', securityContact: 'it@bexar.example', allowanceRecords: 20 });
    const audit = await prisma.auditLog.findFirst({ where: { caseId: `organisation:${officeId}`, action: 'ORGANISATION_CHANGE' }, orderBy: { createdAt: 'desc' } });
    expect(audit!.details).toMatchObject({ op: 'organisation_updated', before: { isTest: false, allowanceRecords: 15 }, after: { isTest: true, allowanceRecords: 20 } });

    // Kind can move (a firm that turns out to be a clinic); dates are ISO strings.
    const kind = await patch(adminCookie, { kind: 'CLINIC', pilot: false, pilotEndsAt: null, allowanceResetsAt: '2027-10-01T00:00:00.000Z' });
    expect(kind.statusCode).toBe(200);
    const after = await prisma.organisation.findUniqueOrThrow({ where: { id: officeId } });
    expect(after.kind).toBe('CLINIC');
    expect(after.pilot).toBe(false);
    expect(after.pilotEndsAt).toBeNull();
    expect(after.allowanceResetsAt?.toISOString()).toBe('2027-10-01T00:00:00.000Z');
    await patch(adminCookie, { kind: 'PD_OFFICE' });
  });

  it('GET /metrics: records opened, analyses run, allowance used/remaining, members, last activity', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/ops/organisations/${officeId}/metrics`, headers: { cookie: supportCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      organisationId: officeId,
      recordsOpened: 1,
      analysesRun: 1,
      allowance: { granted: 20, used: 1, remaining: 19 },
      members: 2,
    });
    expect(res.json().lastActivity).toBeTruthy();
    expect((await fastify.inject({ method: 'GET', url: `/ops/organisations/${officeId}/metrics`, headers: { cookie: officeCookie } })).statusCode).toBe(403);
  });
});
