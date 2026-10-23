/**
 * U4-c — staff-verified clinics and what the inbox delivers (UPL review
 * 2026-10-23, recommendation 4, finding P3). Live Postgres.
 *
 *  - a self-declared CLINIC is not in the picker, cannot receive a delivery
 *    (404) and has no inbox (403 CLINIC_UNVERIFIED), flag on or not;
 *  - an Admin verifies it with the supervising attorney's bar number
 *    (POST /ops/organisations/:id/clinic-verify), audited without the number;
 *  - the verified clinic receives the ATTORNEY packet: the PDF text carries
 *    "For the attorney" and the Part B text, and lacks the bottom line and
 *    the family's Part A text; delivery and open are audited.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { bottomLineFor } from '../src/services/bottom-line.service';

const run = `u4clinic_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role = 'CLIENT') =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;

/** The text of a PDFKit document whether or not its streams are deflated. */
function pdfText(buf: Buffer): string {
  const raw = buf.toString('latin1');
  const streams: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const bytes = Buffer.from(m[1], 'latin1');
    try {
      streams.push(inflateSync(bytes).toString('latin1'));
    } catch {
      streams.push(m[1]);
    }
  }
  const lines: string[] = [];
  for (const content of streams) {
    for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
      for (const tj of block[1].matchAll(/\[([^\]]*)\]\s*TJ/g)) {
        const parts: string[] = [];
        for (const hex of tj[1].matchAll(/<([0-9a-fA-F]*)>/g)) parts.push(Buffer.from(hex[1], 'hex').toString('latin1'));
        lines.push(parts.join(''));
      }
    }
  }
  return lines.join('\n').replace(/\s+/g, ' ');
}

const PART_A = 'The judge let in a statement the lawyer objected to, which the family should know about.';
const PART_B = 'Hearsay objection overruled; preserved by objection and ruling at RR3 214.';

let staffTenant: string;
let adminCookie: string;
let supportCookie: string;
let familyTenant: string;
let familyCookie: string;
let caseId: string;
let reportId: string;
let clinicTenant: string;
let clinicOrgId: string;
let clinicCookie: string;
const tenants: string[] = [];

const deliver = (clinicOrganisationId: string) => fastify.inject({ method: 'POST', url: `/cases/${caseId}/packets/deliver`, headers: { cookie: familyCookie }, payload: { clinicOrganisationId } });
/** The picker is global (other suites light their own clinics in parallel): only this run's clinic is asserted. */
const ourClinics = async () => ((await fastify.inject({ method: 'GET', url: `/cases/${caseId}/packets/clinics`, headers: { cookie: familyCookie } })).json().clinics as { id: string; name: string }[]).filter((c) => c.id === clinicOrgId);
const inbox = () => fastify.inject({ method: 'GET', url: '/counsel/inbox', headers: { cookie: clinicCookie } });
const pdf = (deliveryId: string) => fastify.inject({ method: 'GET', url: `/counsel/inbox/${deliveryId}/report.pdf`, headers: { cookie: clinicCookie } });

