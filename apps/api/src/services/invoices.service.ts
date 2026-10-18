import prisma, { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import { resolvePrice, COUNSEL_SKU_FOR_BUCKET, type Sku } from '@hg/case-lifecycle';
import { AuditService, LogAction } from './audit.service';
import { bucketOfCase, loadPriceBook, settledQuote } from './quote.service';

/**
 * ACH invoices for offices and clinics (persona_rollout_plan.md §4: "invoice
 * offices by ACH with lines by matter and cause number") and the admin's
 * answer to a Long-record quote request. Both are staff writes: owner
 * connection for the cross-tenant read, `withTenant` for the row, one audit
 * row each. The PDF statement is the February slice; the rows land now so
 * the Money page (workstream G) has something to show.
 */

export interface InvoiceLine {
  caseId: string;
  causeNumber?: string;
  sku: Sku;
  cents: number;
}

/** INV-<year>-<4 digits>, counted per year; the unique index settles a race. */
async function nextInvoiceNumber(year: number): Promise<string> {
  const prefix = `INV-${year}-`;
  const n = await prisma.invoice.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

/**
 * Cause numbers come from the counsel Matter (workstream C). The table may
 * not exist yet on this branch, so the read is a raw query that degrades to
 * "no cause number" rather than a coupling on the Prisma model.
 */
async function causeNumbersFor(caseIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (caseIds.length === 0) return out;
  try {
    const rows = await prisma.$queryRaw<{ caseId: string; causeNumber: string | null }[]>`
      SELECT "caseId", "causeNumber" FROM "Matter" WHERE "caseId" IN (${Prisma.join(caseIds)})`;
    for (const r of rows) if (r.causeNumber) out.set(r.caseId, r.causeNumber);
  } catch {
    // No Matter table (yet): lines carry the case id only.
  }
  return out;
}

export type CreateInvoiceResult =
  | { ok: true; invoice: Awaited<ReturnType<typeof prisma.invoice.create>> }
  | { ok: false; status: number; error: 'ORGANISATION_NOT_FOUND' | 'FOREIGN_CASE' | 'NO_LINES'; caseId?: string };

/**
 * A DRAFT for an organisation from a list of its cases. Each line is priced
 * from the counsel ladder for the case's rung — the accepted quote's SKU
 * when one exists, else the stored bucket — and an admin may override any
 * line's cents (`centsByCase`). Cases outside the organisation are refused.
 */
export async function createInvoice(input: { organisationId: string; caseIds: string[]; centsByCase?: Record<string, number>; actorId: string }): Promise<CreateInvoiceResult> {
  const org = await prisma.organisation.findUnique({ where: { id: input.organisationId } });
  if (!org) return { ok: false, status: 404, error: 'ORGANISATION_NOT_FOUND' };
  const caseIds = [...new Set(input.caseIds)];
  if (caseIds.length === 0) return { ok: false, status: 400, error: 'NO_LINES' };
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } } });
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const id of caseIds) {
    const c = byId.get(id);
    if (!c || c.tenantId !== org.tenantId) return { ok: false, status: 409, error: 'FOREIGN_CASE', caseId: id };
  }
  const book = await loadPriceBook();
  const at = new Date().toISOString();
  const causes = await causeNumbersFor(caseIds);

  const lines: InvoiceLine[] = [];
  for (const id of caseIds) {
    const c = byId.get(id)!;
    const settled = await withTenant(org.tenantId, (tx) => settledQuote(tx, id));
    const bucket = bucketOfCase(c);
    const sku = (settled?.sku as Sku | undefined) ?? (bucket ? COUNSEL_SKU_FOR_BUCKET[bucket] : 'COUNSEL_STANDARD');
    const row = resolvePrice(book, { audience: 'ATTORNEY', sku, at });
    const cents = input.centsByCase?.[id] ?? row?.cents ?? 0;
    const causeNumber = causes.get(id);
    lines.push({ caseId: id, ...(causeNumber ? { causeNumber } : {}), sku, cents });
  }
  const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);

  // Two admins drafting at once can collide on the number; try again.
  let invoice: Awaited<ReturnType<typeof prisma.invoice.create>> | null = null;
  for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
    const number = await nextInvoiceNumber(new Date().getUTCFullYear());
    try {
      invoice = await withTenant(org.tenantId, (tx) =>
        tx.invoice.create({
          data: { tenantId: org.tenantId, organisationId: org.id, number, status: 'DRAFT', totalCents, lines: lines as unknown as Prisma.InputJsonValue },
        })
      );
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  if (!invoice) throw new Error('invoice: could not allocate a number');

  await AuditService.log({
    tenantId: org.tenantId,
    caseId: `invoice:${invoice.number}`,
    action: LogAction.INVOICE,
    userId: input.actorId,
    details: { op: 'invoice_created', invoiceId: invoice.id, organisationId: org.id, number: invoice.number, totalCents, lineCount: lines.length, caseIds },
  });
  return { ok: true, invoice };
}

export type MarkPaidResult =
  | { ok: true; invoice: Awaited<ReturnType<typeof prisma.invoice.update>> }
  | { ok: false; status: number; error: 'NOT_FOUND' | 'ALREADY_PAID' | 'VOID' };

