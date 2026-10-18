/**
 * I1 — the clinic inbox (persona_rollout_plan.md §5 I, share_link_ux.md):
 * a family grants consent naming a clinic and delivers the packet; the
 * clinic's inbox lists it and streams the PDF without the clinic ever
 * uploading; a different clinic sees nothing (404); the flag off is a 404;
 * a revoked consent makes the delivery 410. Live Postgres.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';

const run = `inbox_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role: 'CLIENT' })}`;

interface Org { tenantId: string; orgId: string; ownerId: string; cookie: string }
const mkOrg = async (tag: string, kind: 'CLINIC' | 'FIRM'): Promise<Org> => {
  const tenantId = (await prisma.tenant.create({ data: { name: `${run}_${tag}` } })).id;
  const orgId = (await prisma.organisation.create({ data: { tenantId, kind, name: `${run} ${tag}` } })).id;
  const ownerId = (await prisma.user.create({
    data: { email: `${run}_${tag}@example.com`, name: `${tag} owner`, tenantId, role: 'CLIENT', accountKind: 'PROFESSIONAL' },
  })).id;
  await prisma.membership.create({ data: { organisationId: orgId, tenantId, userId: ownerId, role: 'OWNER' } });
  return { tenantId, orgId, ownerId, cookie: await cookieFor(ownerId, tenantId) };
};

let familyTenant: string;
let familyId: string;
let familyCookie: string;
let caseId: string;
let reportId: string;
let clinicA: Org;
let clinicB: Org;
let firm: Org;
const tenants: string[] = [];

beforeAll(async () => {
  familyTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  familyId = (await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: familyTenant, role: 'CLIENT' } })).id;
  familyCookie = await cookieFor(familyId, familyTenant);
  caseId = (await prisma.case.create({
    data: {
      title: `${run} case`, tenantId: familyTenant, status: 'READY', lane: 'TRIAL', county: 'Bexar', convictionYear: 2019,
      accessList: { create: { userId: familyId, role: 'ADMIN' } },
    },
  })).id;
  reportId = (await prisma.report.create({
    data: { caseId, tenantId: familyTenant, runId: `${run}_run`, versionNo: 1, templateVersion: 'AB-v1', approvedBy: 'qa', findingsSnapshot: { findings: [] } },
  })).id;
  clinicA = await mkOrg('clinicA', 'CLINIC');
  clinicB = await mkOrg('clinicB', 'CLINIC');
  firm = await mkOrg('firm', 'FIRM');
  tenants.push(familyTenant, clinicA.tenantId, clinicB.tenantId, firm.tenantId);
});

afterAll(async () => {
  for (const t of tenants) await clearOverride('clinic_inbox', t, 'test');
  await prisma.packetDelivery.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.consentGrant.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.report.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.caseAccess.deleteMany({ where: { caseId } });
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await prisma.$disconnect();
});

const deliver = (clinicOrganisationId: string, cookie = familyCookie) =>
  fastify.inject({ method: 'POST', url: `/cases/${caseId}/packets/deliver`, headers: { cookie }, payload: { clinicOrganisationId } });
const inbox = (cookie: string) => fastify.inject({ method: 'GET', url: '/counsel/inbox', headers: { cookie } });
const pdf = (deliveryId: string, cookie: string) =>
  fastify.inject({ method: 'GET', url: `/counsel/inbox/${deliveryId}/report.pdf`, headers: { cookie } });

describe('I1 — flag off', () => {
  it('delivery and the inbox are 404 while clinic_inbox is dark for the clinic', async () => {
    expect((await deliver(clinicA.orgId)).statusCode).toBe(404);
    expect((await inbox(clinicA.cookie)).statusCode).toBe(404);
    expect((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/packets/clinics`, headers: { cookie: familyCookie } })).json().clinics).toEqual([]);
  });
});

describe('I1 — consent names the clinic, the family delivers, the clinic reads', () => {
  let deliveryId: string;

  beforeAll(async () => {
    for (const t of [clinicA.tenantId, clinicB.tenantId, firm.tenantId]) await setOverride('clinic_inbox', t, true, 'I1', 'test');
    __invalidateFlagCache();
  });

  it('the clinic picker lists the clinics that are live, never a firm', async () => {
    const res = await fastify.inject({ method: 'GET', url: `/cases/${caseId}/packets/clinics`, headers: { cookie: familyCookie } });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().clinics as { id: string; name: string }[]).map((c) => c.id);
    expect(ids).toContain(clinicA.orgId);
    expect(ids).toContain(clinicB.orgId);
    expect(ids).not.toContain(firm.orgId);
  });

  it('no consent → no delivery (403); consent can name the clinic', async () => {
    expect((await deliver(clinicA.orgId)).statusCode).toBe(403);
    const grant = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent`, headers: { cookie: familyCookie },
      payload: { recipientClass: 'clinic', recipientOrganisationId: clinicA.orgId },
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json().grant).toMatchObject({ recipientClass: 'clinic', recipientOrganisationId: clinicA.orgId, revokedAt: null });
    // Naming a firm as the clinic is refused.
    const bad = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent`, headers: { cookie: familyCookie },
      payload: { recipientClass: 'clinic', recipientOrganisationId: firm.orgId },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('delivers once to the named clinic; the other clinic is refused; the family never uploads anything', async () => {
    expect((await deliver(clinicB.orgId)).statusCode).toBe(403);
    const first = await deliver(clinicA.orgId);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ alreadyDelivered: false, delivery: { reportVersion: 1 } });
    deliveryId = first.json().delivery.id;

    const again = await deliver(clinicA.orgId);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ alreadyDelivered: true, delivery: { id: deliveryId } });

    const rows = await prisma.packetDelivery.findMany({ where: { caseId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId: clinicA.tenantId, organisationId: clinicA.orgId, sourceTenantId: familyTenant, reportId, openedAt: null });
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'packet.delivered' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { caseId, action: 'PACKET_DELIVERY' } })).toBe(1);
    // Only the case's owning family user can deliver.
    expect((await deliver(clinicA.orgId, clinicA.cookie)).statusCode).toBe(403);
  });

  it("the clinic's inbox lists it newest first; the other clinic sees nothing; a firm has no inbox", async () => {
    const a = await inbox(clinicA.cookie);
    expect(a.statusCode).toBe(200);
    expect(a.json().items).toHaveLength(1);
    expect(a.json().items[0]).toMatchObject({ id: deliveryId, caseId, reportVersion: 1, openedAt: null, revoked: false });
    expect(a.json().items[0].caseTitle).toMatch(/Bexar County/);
    expect(a.json().items[0].deliveredAt).toBeTruthy();

    const b = await inbox(clinicB.cookie);
    expect(b.statusCode).toBe(200);
    expect(b.json().items).toEqual([]);

    expect((await inbox(firm.cookie)).statusCode).toBe(403);
    expect((await inbox(familyCookie)).statusCode).toBe(403);
  });

  it('streams the PDF to the named clinic, marks the first open, audits; the other clinic gets 404', async () => {
    const res = await pdf(deliveryId, clinicA.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    const row = await prisma.packetDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(row.openedAt).toBeTruthy();
    expect(row.openedBy).toBe(clinicA.ownerId);
    expect((await inbox(clinicA.cookie)).json().items[0].openedAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { caseId: `delivery:${deliveryId}`, action: 'PACKET_DELIVERY' } })).toBe(1);
    expect(await prisma.caseEvent.count({ where: { caseId, type: 'packet.opened' } })).toBe(1);

    // A second open keeps the first timestamp.
    await pdf(deliveryId, clinicA.cookie);
    expect((await prisma.packetDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).openedAt).toEqual(row.openedAt);

    expect((await pdf(deliveryId, clinicB.cookie)).statusCode).toBe(404);
    expect((await pdf(deliveryId, familyCookie)).statusCode).toBe(403);
  });

  it('a revoked consent makes the delivery 410 and the inbox says so', async () => {
    const revoke = await fastify.inject({
      method: 'POST', url: `/cases/${caseId}/consent/revoke`, headers: { cookie: familyCookie }, payload: { recipientClass: 'clinic' },
    });
    expect(revoke.statusCode).toBe(200);
    expect((await pdf(deliveryId, clinicA.cookie)).statusCode).toBe(410);
    expect((await inbox(clinicA.cookie)).json().items[0].revoked).toBe(true);
    // And the family cannot deliver again without a fresh grant.
    expect((await deliver(clinicA.orgId)).statusCode).toBe(403);
  });
});
