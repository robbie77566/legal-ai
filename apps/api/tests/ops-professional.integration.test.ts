/**
 * Staff console, professional era (persona_rollout_plan.md §5 G,
 * staff_console.md §12) — live Postgres.
 *  G1 every new write is audited: verify, reject, invoice create / mark-paid,
 *     investigation PATCH, the widened QA PATCH — one row each with the actor
 *     and before/after where there is one.
 *  G2 the role matrix: SUPPORT reads 200 / writes 403 (except the Record Desk
 *     PATCH to IN_PROGRESS / DELIVERED); a REVIEWER (role ATTORNEY) is 403 on
 *     all of /ops and 200 on /qa; a PROFESSIONAL is 403 on both.
 *  G3 verification emails: verify → one email with "first review"; reject →
 *     one neutral email; neither carries the bar number; the queue forgets
 *     the person after either.
 *  G4 the Today page's professional group is computed from seeded data.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';
import { businessDaysBetween } from '@hg/case-lifecycle';

const run = `opsg_${Date.now()}`;
const cookieFor = async (userId: string, tenantId: string, role: 'ADMIN' | 'SUPPORT' | 'ATTORNEY' | 'CLIENT' = 'CLIENT') =>
  `next-auth.session-token=${await encodeSessionToken({ userId, tenantId, role })}`;

const get = (url: string, cookie: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload: unknown = {}) =>
  fastify.inject({ method: 'POST', url, headers: { cookie }, payload: payload as Record<string, unknown> });
const patch = (url: string, cookie: string, payload: unknown = {}) =>
  fastify.inject({ method: 'PATCH', url, headers: { cookie }, payload: payload as Record<string, unknown> });

/** Noon UTC on the civil date exactly N business days before today on the SLA calendar (America/Chicago civil dates). */
const businessDaysAgo = (n: number): Date => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const d = new Date(`${today}T12:00:00Z`);
  while (businessDaysBetween(d.toISOString().slice(0, 10), today) < n) d.setUTCDate(d.getUTCDate() - 1);
  return d;
};

const sent: EmailMessage[] = [];

let staffTenant: string;
let adminId: string;
let supportId: string;
let reviewerId: string;
let adminCookie: string;
let supportCookie: string;
let reviewerCookie: string;
let proCookie: string;

let firmTenant: string;
let firmOrgId: string;
let pendingA: { id: string; email: string; bar: string };
let pendingB: { id: string; email: string; bar: string };
let verifiedC: string;

let pdTenant: string;
let pdOrgId: string;
let pdOwnerId: string;
let pdCaseId: string;
let quoteCaseId: string;
let quoteRequestId: string;
let oldInvestigationId: string;
let freshInvestigationId: string;

let famTenant: string;
let famCaseId: string;
let findingId: string;

