/**
 * Ops: quote requests and ACH invoices (persona_rollout_plan.md §5 B,
 * staff_console.md §11) — live Postgres.
 *  B12 an ADMIN drafts an invoice with a line per case, marks it paid with
 *      the ACH reference, both audited; SUPPORT gets 403 on the writes (and
 *      on the money reads); a Long-record quote request is answered once.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { encodeSessionToken } from '@hg/auth';

const run = `opsc_${Date.now()}`;
let staffTenant: string;
let adminId: string;
let adminCookie: string;
let supportCookie: string;
let clientCookie: string;
let orgTenant: string;
let orgId: string;
let proId: string;
let caseA: string; // STANDARD
let caseB: string; // EXTENDED
let foreignCase: string;
let famTenant: string;

/** AuditLog is append-only, so rows from earlier runs survive: scope by the invoice id in details. */
const auditFor = async (invoiceId: string) =>
  (await prisma.auditLog.findMany({ where: { action: 'INVOICE' }, orderBy: { createdAt: 'asc' } })).filter((a) => (a.details as { invoiceId?: string }).invoiceId === invoiceId);

const get = (url: string, cookie: string) => fastify.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload: unknown = {}) =>
  fastify.inject({ method: 'POST', url, headers: { cookie }, payload: payload as Record<string, unknown> });

beforeAll(async () => {
  staffTenant = (await prisma.tenant.create({ data: { name: `${run}_staff` } })).id;
  const admin = await prisma.user.create({ data: { email: `${run}_admin@example.com`, tenantId: staffTenant, role: 'ADMIN' } });
  adminId = admin.id;
  const support = await prisma.user.create({ data: { email: `${run}_support@example.com`, tenantId: staffTenant, role: 'SUPPORT' } });
  adminCookie = `next-auth.session-token=${await encodeSessionToken({ userId: adminId, tenantId: staffTenant, role: 'ADMIN' })}`;
  supportCookie = `next-auth.session-token=${await encodeSessionToken({ userId: support.id, tenantId: staffTenant, role: 'SUPPORT' })}`;

  orgTenant = (await prisma.tenant.create({ data: { name: `${run}_pd` } })).id;
  orgId = (await prisma.organisation.create({ data: { tenantId: orgTenant, kind: 'PD_OFFICE', name: 'Harris County Public Defender', billingEmail: `${run}_billing@example.com` } })).id;
  const pro = await prisma.user.create({ data: { email: `${run}_pro@example.com`, tenantId: orgTenant, role: 'CLIENT', accountKind: 'PROFESSIONAL' } });
  proId = pro.id;
  clientCookie = `next-auth.session-token=${await encodeSessionToken({ userId: proId, tenantId: orgTenant, role: 'CLIENT' })}`;
  const mk = (title: string, tenantId: string, bucket: string, status: 'QUOTED' | 'DOCS_COMPLETE') =>
    prisma.case.create({ data: { title, tenantId, status, lane: 'TRIAL', vehicle: '11.07', recordBucket: bucket, meteredPages: { reporter: 300, clerk: 0, exhibit: 0, unknown: 0 } } });
  caseA = (await mk(`${run}_A`, orgTenant, 'STANDARD', 'QUOTED')).id;
  caseB = (await mk(`${run}_B`, orgTenant, 'EXTENDED', 'QUOTED')).id;
  // Case A is a counsel matter (workstream C) with a cause number; B has none.
  await prisma.matter.create({ data: { caseId: caseA, tenantId: orgTenant, organisationId: orgId, openedBy: proId, vehicle: '11.07', county: 'Harris', causeNumber: '1234567', clientInitials: 'JD' } });
  famTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id;
  foreignCase = (await mk(`${run}_F`, famTenant, 'STANDARD', 'DOCS_COMPLETE')).id;
});

afterAll(async () => {
  const tenants = [staffTenant, orgTenant, famTenant];
  await prisma.invoice.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.matter.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.quoteRequest.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.case.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
  await fastify.close();
  await prisma.$disconnect();
});