beforeAll(async () => {
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'Robbie', tenantId: staffTenant, role: 'ADMIN' } });
  const support = await prisma.user.create({ data: { email: `${run}_support@example.com`, name: 'Dana', tenantId: staffTenant, role: 'SUPPORT' } });
  adminCookie = await cookieFor(admin.id, staffTenant, 'ADMIN');
  supportCookie = await cookieFor(support.id, staffTenant, 'SUPPORT');

  familyTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  const family = await prisma.user.create({ data: { email: `${run}_family@example.com`, tenantId: familyTenant, role: 'CLIENT' } });
  familyCookie = await cookieFor(family.id, familyTenant);
  caseId = (await prisma.case.create({
    data: { title: `${run} the family's own title`, tenantId: familyTenant, status: 'READY', lane: 'TRIAL', county: 'Bexar', convictionYear: 2019, accessList: { create: { userId: family.id, role: 'ADMIN' } } },
  })).id;
  // One finding whose citation verifies (FR-7), so the attorney packet prints it.
  const doc = await prisma.document.create({ data: { filename: 'RR_Vol3.pdf', caseId, s3Key: `cases/${caseId}/rr3.pdf`, volumeKind: 'REPORTER', volumeLabel: 'RR vol. 3', volumeIndex: 3, volumeCount: 3 } });
  const chunk = await prisma.documentChunk.create({ data: { documentId: doc.id, content: `${run} Objection, Your Honor, hearsay. THE COURT: Overruled.`, metadata: {} } });
  const analysisRun = await prisma.analysisRun.create({ data: { caseId, tenantId: familyTenant, runNo: 1, modelConfig: {}, completedAt: new Date() } });
  const finding = await prisma.finding.create({
    data: {
      runId: analysisRun.id, caseId, tenantId: familyTenant, stableKey: `${run}_pe`, category: 'preserved_error', screen: 'preserved_error', severity: 'dispositive', confidence: 0.9,
      preserved: 'yes', harmStandard: 'constitutional', vehicle: 'direct_appeal', develop: 'Pull the charge conference transcript',
      partAText: PART_A, partBText: PART_B,
      citations: { create: { documentId: doc.id, chunkId: chunk.id, volume: 'RR3', page: 214, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.', excerptHash: createHash('sha256').update(chunk.content).digest('hex') } },
    },
  });
  reportId = (await prisma.report.create({
    data: {
      caseId, tenantId: familyTenant, runId: analysisRun.id, versionNo: 1, templateVersion: 'AB-v2', approvedBy: 'qa',
      findingsSnapshot: {
        findings: [{
          id: finding.id, category: finding.category, severity: finding.severity, confidence: 0.9, provenance: 'ai', partAText: PART_A, partBText: PART_B,
          preserved: 'yes', harmStandard: 'constitutional', vehicle: 'direct_appeal', develop: 'Pull the charge conference transcript', dependsOn: [],
          citations: [{ volume: 'RR3', page: 214, line: 8, excerpt: 'Objection, Your Honor, hearsay. THE COURT: Overruled.' }],
        }],
      },
    },
  })).id;

  // A self-declared clinic with the flag on — the way one looked before this round.
  clinicTenant = (await prisma.tenant.create({ data: { name: `${run}_clinic` } })).id;
  clinicOrgId = (await prisma.organisation.create({ data: { tenantId: clinicTenant, kind: 'CLINIC', name: `${run} Innocence Clinic` } })).id;
  const director = await prisma.user.create({ data: { email: `${run}_clinic@example.com`, name: 'Director', tenantId: clinicTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL', practiceType: 'clinic' } });
  await prisma.membership.create({ data: { organisationId: clinicOrgId, tenantId: clinicTenant, userId: director.id, role: 'OWNER' } });
  clinicCookie = await cookieFor(director.id, clinicTenant);
  await setOverride('clinic_inbox', clinicTenant, true, 'U4', 'test');
  __invalidateFlagCache();
  tenants.push(staffTenant, familyTenant, clinicTenant);
});

afterAll(async () => {
  await clearOverride('clinic_inbox', clinicTenant, 'test');
  await prisma.packetDelivery.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.consentGrant.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.report.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.findingCitation.deleteMany({ where: { finding: { tenantId: familyTenant } } });
  await prisma.finding.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.analysisRun.deleteMany({ where: { tenantId: familyTenant } });
  await prisma.documentChunk.deleteMany({ where: { document: { caseId } } });
  await prisma.document.deleteMany({ where: { caseId } });
  await prisma.caseAccess.deleteMany({ where: { caseId } });
  await prisma.case.deleteMany({ where: { id: caseId } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.organisation.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

describe('U4-c — a self-declared clinic', () => {
  it('is not offered to the family, cannot name itself on a consent that delivers, and has no inbox (403 CLINIC_UNVERIFIED)', async () => {
    expect(await ourClinics()).toEqual([]);
    const grant = await fastify.inject({ method: 'POST', url: `/cases/${caseId}/consent`, headers: { cookie: familyCookie }, payload: { recipientClass: 'clinic', recipientOrganisationId: clinicOrgId } });
    expect(grant.statusCode).toBe(200); // the consent may name it; nothing is delivered until staff verify the clinic
    expect((await deliver(clinicOrgId)).statusCode).toBe(404);
    const res = await inbox();
    expect(res.statusCode).toBe(403);
    expect(res.json().reason).toBe('CLINIC_UNVERIFIED');
    expect(await prisma.packetDelivery.count({ where: { organisationId: clinicOrgId } })).toBe(0);
    // /counsel/me tells the clinic where it stands.
    expect((await fastify.inject({ method: 'GET', url: '/counsel/me', headers: { cookie: clinicCookie } })).json().organisation).toMatchObject({ kind: 'CLINIC', clinicVerified: false });
  });

  it('a firm cannot be clinic-verified (409); Support cannot verify (403); the bar number is required (400)', async () => {
    const firmTenant = (await prisma.tenant.create({ data: { name: `${run}_firm` } })).id;
    tenants.push(firmTenant);
    const firmId = (await prisma.organisation.create({ data: { tenantId: firmTenant, kind: 'FIRM', name: `${run} Firm` } })).id;
    const res = await fastify.inject({ method: 'POST', url: `/ops/organisations/${firmId}/clinic-verify`, headers: { cookie: adminCookie }, payload: { supervisingBar: '24000001' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('NOT_A_CLINIC');
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicOrgId}/clinic-verify`, headers: { cookie: supportCookie }, payload: { supervisingBar: '24000001' } })).statusCode).toBe(403);
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicOrgId}/clinic-verify`, headers: { cookie: adminCookie }, payload: {} })).statusCode).toBe(400);
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/nope/clinic-verify`, headers: { cookie: adminCookie }, payload: { supervisingBar: '1' } })).statusCode).toBe(404);
  });
});

describe('U4-c — the verified clinic receives the attorney packet', () => {
  let deliveryId: string;

  it('an Admin verifies the clinic with the supervising attorney\'s bar number; audited without the number; staff read it on the detail', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicOrgId}/clinic-verify`, headers: { cookie: adminCookie }, payload: { supervisingBar: '24011223' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().organisation).toMatchObject({ id: clinicOrgId, clinicVerified: true, clinicSupervisingBar: '24011223' });
    expect(res.json().organisation.clinicVerifiedAt).toBeTruthy();
    const org = await prisma.organisation.findUniqueOrThrow({ where: { id: clinicOrgId } });
    expect(org.clinicVerifiedAt).toBeTruthy();
    expect(org.clinicSupervisingBar).toBe('24011223');
    const audit = await prisma.auditLog.findMany({ where: { action: 'ORGANISATION_CHANGE', caseId: `organisation:${clinicOrgId}` } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ op: 'clinic_verified', before: { clinicVerifiedAt: null, supervisingBarRecorded: false }, after: { supervisingBarRecorded: true } });
    expect(JSON.stringify(audit[0].details)).not.toContain('24011223');
    // Staff see the verification on the detail; the clinic's own members see only that it is verified.
    expect((await fastify.inject({ method: 'GET', url: `/ops/organisations/${clinicOrgId}`, headers: { cookie: supportCookie } })).json().organisation).toMatchObject({ clinicVerified: true, clinicSupervisingBar: '24011223' });
    const me = (await fastify.inject({ method: 'GET', url: '/counsel/me', headers: { cookie: clinicCookie } })).json();
    expect(me.organisation).toMatchObject({ clinicVerified: true });
    expect(JSON.stringify(me)).not.toContain('24011223');
  });

  it('the family now sees the clinic and delivers; the delivery is audited as the attorney packet', async () => {
    expect(await ourClinics()).toEqual([{ id: clinicOrgId, name: `${run} Innocence Clinic` }]);
    const res = await deliver(clinicOrgId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ alreadyDelivered: false, delivery: { organisationId: clinicOrgId, reportVersion: 1 } });
    deliveryId = res.json().delivery.id;
    const audit = await prisma.auditLog.findMany({ where: { caseId, action: 'PACKET_DELIVERY' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ op: 'packet_delivered', deliveryId, organisationId: clinicOrgId, content: 'attorney_packet_part_b' });
    expect((audit[0].details as { clinicVerifiedAt: string }).clinicVerifiedAt).toBeTruthy();
  });

  it('the inbox lists it and the PDF is Part B for the attorney — never Part A, never the bottom line; the open is audited', async () => {
    const list = await inbox();
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual([expect.objectContaining({ id: deliveryId, caseId, reportVersion: 1, revoked: false })]);
    expect(list.json().items[0].caseTitle).toMatch(/Bexar County/);
    expect(JSON.stringify(list.json())).not.toContain("the family's own title");

    const res = await pdf(deliveryId);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attorney-packet/);
    expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const text = pdfText(res.rawPayload);
    expect(text).toContain('For the attorney');
    expect(text).toContain('Attorney working packet');
    expect(text).toContain(PART_B);
    expect(text).toContain('To develop: Pull the charge conference transcript');
    expect(text).toContain('Investigation checklist');
    expect(text).toContain('Issues by priority');
    // What the consent did not name: the family's text and the bottom line.
    expect(text).not.toContain(PART_A);
    expect(text).not.toContain('For your family');
    expect(text).not.toContain('The bottom line');
    const bottom = bottomLineFor([{ severity: 'dispositive' }], false, null);
    expect(text).not.toContain(bottom.headline);
    for (const p of bottom.body) expect(text).not.toContain(p);
    expect(text).not.toContain('Time limits');
    expect(text).not.toContain("the family's own title");

    const row = await prisma.packetDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(row.openedAt).toBeTruthy();
    const opened = await prisma.auditLog.findMany({ where: { caseId: `delivery:${deliveryId}`, action: 'PACKET_DELIVERY' } });
    expect(opened).toHaveLength(1);
    expect(opened[0].details).toMatchObject({ op: 'packet_opened', sourceCaseId: caseId, versionNo: 1, firstOpen: true, content: 'attorney_packet_part_b' });
  });

  it('clearing the verification closes the inbox again on the next request; the family cannot deliver to it', async () => {
    const res = await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicOrgId}/clinic-unverify`, headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().organisation).toMatchObject({ clinicVerified: false, clinicSupervisingBar: null });
    expect((await inbox()).statusCode).toBe(403);
    expect((await pdf(deliveryId)).statusCode).toBe(403);
    expect(await ourClinics()).toEqual([]);
    expect((await deliver(clinicOrgId)).statusCode).toBe(404);
    const audit = await prisma.auditLog.findMany({ where: { action: 'ORGANISATION_CHANGE', caseId: `organisation:${clinicOrgId}` }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => (a.details as { op: string }).op)).toEqual(['clinic_verified', 'clinic_unverified']);
    expect((await fastify.inject({ method: 'POST', url: `/ops/organisations/${clinicOrgId}/clinic-unverify`, headers: { cookie: adminCookie } })).statusCode).toBe(409);
  });
});