beforeAll(async () => {
  __setEmailProviderForTests({ send: async (m) => { sent.push(m); return { delivered: true, id: `test_${sent.length}` }; } });

  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  adminId = (await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'Robbie', tenantId: staffTenant, role: 'ADMIN' } })).id;
  supportId = (await prisma.user.create({ data: { email: `${run}_support@example.com`, name: 'Dana', tenantId: staffTenant, role: 'SUPPORT' } })).id;
  // The reviewer carries a bar number: the QA edit to legal text needs one (UPL review 2026-10-23, rec. 9; proven in staff-licence.integration.test.ts).
  reviewerId = (await prisma.user.create({ data: { email: `${run}_reviewer@example.com`, name: 'Lee', tenantId: staffTenant, role: 'ATTORNEY', barNumber: '24055555', barState: 'TX', barVerifiedAt: new Date(), barVerificationStatus: 'VERIFIED' } })).id;
  adminCookie = await cookieFor(adminId, staffTenant, 'ADMIN');
  supportCookie = await cookieFor(supportId, staffTenant, 'SUPPORT');
  reviewerCookie = await cookieFor(reviewerId, staffTenant, 'ATTORNEY');

  // A firm with two attorneys waiting on verification and one already verified.
  firmTenant = (await prisma.tenant.create({ data: { name: `${run}_firm` } })).id;
  firmOrgId = (await prisma.organisation.create({ data: { tenantId: firmTenant, kind: 'FIRM', name: `${run} Writ Partners` } })).id;
  const pro = async (tag: string, bar: string | null, verified = false) => {
    const u = await prisma.user.create({
      data: {
        email: `${run}_${tag}@example.com`, name: `Attorney ${tag}`, tenantId: firmTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL',
        barNumber: bar, barState: bar ? 'TX' : null, practiceType: 'writ', ...(verified ? { barVerifiedAt: new Date(), barVerifiedBy: adminId, barVerificationStatus: 'VERIFIED' as const } : {}),
      },
    });
    await prisma.membership.create({ data: { organisationId: firmOrgId, tenantId: firmTenant, userId: u.id, role: tag === 'a' ? 'OWNER' : 'ATTORNEY' } });
    return u;
  };
  const a = await pro('a', '24011111');
  const b = await pro('b', '24022222');
  const c = await pro('c', '24033333', true);
  pendingA = { id: a.id, email: a.email, bar: '24011111' };
  pendingB = { id: b.id, email: b.email, bar: '24022222' };
  verifiedC = c.id;
  proCookie = await cookieFor(a.id, firmTenant);

  // A PD office on a pilot with ONE record left, a Long-record quote request,
  // and two Record Desk requests — one past the 10-business-day SLA.
  pdTenant = (await prisma.tenant.create({ data: { name: `${run}_pd` } })).id;
  const resets = new Date(Date.now() + 60 * 86_400_000);
  pdOrgId = (await prisma.organisation.create({
    data: { tenantId: pdTenant, kind: 'PD_OFFICE', name: `${run} County PD`, pilot: true, pilotEndsAt: resets, allowanceRecords: 2, allowanceResetsAt: resets },
  })).id;
  pdOwnerId = (await prisma.user.create({ data: { email: `${run}_pdowner@example.com`, name: 'PD Owner', tenantId: pdTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id;
  await prisma.membership.create({ data: { organisationId: pdOrgId, tenantId: pdTenant, userId: pdOwnerId, role: 'OWNER' } });
  const mkCase = (title: string, tenantId: string, status: 'QUOTED' | 'DIGITIZING' | 'QA_REVIEW') =>
    prisma.case.create({ data: { title, tenantId, status, lane: 'TRIAL', vehicle: '11.07', recordBucket: 'STANDARD', meteredPages: { reporter: 300, clerk: 0, exhibit: 0, unknown: 0 } } });
  pdCaseId = (await mkCase(`${run}_pd_case`, pdTenant, 'DIGITIZING')).id;
  await prisma.matter.create({ data: { caseId: pdCaseId, tenantId: pdTenant, organisationId: pdOrgId, openedBy: pdOwnerId, vehicle: '11.07', county: 'Harris', causeNumber: '1577001', clientInitials: 'AB' } });
  await prisma.allowanceEntry.create({ data: { tenantId: pdTenant, organisationId: pdOrgId, caseId: pdCaseId, kind: 'PILOT', consumedBy: pdOwnerId } });
  quoteCaseId = (await mkCase(`${run}_pd_long`, pdTenant, 'QUOTED')).id;
  quoteRequestId = (await prisma.quoteRequest.create({
    data: { tenantId: pdTenant, caseId: quoteCaseId, requestedBy: pdOwnerId, meteredPages: { reporter: 1800, clerk: 200, exhibit: 0, total: 2000 }, note: 'Three volumes are exhibits' },
  })).id;
  oldInvestigationId = (await prisma.investigationRequest.create({
    data: { tenantId: pdTenant, organisationId: pdOrgId, caseId: pdCaseId, requestedBy: pdOwnerId, kind: 'CHRONOLOGY', pages: 300, note: 'Chronology of the suppression hearing', createdAt: businessDaysAgo(11) },
  })).id;
  freshInvestigationId = (await prisma.investigationRequest.create({
    data: { tenantId: pdTenant, organisationId: pdOrgId, requestedBy: pdOwnerId, kind: 'OTHER', note: 'Filed today' },
  })).id;

  // A family case in quality review with one finding, for the widened QA edit.
  famTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  famCaseId = (await mkCase(`${run}_family_case`, famTenant, 'QA_REVIEW')).id;
  const runRow = await prisma.analysisRun.create({ data: { caseId: famCaseId, tenantId: famTenant, modelConfig: {}, completedAt: new Date() } });
  findingId = (await prisma.finding.create({
    data: {
      runId: runRow.id, caseId: famCaseId, tenantId: famTenant, stableKey: `${run}_f1`, category: 'preserved_error', severity: 'supportive', confidence: 0.8,
      screen: 'evidence', preserved: 'yes', harmStandard: 'nonconstitutional', develop: 'Pull the charge conference transcript', partAText: 'Plain words for the family.', partBText: 'Counsel text before the edit.',
    },
  })).id;
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  const tenants = [staffTenant, firmTenant, pdTenant, famTenant];
  await prisma.invoice.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.investigationRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.quoteRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.allowanceEntry.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.finding.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.analysisRun.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.matter.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.membership.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.organisation.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

beforeEach(() => { sent.length = 0; });

const auditRows = (action: string, caseId: string) => prisma.auditLog.findMany({ where: { action, caseId }, orderBy: { createdAt: 'asc' } });
/** Invoice numbers restart once a run's invoices are deleted; audit rows never are, so scope by the invoice id. */
const invoiceAudit = async (number: string, invoiceId: string) => (await auditRows('INVOICE', `invoice:${number}`)).filter((a) => (a.details as { invoiceId?: string }).invoiceId === invoiceId);

describe('G4 — the Today page professional group, before any decision', () => {
  it('counts pending verifications, open quote requests, pilot records this week, allowances near zero and requests past the SLA', async () => {
    const res = await get('/ops/status', adminCookie);
    expect(res.statusCode).toBe(200);
    const p = res.json().professional;
    // Independent counts: these numbers are global, so other suites may add to them.
    const pendingUsers = await prisma.user.findMany({ where: { accountKind: 'PROFESSIONAL', barNumber: { not: null }, barVerifiedAt: null, deletedAt: null }, select: { id: true } });
    expect(p.verificationsPending).toBeGreaterThanOrEqual(2);
    expect(p.verificationsPending).toBeLessThanOrEqual(pendingUsers.length);
    expect(p.quoteRequestsOpen).toBe(await prisma.quoteRequest.count({ where: { status: 'OPEN' } }));
    expect(p.pilotRecordsThisWeek).toBeGreaterThanOrEqual(1);
    expect(p.allowancesNearZero).toContainEqual(expect.objectContaining({ organisationId: pdOrgId, organisation: `${run} County PD`, remaining: 1, granted: 2 }));
    const past = p.investigationsPastSla as Array<{ id: string; businessDaysOpen: number }>;
    const old = past.find((r) => r.id === oldInvestigationId);
    expect(old).toBeDefined();
    expect(old!.businessDaysOpen).toBe(11);
    expect(past.find((r) => r.id === freshInvestigationId)).toBeUndefined();
  });

  it('the SLA badge travels with the Record Desk list: past the 10th business day is flagged, today is not', async () => {
    const res = await get('/ops/investigations', supportCookie);
    expect(res.statusCode).toBe(200);
    const rows = res.json().requests as Array<{ id: string; pastSla: boolean; businessDaysOpen: number }>;
    expect(rows.find((r) => r.id === oldInvestigationId)).toMatchObject({ pastSla: true, businessDaysOpen: 11 });
    expect(rows.find((r) => r.id === freshInvestigationId)).toMatchObject({ pastSla: false, businessDaysOpen: 0 });
  });
});

describe('G3 + G1 — bar verification is a human act', () => {
  it('GET /ops/verifications lists PROFESSIONAL accounts with an unverified bar number, with their organisation', async () => {
    const res = await get('/ops/verifications', supportCookie); // Support reads the queue
    expect(res.statusCode).toBe(200);
    const rows = res.json().verifications as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(pendingA.id);
    expect(ids).toContain(pendingB.id);
    expect(ids).not.toContain(verifiedC);
    expect(rows.find((r) => r.id === pendingA.id)).toMatchObject({
      name: 'Attorney a', email: pendingA.email, barNumber: '24011111', barState: 'TX', practiceType: 'writ',
      organisation: { id: firmOrgId, name: `${run} Writ Partners`, kind: 'FIRM' },
    });
    expect(typeof rows.find((r) => r.id === pendingA.id)!.signedUpAt).toBe('string');
  });

  it('verify: stamps who and when, writes one audit row without the bar number, emails the attorney that the first review is free', async () => {
    const res = await post(`/ops/verifications/${pendingA.id}/verify`, adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, userId: pendingA.id, barVerifiedBy: adminId, emailed: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: pendingA.id } });
    expect(user.barVerifiedAt).toBeTruthy();
    expect(user.barVerifiedBy).toBe(adminId);
    expect(user.barNumber).toBe('24011111'); // nothing cleared

    const audit = await auditRows('BAR_VERIFICATION', `verification:${pendingA.id}`);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenantId: firmTenant, userId: adminId });
    expect(audit[0].details).toMatchObject({ op: 'verified', userId: pendingA.id, before: { barVerifiedAt: null }, after: { barVerifiedBy: adminId } });
    expect(JSON.stringify(audit[0].details)).not.toContain('24011111');

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(pendingA.email);
    expect(sent[0].text).toMatch(/first review/i);
    expect(sent[0].text).not.toContain('24011111');
    expect(sent[0].subject).not.toContain('24011111');

    // Twice is a no-op with a 409, not a second email or audit row.
    expect((await post(`/ops/verifications/${pendingA.id}/verify`, adminCookie)).statusCode).toBe(409);
    expect(sent).toHaveLength(1);
    expect(await auditRows('BAR_VERIFICATION', `verification:${pendingA.id}`)).toHaveLength(1);
  });

  it('reject: keeps the account, clears nothing, records the note internally, sends a neutral email without the bar number', async () => {
    const res = await post(`/ops/verifications/${pendingB.id}/reject`, adminCookie, { note: 'Number belongs to a suspended licence per the directory' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, userId: pendingB.id, emailed: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: pendingB.id } });
    expect(user.deletedAt).toBeNull();
    expect(user.barNumber).toBe('24022222');
    expect(user.barVerifiedAt).toBeNull();
    // UPL review 2026-10-23 (P1): the decision now lives on the account and closes counsel review.
    expect(user.barVerificationStatus).toBe('REJECTED');
    expect(user.barRejectedAt).toBeTruthy();
    expect(user.barRejectionNote).toBe('Number belongs to a suspended licence per the directory');

    const audit = await auditRows('BAR_VERIFICATION', `verification:${pendingB.id}`);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenantId: firmTenant, userId: adminId });
    expect(audit[0].details).toMatchObject({ op: 'rejected', userId: pendingB.id, note: 'Number belongs to a suspended licence per the directory' });
    expect(JSON.stringify(audit[0].details)).not.toContain('24022222');

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(pendingB.email);
    expect(sent[0].text).toMatch(/could not verify/i);
    expect(sent[0].text).not.toContain('24022222');
    expect(sent[0].text).not.toContain('suspended'); // the note is internal
    expect(sent[0].text).not.toMatch(/first review/i);

    // A note is required: the audit row is the only place the reason lives.
    expect((await post(`/ops/verifications/${pendingB.id}/reject`, adminCookie, {})).statusCode).toBe(400);
  });

  it('after either decision the queue no longer lists the person; a non-professional or unknown id is 404', async () => {
    const rows = (await get('/ops/verifications', adminCookie)).json().verifications as Array<{ id: string }>;
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(pendingA.id);
    expect(ids).not.toContain(pendingB.id);
    expect((await post(`/ops/verifications/${supportId}/verify`, adminCookie)).statusCode).toBe(404);
    expect((await post(`/ops/verifications/nope/reject`, adminCookie, { note: 'x' })).statusCode).toBe(404);
    // Both numbers are global and other suites sign professionals up (and verify them) in parallel: read until the two agree.
    let pending = -1;
    let queued = -2;
    for (let i = 0; i < 5 && pending !== queued; i++) {
      queued = ((await get('/ops/verifications', adminCookie)).json().verifications as Array<{ id: string }>).length;
      pending = (await get('/ops/status', adminCookie)).json().professional.verificationsPending;
    }
    expect(pending).toBe(queued);
  });
});