describe('B12 — invoices', () => {
  let invoiceId: string;
  let number: string;

  it('ADMIN drafts an invoice for an organisation: one line per case priced from the counsel ladder, INV-<year>-<nnnn>, audited', async () => {
    const res = await post('/ops/invoices', adminCookie, { organisationId: orgId, caseIds: [caseA, caseB] });
    expect(res.statusCode).toBe(200);
    const inv = res.json();
    invoiceId = inv.id;
    number = inv.number;
    expect(number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(inv).toMatchObject({
      tenantId: orgTenant, organisationId: orgId, status: 'DRAFT', totalCents: 59800, paidAt: null, achReference: null,
      lines: [
        { caseId: caseA, causeNumber: '1234567', sku: 'COUNSEL_STANDARD', cents: 24900 },
        { caseId: caseB, sku: 'COUNSEL_EXTENDED', cents: 34900 },
      ],
    });
    expect((inv.lines as { causeNumber?: string }[])[1].causeNumber).toBeUndefined();
    const audit = await auditFor(invoiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenantId: orgTenant, userId: adminId });
    expect(audit[0].details).toMatchObject({ op: 'invoice_created', invoiceId, number, totalCents: 59800, lineCount: 2, caseIds: [caseA, caseB] });

    // Numbers never repeat; an admin may override a line's cents (a quoted Long record).
    const second = await post('/ops/invoices', adminCookie, { organisationId: orgId, caseIds: [caseB], centsByCase: { [caseB]: 75000 } });
    expect(second.statusCode).toBe(200);
    expect(second.json().number).not.toBe(number);
    expect(second.json()).toMatchObject({ totalCents: 75000, lines: [{ caseId: caseB, sku: 'COUNSEL_EXTENDED', cents: 75000 }] });
  });

  it('refuses a case outside the organisation, an unknown organisation and an empty list', async () => {
    const foreign = await post('/ops/invoices', adminCookie, { organisationId: orgId, caseIds: [caseA, foreignCase] });
    expect(foreign.statusCode).toBe(409);
    expect(foreign.json()).toMatchObject({ error: 'FOREIGN_CASE', caseId: foreignCase });
    expect((await post('/ops/invoices', adminCookie, { organisationId: 'nope', caseIds: [caseA] })).statusCode).toBe(404);
    expect((await post('/ops/invoices', adminCookie, { organisationId: orgId, caseIds: [] })).statusCode).toBe(400);
  });

  it('GET /ops/invoices lists them with the organisation; filters by organisation and status', async () => {
    const res = await get(`/ops/invoices?organisationId=${orgId}`, adminCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.json().find((i: { id: string }) => i.id === invoiceId)).toMatchObject({ number, status: 'DRAFT', organisation: { id: orgId, name: 'Harris County Public Defender', kind: 'PD_OFFICE', isTest: false } });
    expect((await get(`/ops/invoices?organisationId=${orgId}&status=PAID`, adminCookie)).json()).toEqual([]);
  });

  it('mark-paid sets PAID with the ACH reference, who and when, audited; a second mark-paid is 409; unknown is 404', async () => {
    const res = await post(`/ops/invoices/${invoiceId}/mark-paid`, adminCookie, { achReference: 'ACH-2026-00042' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: invoiceId, status: 'PAID', achReference: 'ACH-2026-00042', paidBy: adminId });
    expect(res.json().paidAt).toBeTruthy();
    expect(res.json().issuedAt).toBeTruthy();
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(stored.status).toBe('PAID');
    const audit = await auditFor(invoiceId);
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ tenantId: orgTenant, userId: adminId });
    expect(audit[1].details).toMatchObject({ op: 'invoice_marked_paid', invoiceId, number, achReference: 'ACH-2026-00042' });
    expect((await post(`/ops/invoices/${invoiceId}/mark-paid`, adminCookie, { achReference: 'ACH-again' })).statusCode).toBe(409);
    expect((await post(`/ops/invoices/nope/mark-paid`, adminCookie, { achReference: 'ACH-x' })).statusCode).toBe(404);
    expect((await post(`/ops/invoices/${invoiceId}/mark-paid`, adminCookie, {})).statusCode).toBe(400);
    expect((await get(`/ops/invoices?organisationId=${orgId}&status=PAID`, adminCookie)).json().map((i: { id: string }) => i.id)).toEqual([invoiceId]);
  });

  it('SUPPORT gets 403 on invoice writes and reads; a professional gets 403 on all of /ops', async () => {
    expect((await post('/ops/invoices', supportCookie, { organisationId: orgId, caseIds: [caseA] })).statusCode).toBe(403);
    expect((await post(`/ops/invoices/${invoiceId}/mark-paid`, supportCookie, { achReference: 'ACH-no' })).statusCode).toBe(403);
    expect((await get('/ops/invoices', supportCookie)).statusCode).toBe(403);
    expect((await post('/ops/invoices', clientCookie, { organisationId: orgId, caseIds: [caseA] })).statusCode).toBe(403);
    expect((await get('/ops/invoices', clientCookie)).statusCode).toBe(403);
    expect(await prisma.invoice.count({ where: { organisationId: orgId } })).toBe(2);
  });
});

