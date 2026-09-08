import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from './audit.service';
import { issueRefund, REFUND_REASONS, type RefundReason } from './refunds.service';

/**
 * OPS-6 contact log + the request-to-Admin flow (staff_console_access_model
 * §6). Support records what happened and what they need; an Admin decides
 * with the reason in front of them; the case timeline carries the thread.
 */

export const NOTE_CHANNELS = ['email', 'phone', 'chat', 'internal'] as const;
export type NoteChannel = (typeof NOTE_CHANNELS)[number];

export const REQUEST_TYPES = ['REFUND', 'CASE_DELETE', 'ACCOUNT_DELETE'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const DELETE_REASONS = ['customer_request', 'duplicate', 'retention', 'other'] as const;

const staffEmail = async (ids: string[]) => {
  const unique = [...new Set(ids.filter((i) => i !== 'stripe'))];
  const users = unique.length ? await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, email: true } }) : [];
  return new Map(users.map((u) => [u.id, u.email]));
};

// ---------------------------------------------------------------------------
// Contact log
// ---------------------------------------------------------------------------

export async function addSupportNote(args: { caseId: string; channel: NoteChannel; body: string; authorId: string }) {
  const kase = await prisma.case.findUnique({ where: { id: args.caseId }, select: { tenantId: true } });
  if (!kase) return null;
  return withTenant(kase.tenantId, async (tx) => {
    const note = await tx.supportNote.create({
      data: { caseId: args.caseId, tenantId: kase.tenantId, channel: args.channel, body: args.body, authorId: args.authorId },
    });
    await appendCaseEvent(tx, {
      caseId: args.caseId, tenantId: kase.tenantId, type: 'support.contacted',
      payload: { noteId: note.id, channel: args.channel }, actor: args.authorId,
    });
    return note;
  });
}

export async function listSupportNotes(caseId: string) {
  const notes = await prisma.supportNote.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' } });
  const emailOf = await staffEmail(notes.map((n) => n.authorId));
  return notes.map((n) => ({ ...n, authorEmail: emailOf.get(n.authorId) ?? n.authorId }));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type OpenRequestOutcome =
  | { ok: true; request: Awaited<ReturnType<typeof prisma.staffRequest.create>> }
  | { ok: false; error: 'not_found' | 'already_open' | 'nothing_to_refund' | 'bad_reason'; openRequestId?: string };

export async function openRequest(args: {
  caseId: string;
  type: RequestType;
  reason: string;
  note?: string;
  amountCents?: number;
  requestedBy: string;
}): Promise<OpenRequestOutcome> {
  const kase = await prisma.case.findUnique({ where: { id: args.caseId }, select: { tenantId: true, title: true } });
  if (!kase) return { ok: false, error: 'not_found' };
  const validReasons: readonly string[] = args.type === 'REFUND' ? REFUND_REASONS : DELETE_REASONS;
  if (!validReasons.includes(args.reason)) return { ok: false, error: 'bad_reason' };

  const open = await prisma.staffRequest.findFirst({ where: { caseId: args.caseId, type: args.type, decision: null } });
  if (open) return { ok: false, error: 'already_open', openRequestId: open.id };

  if (args.type === 'REFUND') {
    const payment = await prisma.payment.findFirst({
      where: { caseId: args.caseId, kind: 'REVIEW', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, amountCents: { gt: 0 } },
    });
    if (!payment) return { ok: false, error: 'nothing_to_refund' };
  }

  const request = await withTenant(kase.tenantId, async (tx) => {
    const r = await tx.staffRequest.create({
      data: {
        caseId: args.caseId, tenantId: kase.tenantId, type: args.type, reason: args.reason,
        note: args.note ?? null, amountCents: args.type === 'REFUND' ? args.amountCents ?? null : null,
        requestedBy: args.requestedBy,
      },
    });
    await appendCaseEvent(tx, {
      caseId: args.caseId, tenantId: kase.tenantId, type: 'request.opened',
      payload: { requestId: r.id, kind: args.type }, actor: args.requestedBy,
    });
    return r;
  });

  // One email per request, to every Admin — fire-and-forget (ENG-9).
  void (async () => {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { email: true } });
    const requester = (await staffEmail([args.requestedBy])).get(args.requestedBy) ?? 'Support';
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    const { sendStaffRequest } = await import('@hg/email');
    for (const a of admins) {
      void sendStaffRequest(a.email, {
        kind: args.type, caseTitle: kase.title, requestedBy: requester, reason: args.reason, note: args.note,
        consoleUrl: `${origin}/ops/cases/${args.caseId}`,
      });
    }
  })().catch((e) => console.warn('[requests] admin notification failed:', (e as Error).message));

  return { ok: true, request };
}