describe('G1 — every other write is audited with the actor', () => {
  it('invoice create and mark-paid: one INVOICE row each (actor, number, before/after status)', async () => {
    const created = await post('/ops/invoices', adminCookie, { organisationId: pdOrgId, caseIds: [pdCaseId] });
    expect(created.statusCode).toBe(200);
    const inv = created.json();
    expect(inv.lines).toEqual([{ caseId: pdCaseId, causeNumber: '1577001', sku: 'COUNSEL_STANDARD', cents: 24900 }]);
    const paid = await post(`/ops/invoices/${inv.id}/mark-paid`, adminCookie, { achReference: 'ACH-77' });
    expect(paid.statusCode).toBe(200);
    const audit = await invoiceAudit(inv.number, inv.id);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ userId: adminId, tenantId: pdTenant });
    expect(audit[0].details).toMatchObject({ op: 'invoice_created', invoiceId: inv.id, totalCents: 24900 });
    expect(audit[1]).toMatchObject({ userId: adminId, tenantId: pdTenant });
    expect(audit[1].details).toMatchObject({ op: 'invoice_marked_paid', invoiceId: inv.id, achReference: 'ACH-77' });
  });

  it('investigation PATCH by Support (IN_PROGRESS, assigned to themself, a note): one INVESTIGATION_REQUEST row with before/after', async () => {
    const res = await patch(`/ops/investigations/${oldInvestigationId}`, supportCookie, { status: 'IN_PROGRESS', assignedTo: supportId, note: 'Started on the chronology' });
    expect(res.statusCode).toBe(200);
    expect(res.json().request).toMatchObject({ status: 'IN_PROGRESS', assignedTo: supportId, staffNote: 'Started on the chronology' });
    const audit = await auditRows('INVESTIGATION_REQUEST', `investigation:${oldInvestigationId}`);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: supportId, tenantId: pdTenant });
    expect(audit[0].details).toMatchObject({ op: 'status_changed', before: 'OPEN', after: 'IN_PROGRESS', assignedTo: supportId, noteChanged: true });
  });

  it('the widened QA PATCH: partBText, harmStandard and develop save, flip provenance, recompute the vehicle, and write one QA_EDIT row naming the fields', async () => {
    const res = await patch(`/qa/findings/${findingId}`, reviewerCookie, { partBText: 'Counsel text after the edit.', harmStandard: 'structural', develop: 'Affidavit from trial counsel' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ partBText: 'Counsel text after the edit.', harmStandard: 'structural', develop: 'Affidavit from trial counsel', provenance: 'ai_human_edited', vehicle: 'direct_appeal' });
    expect(res.json().partAText).toBe('Plain words for the family.'); // untouched
    const audit = await auditRows('QA_EDIT', famCaseId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: reviewerId, tenantId: famTenant });
    expect(audit[0].details).toMatchObject({ findingId, fields: ['partBText', 'harmStandard', 'develop'] });
    expect(audit[0].details).toMatchObject({ before: { harmStandard: 'nonconstitutional' }, after: { harmStandard: 'structural' } });
    // The old fields still work, an unknown harm standard is refused, an empty patch is refused.
    expect((await patch(`/qa/findings/${findingId}`, reviewerCookie, { harmStandard: 'severe' })).statusCode).toBe(400);
    expect((await patch(`/qa/findings/${findingId}`, reviewerCookie, {})).statusCode).toBe(400);
    expect((await patch(`/qa/findings/${findingId}`, reviewerCookie, { preserved: 'no' })).statusCode).toBe(200);
  });
});