describe('quote requests — the admin answers a Long record once', () => {
  let openId: string;
  let declineId: string;

  beforeAll(async () => {
    const mk = () => prisma.quoteRequest.create({ data: { tenantId: orgTenant, caseId: caseA, requestedBy: proId, meteredPages: { reporter: 2200, clerk: 300, exhibit: 0, total: 2500 }, note: 'capital case' } });
    openId = (await mk()).id;
    declineId = (await mk()).id;
  });

  it('GET /ops/quote-requests lists OPEN ones with organisation, requester and case; SUPPORT may read', async () => {
    const res = await get('/ops/quote-requests?status=OPEN', supportCookie);
    expect(res.statusCode).toBe(200);
    const mine = res.json().find((q: { id: string }) => q.id === openId);
    expect(mine).toMatchObject({
      status: 'OPEN', caseId: caseA, note: 'capital case', meteredPages: { reporter: 2200, total: 2500 },
      organisation: { id: orgId, name: 'Harris County Public Defender', kind: 'PD_OFFICE' },
      requester: { id: proId, email: `${run}_pro@example.com` },
      case: { id: caseA, status: 'QUOTED' },
    });
  });

  it('decide: a price (QUOTED) or a decline (DECLINED), audited and on the case timeline; never twice; SUPPORT 403', async () => {
    expect((await post(`/ops/quote-requests/${openId}/decide`, supportCookie, { quotedCents: 75000 })).statusCode).toBe(403);
    expect((await post(`/ops/quote-requests/${openId}/decide`, adminCookie, { note: 'neither' })).statusCode).toBe(400);
    expect((await post(`/ops/quote-requests/nope/decide`, adminCookie, { quotedCents: 75000 })).statusCode).toBe(404);

    const quoted = await post(`/ops/quote-requests/${openId}/decide`, adminCookie, { quotedCents: 75000, note: 'Seven volumes, two engines' });
    expect(quoted.statusCode).toBe(200);
    expect(quoted.json()).toMatchObject({ id: openId, status: 'QUOTED', quotedCents: 75000, decidedBy: adminId });
    expect(quoted.json().decidedAt).toBeTruthy();
    expect((await post(`/ops/quote-requests/${openId}/decide`, adminCookie, { quotedCents: 1 })).statusCode).toBe(409);

    const declined = await post(`/ops/quote-requests/${declineId}/decide`, adminCookie, { decline: true, note: 'Not until the split ships' });
    expect(declined.statusCode).toBe(200);
    expect(declined.json()).toMatchObject({ id: declineId, status: 'DECLINED', quotedCents: null, decidedBy: adminId });

    const audits = await prisma.auditLog.findMany({ where: { action: 'QUOTE_DECISION', caseId: caseA }, orderBy: { createdAt: 'asc' } });
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ tenantId: orgTenant, userId: adminId });
    expect(audits[0].details).toMatchObject({ quoteRequestId: openId, decision: 'QUOTED', quotedCents: 75000, note: 'Seven volumes, two engines' });
    expect(audits[1].details).toMatchObject({ quoteRequestId: declineId, decision: 'DECLINED', quotedCents: null });
    const events = await prisma.caseEvent.findMany({ where: { caseId: caseA, type: 'quote.decided' }, orderBy: { id: 'asc' } });
    expect(events.map((e) => e.payload)).toEqual([
      { quoteRequestId: openId, decision: 'QUOTED', quotedCents: 75000 },
      { quoteRequestId: declineId, decision: 'DECLINED' },
    ]);
    expect((await get('/ops/quote-requests?status=OPEN', adminCookie)).json().some((q: { id: string }) => q.id === openId || q.id === declineId)).toBe(false);
    expect((await get('/ops/quote-requests', adminCookie)).json().filter((q: { id: string }) => q.id === openId || q.id === declineId)).toHaveLength(2);
  });
});