/** ACH landed: PAID, with the bank reference and who recorded it. SENT/DRAFT both accept it (a draft paid on sight is still paid). */
export async function markInvoicePaid(input: { invoiceId: string; achReference: string; actorId: string }): Promise<MarkPaidResult> {
  const existing = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!existing) return { ok: false, status: 404, error: 'NOT_FOUND' };
  if (existing.status === 'PAID') return { ok: false, status: 409, error: 'ALREADY_PAID' };
  if (existing.status === 'VOID') return { ok: false, status: 409, error: 'VOID' };
  const invoice = await withTenant(existing.tenantId, (tx) =>
    tx.invoice.update({
      where: { id: existing.id },
      data: { status: 'PAID', paidAt: new Date(), paidBy: input.actorId, achReference: input.achReference, issuedAt: existing.issuedAt ?? new Date() },
    })
  );
  await AuditService.log({
    tenantId: existing.tenantId,
    caseId: `invoice:${existing.number}`,
    action: LogAction.INVOICE,
    userId: input.actorId,
    details: { op: 'invoice_marked_paid', invoiceId: existing.id, number: existing.number, totalCents: existing.totalCents, achReference: input.achReference },
  });
  return { ok: true, invoice };
}

export async function listInvoices(opts: { organisationId?: string; status?: string } = {}) {
  const rows = await prisma.invoice.findMany({
    where: {
      ...(opts.organisationId ? { organisationId: opts.organisationId } : {}),
      ...(opts.status ? { status: opts.status as 'DRAFT' | 'SENT' | 'PAID' | 'VOID' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const orgIds = [...new Set(rows.map((r) => r.organisationId))];
  const orgs = orgIds.length ? await prisma.organisation.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, kind: true, isTest: true } }) : [];
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return rows.map((r) => ({ ...r, organisation: byId.get(r.organisationId) ?? null }));
}

// ── Quote requests (Long records) ───────────────────────────────────────────

export async function listQuoteRequests(opts: { status?: string } = {}) {
  const rows = await prisma.quoteRequest.findMany({
    where: opts.status ? { status: opts.status as 'OPEN' | 'QUOTED' | 'DECLINED' } : {},
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
  const userIds = [...new Set(rows.map((r) => r.requestedBy))];
  const [orgs, users, cases] = await Promise.all([
    tenantIds.length ? prisma.organisation.findMany({ where: { tenantId: { in: tenantIds } }, select: { tenantId: true, id: true, name: true, kind: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    rows.length ? prisma.case.findMany({ where: { id: { in: rows.map((r) => r.caseId) } }, select: { id: true, title: true, status: true } }) : [],
  ]);
  const orgByTenant = new Map(orgs.map((o) => [o.tenantId, o]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  return rows.map((r) => ({
    ...r,
    organisation: orgByTenant.get(r.tenantId) ?? null,
    requester: userById.get(r.requestedBy) ?? null,
    case: caseById.get(r.caseId) ?? null,
  }));
}

export type DecideQuoteResult =
  | { ok: true; quoteRequest: Awaited<ReturnType<typeof prisma.quoteRequest.update>> }
  | { ok: false; status: number; error: 'NOT_FOUND' | 'ALREADY_DECIDED' | 'NEED_A_PRICE_OR_A_DECLINE' };

/** An admin answers: a price in cents (QUOTED) or a decline. Audited, and on the case's timeline. */
export async function decideQuoteRequest(input: { id: string; quotedCents?: number; decline?: boolean; note?: string; actorId: string }): Promise<DecideQuoteResult> {
  const existing = await prisma.quoteRequest.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, status: 404, error: 'NOT_FOUND' };
  if (existing.status !== 'OPEN') return { ok: false, status: 409, error: 'ALREADY_DECIDED' };
  const decline = input.decline === true;
  if (!decline && !(typeof input.quotedCents === 'number' && input.quotedCents > 0)) {
    return { ok: false, status: 400, error: 'NEED_A_PRICE_OR_A_DECLINE' };
  }
  const decision = decline ? 'DECLINED' : 'QUOTED';
  const quoteRequest = await withTenant(existing.tenantId, async (tx) => {
    const updated = await tx.quoteRequest.update({
      where: { id: existing.id },
      data: { status: decision, quotedCents: decline ? null : input.quotedCents, decidedBy: input.actorId, decidedAt: new Date() },
    });
    await appendCaseEvent(tx, {
      caseId: existing.caseId, tenantId: existing.tenantId, type: 'quote.decided', actor: input.actorId,
      payload: { quoteRequestId: existing.id, decision, ...(decline ? {} : { quotedCents: input.quotedCents }) },
    });
    return updated;
  });
  await AuditService.log({
    tenantId: existing.tenantId,
    caseId: existing.caseId,
    action: LogAction.QUOTE_DECISION,
    userId: input.actorId,
    details: { quoteRequestId: existing.id, decision, quotedCents: decline ? null : input.quotedCents, note: input.note ?? null },
  });
  return { ok: true, quoteRequest };
}