describe('Money, cases and the case file carry the professional columns', () => {
  it('GET /ops/payments rows carry sku and rung; the summary rolls up by rung; credits are a money read', async () => {
    const stripeId = `cs_live_${run}`;
    await prisma.payment.create({ data: { stripeId, userId: pdOwnerId, tenantId: pdTenant, caseId: pdCaseId, kind: 'REVIEW', status: 'SUCCEEDED', amountCents: 24900, sku: 'COUNSEL_STANDARD', rung: 'STANDARD' } });
    try {
      const rows = (await get(`/ops/payments?q=${stripeId}`, adminCookie)).json().rows as Array<{ stripeId: string; sku: string | null; rung: string | null }>;
      expect(rows.find((r) => r.stripeId === stripeId)).toMatchObject({ sku: 'COUNSEL_STANDARD', rung: 'STANDARD' });
      const summary = (await get('/ops/payments/summary?days=7', adminCookie)).json();
      expect(summary.byRung.COUNSEL_STANDARD.count).toBeGreaterThanOrEqual(1);
      expect(summary.byRung.COUNSEL_STANDARD.cents).toBeGreaterThanOrEqual(24900);
      expect(summary.byRung).toHaveProperty('COUNSEL_SHORT');
      expect(summary.byRung).toHaveProperty('COUNSEL_EXTENDED');
      // The family tiles are untouched by the rollup.
      expect(summary.totals).toHaveProperty('collectedCents');
      expect(summary.totals).toHaveProperty('refundRate');
    } finally {
      await prisma.payment.deleteMany({ where: { stripeId } });
    }

    await prisma.credit.createMany({
      data: [
        { tenantId: pdTenant, organisationId: pdOrgId, userId: pdOwnerId, packId: `${run}_pack`, rung: 'STANDARD', issuedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) },
        { tenantId: pdTenant, organisationId: pdOrgId, userId: pdOwnerId, packId: `${run}_pack`, rung: 'STANDARD', issuedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), consumedAt: new Date(), consumedCaseId: pdCaseId },
        { tenantId: pdTenant, organisationId: pdOrgId, userId: pdOwnerId, packId: `${run}_pack`, rung: 'STANDARD', issuedAt: new Date(Date.now() - 2 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) },
      ],
    });
    try {
      const credits = (await get(`/ops/credits?organisationId=${pdOrgId}`, adminCookie)).json();
      expect(credits).toMatchObject({ issued: 3, consumed: 1, expired: 1, live: 1 });
      expect(credits.rows).toHaveLength(3);
      expect(credits.rows[0]).toMatchObject({ organisation: { id: pdOrgId, name: `${run} County PD` } });
    } finally {
      await prisma.credit.deleteMany({ where: { packId: `${run}_pack` } });
    }
  });

  it('GET /ops/queue rows carry the organisation and the matter; a family case carries null for both', async () => {
    const rows = (await get('/ops/queue', supportCookie)).json() as Array<{ id: string; organisation: unknown; matter: unknown }>;
    expect(rows.find((r) => r.id === pdCaseId)).toMatchObject({ organisation: { id: pdOrgId, name: `${run} County PD`, kind: 'PD_OFFICE' }, matter: { vehicle: '11.07', causeNumber: '1577001' } });
    expect(rows.find((r) => r.id === famCaseId)).toMatchObject({ organisation: null, matter: null });
  });

  it('the case file carries the quote decision and the allowance entry when present', async () => {
    const file = (await get(`/ops/cases/${pdCaseId}/file`, supportCookie)).json();
    expect(file.organisation).toMatchObject({ id: pdOrgId, kind: 'PD_OFFICE' });
    expect(file.matter).toMatchObject({ vehicle: '11.07', causeNumber: '1577001' });
    expect(file.allowance).toMatchObject({ kind: 'PILOT', consumedBy: pdOwnerId });
    expect(file.quote).toBeNull(); // no quote.accepted event on this seed
    const fam = (await get(`/ops/cases/${famCaseId}/file`, supportCookie)).json();
    expect(fam).toMatchObject({ organisation: null, matter: null, allowance: null, quote: null, quoteRequest: null });
  });

  it('GET /ops/staff lists the staff accounts for the reviewer picker (Support may read)', async () => {
    const res = await get('/ops/staff', supportCookie);
    expect(res.statusCode).toBe(200);
    const ids = (res.json().staff as Array<{ id: string; role: string }>).map((s) => s.id);
    expect(ids).toContain(adminId);
    expect(ids).toContain(supportId);
    expect(ids).not.toContain(pdOwnerId);
  });
});