async function shapeRequests(rows: Awaited<ReturnType<typeof prisma.staffRequest.findMany>>) {
  const caseIds = [...new Set(rows.map((r) => r.caseId))];
  const cases = caseIds.length ? await prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, title: true, status: true } }) : [];
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const emailOf = await staffEmail(rows.flatMap((r) => [r.requestedBy, r.decidedBy ?? '']).filter(Boolean));
  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId,
    caseTitle: caseOf.get(r.caseId)?.title ?? '(deleted case)',
    caseStatus: caseOf.get(r.caseId)?.status ?? null,
    type: r.type,
    reason: r.reason,
    note: r.note,
    amountCents: r.amountCents,
    requestedBy: r.requestedBy,
    requestedByEmail: emailOf.get(r.requestedBy) ?? r.requestedBy,
    decision: r.decision,
    decidedBy: r.decidedBy,
    decidedByEmail: r.decidedBy ? emailOf.get(r.decidedBy) ?? r.decidedBy : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
  }));
}
export type RequestView = Awaited<ReturnType<typeof shapeRequests>>[number];

/** Open requests (oldest first) plus recent decisions; `mine` narrows to one requester. */
export async function listRequests(opts: { mine?: string; caseId?: string } = {}) {
  const where = { ...(opts.mine ? { requestedBy: opts.mine } : {}), ...(opts.caseId ? { caseId: opts.caseId } : {}) };
  const [open, decided] = await Promise.all([
    prisma.staffRequest.findMany({ where: { ...where, decision: null }, orderBy: { createdAt: 'asc' } }),
    prisma.staffRequest.findMany({ where: { ...where, decision: { not: null } }, orderBy: { decidedAt: 'desc' }, take: 25 }),
  ]);
  return { open: await shapeRequests(open), decided: await shapeRequests(decided) };
}

export type DecideOutcome =
  | { ok: true; decision: 'APPROVED' | 'DECLINED'; result?: unknown }
  | { ok: false; status: number; error: string };

/** Approve runs the real action under the Admin's name; decline needs a line for the requester. */
export async function decideRequest(args: {
  requestId: string;
  decision: 'APPROVED' | 'DECLINED';
  decisionNote?: string;
  decidedBy: string;
}): Promise<DecideOutcome> {
  const r = await prisma.staffRequest.findUnique({ where: { id: args.requestId } });
  if (!r) return { ok: false, status: 404, error: 'Not found' };
  if (r.decision) return { ok: false, status: 409, error: `Already ${r.decision.toLowerCase()}` };
  if (args.decision === 'DECLINED' && !args.decisionNote?.trim()) {
    return { ok: false, status: 400, error: 'Say why in a line — the requester will read it' };
  }

  let result: unknown;
  if (args.decision === 'APPROVED') {
    if (r.type === 'REFUND') {
      const payment = await prisma.payment.findFirst({
        where: { caseId: r.caseId, kind: 'REVIEW', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, amountCents: { gt: 0 } },
      });
      if (!payment) return { ok: false, status: 409, error: 'No refundable payment on this case any more' };
      const outcome = await issueRefund({
        paymentId: payment.id, amountCents: r.amountCents ?? undefined, reason: r.reason as RefundReason,
        note: r.note ? `Requested by support: ${r.note}` : 'Requested by support', actor: args.decidedBy,
      });
      if (!outcome.ok) {
        const status = outcome.error === 'payments_unconfigured' ? 503 : outcome.error === 'not_found' ? 404 : 409;
        return { ok: false, status, error: `Refund failed: ${outcome.error.replace(/_/g, ' ')}` };
      }
      result = outcome;
    } else if (r.type === 'CASE_DELETE') {
      const { deleteCaseScoped } = await import('./deletion.service');
      const deleted = await deleteCaseScoped(r.caseId, args.decidedBy);
      if (!deleted) return { ok: false, status: 404, error: 'Case is already gone' };
      result = deleted;
    } else {
      const owner = await prisma.caseAccess.findFirst({ where: { caseId: r.caseId, role: 'ADMIN' }, select: { userId: true } });
      if (!owner) return { ok: false, status: 409, error: 'No customer account on this case' };
      const { deleteAccount } = await import('./deletion.service');
      const out = await deleteAccount(owner.userId, args.decidedBy);
      const err = (out as { error?: string }).error;
      if (err) return { ok: false, status: err === 'not_found' ? 404 : 409, error: err.replace(/_/g, ' ') };
      result = out;
    }
  }

  await withTenant(r.tenantId, async (tx) => {
    await tx.staffRequest.update({
      where: { id: r.id },
      data: { decision: args.decision, decidedBy: args.decidedBy, decisionNote: args.decisionNote?.trim() || null, decidedAt: new Date() },
    });
    // A deleted case keeps its event skeleton, so the decision still lands.
    await appendCaseEvent(tx, {
      caseId: r.caseId, tenantId: r.tenantId, type: 'request.decided',
      payload: { requestId: r.id, kind: r.type, decision: args.decision }, actor: args.decidedBy,
    });
  });
  await AuditService.log({
    tenantId: r.tenantId, caseId: r.caseId, action: LogAction.CASE_ACCESS, userId: args.decidedBy,
    details: { op: 'request_decided', requestId: r.id, kind: r.type, decision: args.decision, requestedBy: r.requestedBy, note: args.decisionNote ?? null },
  });
  return { ok: true, decision: args.decision, result };
}
