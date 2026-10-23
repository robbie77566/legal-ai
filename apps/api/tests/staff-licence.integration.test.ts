/**
 * U4-d / U4-e — the staff licence rule and the Record Desk chronology (UPL
 * review 2026-10-23, recommendation 9, finding P10). Live Postgres.
 *
 *  U4-d PATCH /qa/findings/:id refuses partAText / partBText / harmStandard
 *       / develop for a reviewer without a verified bar number (403
 *       LICENCE_REQUIRED) and allows `preserved`; a licensed reviewer edits
 *       everything; the Team page's api records (and clears) the licence
 *       for staff, audited without the number.
 *  U4-e the Record Desk deliverable round-trips as a structured chronology
 *       and both notes refuse the family lint phrases ("you should file").
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';
process.env.STRIPE_SECRET_KEY = '';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { setOverride, clearOverride, __invalidateFlagCache } from '@hg/database/flags';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests } from '@hg/email';
import { lintProcessNote } from '../src/routes/investigations';

const run = `u4lic_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role: string) =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;
const patch = (url: string, cookie: string, payload: unknown) => fastify.inject({ method: 'PATCH', url, headers: { cookie }, payload: payload as Record<string, unknown> });
const post = (url: string, cookie: string, payload: unknown) => fastify.inject({ method: 'POST', url, headers: { cookie }, payload: payload as Record<string, unknown> });
const get = (url: string, cookie: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });

let staffTenant: string;
let adminId: string;
let adminCookie: string;
let licensedCookie: string;
let unlicensedId: string;
let unlicensedCookie: string;
let famTenant: string;
let famCaseId: string;
let findingId: string;
let pdTenant: string;
let pdOrgId: string;
let pdOwnerCookie: string;
let requestId: string;
const tenants: string[] = [];

beforeAll(async () => {
  __setEmailProviderForTests({ send: async () => ({ delivered: true, id: 'test' }) });
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'Robbie', tenantId: staffTenant, role: 'ADMIN', accountKind: 'STAFF' } })).id;
  const licensed = await prisma.user.create({ data: { email: `${run}_lic@example.com`, name: 'Lee', tenantId: staffTenant, role: 'ATTORNEY', accountKind: 'STAFF', barNumber: '24055555', barState: 'TX', barVerifiedAt: new Date(), barVerifiedBy: adminId, barVerificationStatus: 'VERIFIED' } });
  const unlicensed = await prisma.user.create({ data: { email: `${run}_unlic@example.com`, name: 'Sam', tenantId: staffTenant, role: 'ATTORNEY', accountKind: 'STAFF' } });
  unlicensedId = unlicensed.id;
  adminCookie = await cookieFor(adminId, staffTenant, 'ADMIN');
  licensedCookie = await cookieFor(licensed.id, staffTenant, 'ATTORNEY');
  unlicensedCookie = await cookieFor(unlicensed.id, staffTenant, 'ATTORNEY');

  famTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  famCaseId = (await prisma.case.create({ data: { title: `${run}_family_case`, tenantId: famTenant, status: 'QA_REVIEW', lane: 'TRIAL' } })).id;
  const runRow = await prisma.analysisRun.create({ data: { caseId: famCaseId, tenantId: famTenant, modelConfig: {}, completedAt: new Date() } });
  findingId = (await prisma.finding.create({
    data: {
      runId: runRow.id, caseId: famCaseId, tenantId: famTenant, stableKey: `${run}_f1`, category: 'preserved_error', severity: 'supportive', confidence: 0.8,
      screen: 'evidence', preserved: 'yes', harmStandard: 'nonconstitutional', develop: 'Pull the charge conference transcript', partAText: 'Plain words for the family.', partBText: 'Counsel text before the edit.',
    },
  })).id;

  pdTenant = (await prisma.tenant.create({ data: { name: `${run}_pd` } })).id;
  pdOrgId = (await prisma.organisation.create({ data: { tenantId: pdTenant, kind: 'PD_OFFICE', name: `${run} County PD` } })).id;
  const pdOwner = await prisma.user.create({ data: { email: `${run}_pdowner@example.com`, name: 'PD Owner', tenantId: pdTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL' } });
  await prisma.membership.create({ data: { organisationId: pdOrgId, tenantId: pdTenant, userId: pdOwner.id, role: 'OWNER' } });
  pdOwnerCookie = await cookieFor(pdOwner.id, pdTenant, 'CLIENT');
  await setOverride('record_desk', pdTenant, true, 'U4', 'test');
  __invalidateFlagCache();
  requestId = (await prisma.investigationRequest.create({
    data: { tenantId: pdTenant, organisationId: pdOrgId, requestedBy: pdOwner.id, kind: 'CHRONOLOGY', pages: 300, note: 'Chronology of the suppression hearing' },
  })).id;
  tenants.push(staffTenant, famTenant, pdTenant);
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await clearOverride('record_desk', pdTenant, 'test');
  await prisma.investigationRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.finding.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.analysisRun.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.organisation.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.staffGrant.deleteMany({ where: { user: { tenantId: { in: tenants } } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

describe('U4-d — the QA licence rule', () => {
  it('an unlicensed reviewer is refused on each legal-text field (403 LICENCE_REQUIRED) and nothing changes', async () => {
    for (const body of [{ partAText: 'Plainer words.' }, { partBText: 'Counsel text, edited.' }, { harmStandard: 'structural' }, { develop: 'Affidavit from trial counsel' }, { preserved: 'no', develop: 'x' }]) {
      const res = await patch(`/qa/findings/${findingId}`, unlicensedCookie, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(403);
      expect(res.json()).toMatchObject({ reason: 'LICENCE_REQUIRED' });
      expect(res.json().fields).toEqual(Object.keys(body).filter((k) => k !== 'preserved'));
    }
    const finding = await prisma.finding.findUniqueOrThrow({ where: { id: findingId } });
    expect(finding).toMatchObject({ partAText: 'Plain words for the family.', partBText: 'Counsel text before the edit.', harmStandard: 'nonconstitutional', provenance: 'ai' });
    expect(await prisma.auditLog.count({ where: { caseId: famCaseId, action: 'QA_EDIT' } })).toBe(0);
  });

  it('the same reviewer may change `preserved` (a reading of the record), with the usual event and audit row', async () => {
    const res = await patch(`/qa/findings/${findingId}`, unlicensedCookie, { preserved: 'no' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ preserved: 'no', provenance: 'ai_human_edited' });
    const audit = await prisma.auditLog.findMany({ where: { caseId: famCaseId, action: 'QA_EDIT' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ findingId, fields: ['preserved'], before: { preserved: 'yes' }, after: { preserved: 'no' } });
  });

  it('a licensed reviewer edits the legal text; the admin without a licence is refused like anyone else', async () => {
    const res = await patch(`/qa/findings/${findingId}`, licensedCookie, { partBText: 'Counsel text after the edit.', harmStandard: 'structural', develop: 'Affidavit from trial counsel' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ partBText: 'Counsel text after the edit.', harmStandard: 'structural', develop: 'Affidavit from trial counsel' });
    expect((await patch(`/qa/findings/${findingId}`, licensedCookie, { partAText: 'Plainer words for the family.' })).statusCode).toBe(200);
    expect((await patch(`/qa/findings/${findingId}`, adminCookie, { partAText: 'An admin edit.' })).statusCode).toBe(403);
  });

  it('the Team page records a licence for staff (PATCH /permissions/users/:id { barNumber }) — verified under the Admin, audited without the number — and the reviewer can then edit; clearing it closes the edit again', async () => {
    const recorded = await patch(`/permissions/users/${unlicensedId}`, adminCookie, { barNumber: '24088888' });
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json().user).toMatchObject({ id: unlicensedId, role: 'ATTORNEY', barNumber: '24088888', barState: 'TX', barVerified: true, barVerifiedBy: adminId, barVerificationStatus: 'VERIFIED' });
    expect(recorded.json().user.passwordHash).toBeUndefined();
    const list = (await get('/permissions/users', adminCookie)).json() as Array<{ id: string; barVerified: boolean; barNumber: string | null }>;
    expect(list.find((u) => u.id === unlicensedId)).toMatchObject({ barVerified: true, barNumber: '24088888' });
    const audit = await prisma.auditLog.findMany({ where: { action: 'BAR_VERIFICATION', caseId: `verification:${unlicensedId}` }, orderBy: { createdAt: 'asc' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: adminId, tenantId: staffTenant });
    expect(audit[0].details).toMatchObject({ op: 'staff_licence_recorded', before: { barVerifiedAt: null } });
    expect(JSON.stringify(audit[0].details)).not.toContain('24088888');

    expect((await patch(`/qa/findings/${findingId}`, unlicensedCookie, { develop: 'Now licensed.' })).statusCode).toBe(200);

    const cleared = await patch(`/permissions/users/${unlicensedId}`, adminCookie, { barNumber: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().user).toMatchObject({ barNumber: null, barVerified: false, barVerificationStatus: 'PENDING' });
    expect((await patch(`/qa/findings/${findingId}`, unlicensedCookie, { develop: 'Unlicensed again.' })).statusCode).toBe(403);
    expect((await patch(`/qa/findings/${findingId}`, unlicensedCookie, { preserved: 'yes' })).statusCode).toBe(200);
    // A role change alone still works; an empty patch is refused.
    expect((await patch(`/permissions/users/${unlicensedId}`, adminCookie, { role: 'SUPPORT' })).statusCode).toBe(200);
    expect((await patch(`/permissions/users/${unlicensedId}`, adminCookie, {})).statusCode).toBe(400);
  });

  it('POST /permissions/users accepts the bar number on create and the account is licensed from the first write', async () => {
    const res = await post('/permissions/users', adminCookie, { email: `${run}_new@example.com`, name: 'New Reviewer', role: 'ATTORNEY', barNumber: '24099999' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ role: 'ATTORNEY', barVerified: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.json().user.id } });
    expect(user).toMatchObject({ barNumber: '24099999', barState: 'TX', barVerifiedBy: adminId, barVerificationStatus: 'VERIFIED' });
    expect(user.barVerifiedAt).toBeTruthy();
    const plain = await post('/permissions/users', adminCookie, { email: `${run}_plain@example.com`, name: 'Plain Support', role: 'SUPPORT' });
    expect(plain.statusCode).toBe(200);
    expect(plain.json().user).toMatchObject({ barVerified: false });
  });
});

describe('U4-e — the Record Desk chronology', () => {
  const CHRONOLOGY = {
    entries: [
      { date: '2019-03-04', volume: 'CR', page: '12', event: 'Indictment filed; two counts of aggravated robbery.' },
      { date: '2019-11-18', volume: 'RR3', page: 214, event: 'Motion to suppress heard; objection to the custodial statement overruled.' },
      { date: '2020-01-10', event: 'Judgment signed; 25 years TDCJ.' },
    ],
    note: 'Built from RR vols. 1-5 and the clerk\'s record; vol. 6 was not in the upload.',
  };

  it('lintProcessNote finds the family phrases as whole words and nothing else', () => {
    expect(lintProcessNote('You should file the writ; the grounds are viable and winnable.')).toEqual(['should', 'file', 'grounds', 'viable', 'winnable']);
    expect(lintProcessNote('Indictment filed; the motion was heard on the 18th and the shoulder injury is noted at RR3 214.')).toEqual([]);
    expect(lintProcessNote(null)).toEqual([]);
  });

  it('an Admin delivers a structured chronology and a process note; the organisation reads the table', async () => {
    const res = await patch(`/ops/investigations/${requestId}`, adminCookie, { status: 'DELIVERED', deliverable: CHRONOLOGY, note: 'Chronology delivered 2027-02-10; built by a person from the record.' });
    expect(res.statusCode).toBe(200);
    expect(res.json().request).toMatchObject({ status: 'DELIVERED', deliverable: CHRONOLOGY, staffNote: 'Chronology delivered 2027-02-10; built by a person from the record.' });
    expect(res.json().request.deliveredAt).toBeTruthy();
    const row = await prisma.investigationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.deliverable).toEqual(CHRONOLOGY);
    const mine = await get('/counsel/investigations', pdOwnerCookie);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().requests[0]).toMatchObject({ id: requestId, status: 'DELIVERED', deliverable: CHRONOLOGY });
    const audit = await prisma.auditLog.findMany({ where: { action: 'INVESTIGATION_REQUEST', caseId: `investigation:${requestId}` } });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ op: 'status_changed', after: 'DELIVERED', noteChanged: true, deliverableEntries: 3 });
    expect(JSON.stringify(audit[0].details)).not.toContain('Indictment'); // the chronology's text never enters the audit row
  });

  it('a note with "you should file" is refused (422 ADVICE_LANGUAGE) — the process note and the chronology note alike — and nothing changes', async () => {
    const bad = await patch(`/ops/investigations/${requestId}`, adminCookie, { note: 'Delivered. You should file the application before March.' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toMatchObject({ reason: 'ADVICE_LANGUAGE', phrases: ['should', 'file'] });
    const badDeliverable = await patch(`/ops/investigations/${requestId}`, adminCookie, { deliverable: { ...CHRONOLOGY, note: 'The grounds look viable.' } });
    expect(badDeliverable.statusCode).toBe(422);
    expect(badDeliverable.json().phrases).toEqual(['grounds', 'viable']);
    const row = await prisma.investigationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.staffNote).toBe('Chronology delivered 2027-02-10; built by a person from the record.');
    expect(row.deliverable).toEqual(CHRONOLOGY);
    // Shape is checked too: an entry needs a date and an event.
    expect((await patch(`/ops/investigations/${requestId}`, adminCookie, { deliverable: { entries: [{ date: '2019-01-01' }] } })).statusCode).toBe(400);
    // Clearing the chronology is allowed.
    expect((await patch(`/ops/investigations/${requestId}`, adminCookie, { deliverable: null })).statusCode).toBe(200);
    expect((await prisma.investigationRequest.findUniqueOrThrow({ where: { id: requestId } })).deliverable).toBeNull();
  });
});