describe('G2 — the role matrix', () => {
  it('SUPPORT: 200 on every new read, 403 on every write except the Record Desk PATCH to IN_PROGRESS / DELIVERED; credits and invoices are money', async () => {
    const reads = ['/ops/verifications', '/ops/organisations', `/ops/organisations/${pdOrgId}`, `/ops/organisations/${pdOrgId}/metrics`, '/ops/quote-requests', '/ops/investigations', '/ops/staff', '/ops/status', '/ops/queue', `/ops/cases/${pdCaseId}/file`];
    for (const u of reads) expect((await get(u, supportCookie)).statusCode, u).toBe(200);
    expect((await get('/ops/credits', supportCookie)).statusCode).toBe(403);
    expect((await get('/ops/invoices', supportCookie)).statusCode).toBe(403);

    expect((await post(`/ops/verifications/${pendingA.id}/verify`, supportCookie)).statusCode).toBe(403);
    expect((await post(`/ops/verifications/${pendingA.id}/reject`, supportCookie, { note: 'x' })).statusCode).toBe(403);
    expect((await post(`/ops/quote-requests/${quoteRequestId}/decide`, supportCookie, { quotedCents: 50000 })).statusCode).toBe(403);
    expect((await post(`/ops/organisations/${pdOrgId}/pilot`, supportCookie)).statusCode).toBe(403);
    expect((await patch(`/ops/organisations/${pdOrgId}`, supportCookie, { name: 'x' })).statusCode).toBe(403);
    expect((await post('/ops/invoices', supportCookie, { organisationId: pdOrgId, caseIds: [pdCaseId] })).statusCode).toBe(403);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, supportCookie, { status: 'DECLINED' })).statusCode).toBe(403);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, supportCookie, { status: 'IN_PROGRESS' })).statusCode).toBe(200);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, supportCookie, { status: 'DELIVERED' })).statusCode).toBe(200);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, adminCookie, { status: 'OPEN' })).statusCode).toBe(200);
  });

  it('a REVIEWER (role ATTORNEY) is 403 on all of /ops and 200 on /qa', async () => {
    for (const u of ['/ops/verifications', '/ops/organisations', '/ops/quote-requests', '/ops/investigations', '/ops/status', '/ops/credits', '/ops/invoices', '/ops/staff']) {
      expect((await get(u, reviewerCookie)).statusCode, u).toBe(403);
    }
    expect((await post(`/ops/verifications/${pendingA.id}/verify`, reviewerCookie)).statusCode).toBe(403);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, reviewerCookie, { status: 'IN_PROGRESS' })).statusCode).toBe(403);
    expect((await get('/qa/queue', reviewerCookie)).statusCode).toBe(200);
    expect((await get(`/qa/cases/${famCaseId}`, reviewerCookie)).statusCode).toBe(200);
  });

  it('a PROFESSIONAL is 403 on everything under /ops and /qa', async () => {
    for (const u of ['/ops/verifications', '/ops/organisations', '/ops/quote-requests', '/ops/investigations', '/ops/status', '/ops/credits', '/ops/staff', '/qa/queue', `/qa/cases/${famCaseId}`]) {
      expect((await get(u, proCookie)).statusCode, u).toBe(403);
    }
    expect((await post(`/ops/verifications/${pendingA.id}/verify`, proCookie)).statusCode).toBe(403);
    expect((await patch(`/qa/findings/${findingId}`, proCookie, { develop: 'x' })).statusCode).toBe(403);
    expect((await patch(`/ops/investigations/${freshInvestigationId}`, proCookie, { status: 'IN_PROGRESS' })).statusCode).toBe(403);
  });
});
