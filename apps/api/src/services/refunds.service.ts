import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { getStripe, lastReconciliation } from './payments.service';
import { AuditService, LogAction } from './audit.service';

/**
 * Refunds and the Money page (OPS-2, payments_and_refunds spec).
 *
 * A refund is a Refund row plus a rollup on the Payment — never a bare status
 * flip. Console refunds go Stripe → one tenant transaction (Refund row,
 * rollup + status, case event, then audit). Refunds first seen from Stripe
 * (dashboard, chargeback) are recorded under issuer "stripe". Both paths meet
 * on Refund.stripeRefundId being unique, so a webhook echoing a console
 * refund is a no-op.
 */

export const REFUND_REASONS = ['unreadable_record', 'customer_request', 'chargeback', 'other'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

type Payment = NonNullable<Awaited<ReturnType<typeof prisma.payment.findUnique>>>;

export type RefundOutcome =
  | {
      ok: true;
      refundId: string;
      stripeRefundId: string;
      amountCents: number;
      refundedCents: number;
      remainingCents: number;
      status: Payment['status'];
      caseTransitioned: boolean;
    }
  | {
      ok: false;
      error: 'payments_unconfigured' | 'not_found' | 'nothing_to_refund' | 'disputed' | 'over_refund' | 'no_payment_intent';
      remainingCents?: number;
    };

/** Free promo purchases carry a synthetic session id and a $0 charge. */
const isFree = (p: { stripeId: string; amountCents: number }) => p.amountCents === 0 || p.stripeId.startsWith('promo_');
const remainingOf = (p: { amountCents: number; refundedCents: number }) => Math.max(p.amountCents - p.refundedCents, 0);
const statusFor = (p: { amountCents: number; status: Payment['status'] }, refundedCents: number): Payment['status'] =>
  refundedCents >= p.amountCents ? 'REFUNDED' : refundedCents > 0 ? 'PARTIALLY_REFUNDED' : p.status;

/**
 * Write one refund into the ledger and the case file. Shared by the console
 * path and the webhook path; `actor` is a staff userId or "stripe".
 */
async function recordRefund(
  payment: Payment,
  refund: { stripeRefundId: string; amountCents: number; reason: RefundReason; note?: string | null },
  actor: string,
  extraPaymentData: { paymentIntentId?: string | null; chargeId?: string | null } = {}
) {
  return withTenant(payment.tenantId, async (tx) => {
    const row = await tx.refund.create({
      data: {
        paymentId: payment.id,
        stripeRefundId: refund.stripeRefundId,
        caseId: payment.caseId,
        tenantId: payment.tenantId,
        amountCents: refund.amountCents,
        reason: refund.reason,
        note: refund.note ?? null,
        issuedBy: actor,
      },
    });
    const refundedCents = payment.refundedCents + refund.amountCents;
    const status = statusFor(payment, refundedCents);
    await tx.payment.update({
      where: { id: payment.id },
      data: { refundedCents, refundedAt: new Date(), status, ...extraPaymentData },
    });

    // The case file: a full refund of the review moves the case to REFUNDED
    // (legal from every non-terminal state); anything else is an adjustment.
    let caseTransitioned = false;
    if (payment.caseId) {
      const kase = await tx.case.findUnique({ where: { id: payment.caseId }, select: { status: true } });
      if (kase) {
        const full = status === 'REFUNDED' && payment.kind === 'REVIEW';
        caseTransitioned = full && !['REFUNDED', 'DELETED'].includes(kase.status);
        await appendCaseEvent(tx, {
          caseId: payment.caseId,
          tenantId: payment.tenantId,
          type: 'payment.refunded',
          version: 2,
          payload: {
            paymentId: payment.stripeId,
            reason: refund.reason,
            refundId: refund.stripeRefundId,
            amountCents: refund.amountCents,
            partial: status !== 'REFUNDED',
          },
          actor,
          ...(caseTransitioned ? { transition: 'REFUNDED' as const } : {}),
        });
      }
    }
    return { row, refundedCents, status, caseTransitioned };
  });
}

/** Console refund: full (no amount) or partial, any paid kind. */
export async function issueRefund(args: {
  paymentId: string;
  amountCents?: number;
  reason: RefundReason;
  note?: string;
  actor: string;
}): Promise<RefundOutcome> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'payments_unconfigured' };

  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment) return { ok: false, error: 'not_found' };
  if (isFree(payment) || !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
    return { ok: false, error: 'nothing_to_refund' };
  }
  if (payment.disputeStatus === 'open') return { ok: false, error: 'disputed' };

  const remaining = remainingOf(payment);
  if (remaining <= 0) return { ok: false, error: 'nothing_to_refund' };
  const amount = args.amountCents ?? remaining;
  if (amount <= 0 || amount > remaining) return { ok: false, error: 'over_refund', remainingCents: remaining };

  // Older rows predate paymentIntentId; resolve it once and keep it.
  let paymentIntentId = payment.paymentIntentId;
  if (!paymentIntentId) {
    const session = await stripe.checkout.sessions.retrieve(payment.stripeId);
    paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
    if (!paymentIntentId) return { ok: false, error: 'no_payment_intent' };
  }

  // The key includes the pre-refund rollup: retrying this exact step is safe,
  // a later distinct partial is not blocked.
  const stripeRefund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      metadata: { paymentId: payment.id, reason: args.reason, actor: args.actor },
    },
    { idempotencyKey: `refund:${payment.id}:${payment.refundedCents}:${amount}` }
  );

  const { row, refundedCents, status, caseTransitioned } = await recordRefund(
    payment,
    { stripeRefundId: stripeRefund.id, amountCents: amount, reason: args.reason, note: args.note },
    args.actor,
    { paymentIntentId }
  );

  await AuditService.log({
    tenantId: payment.tenantId,
    caseId: payment.caseId ?? `payment:${payment.id}`,
    action: LogAction.REFUND,
    userId: args.actor,
    details: {
      op: 'refund_issued',
      paymentId: payment.id,
      stripeRefundId: stripeRefund.id,
      amountCents: amount,
      refundedCents,
      reason: args.reason,
      note: args.note ?? null,
      partial: status !== 'REFUNDED',
    },
  });

  // Tell the family (G-D2): how much, and when it lands.
  void (async () => {
    const buyer = await prisma.user.findUnique({ where: { id: payment.userId }, select: { email: true, deletedAt: true } });
    if (!buyer?.email || buyer.deletedAt) return;
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    const { sendRefundIssued } = await import('@hg/email');
    await sendRefundIssued(buyer.email, { amountCents: amount, partial: status !== 'REFUNDED', caseUrl: `${origin}/case/${payment.caseId ?? ''}` });
  })().catch((e) => console.warn('[refunds] customer email failed:', (e as Error).message));

  return {
    ok: true,
    refundId: row.id,
    stripeRefundId: stripeRefund.id,
    amountCents: amount,
    refundedCents,
    remainingCents: payment.amountCents - refundedCents,
    status,
    caseTransitioned,
  };
}

interface ChargeLike {
  id: string;
  payment_intent?: string | { id: string } | null;
  amount_refunded?: number;
  refunds?: { data?: Array<{ id: string; amount: number; reason?: string | null }> } | null;
}

const intentOf = (c: { payment_intent?: string | { id: string } | null }) =>
  typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id ?? null;

async function findPaymentForCharge(charge: { id?: string | null; payment_intent?: string | { id: string } | null }) {
  const pi = intentOf(charge);
  const or: Array<Record<string, string>> = [];
  if (pi) or.push({ paymentIntentId: pi }, { stripeId: pi });
  if (charge.id) or.push({ chargeId: charge.id });
  if (!or.length) return null;
  return prisma.payment.findFirst({ where: { OR: or } });
}

/** charge.refunded: record every refund on the charge we haven't seen. */
export async function recordStripeRefunds(charge: ChargeLike): Promise<string> {
  let payment = await findPaymentForCharge(charge);
  if (!payment) return 'no matching payment';

  let refunds = charge.refunds?.data ?? null;
  const stripe = getStripe();
  if (!refunds && stripe) {
    // Recent API versions don't expand refunds on the charge object.
    refunds = (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data;
  }
  if (!refunds || refunds.length === 0) {
    const delta = (charge.amount_refunded ?? payment.amountCents) - payment.refundedCents;
    if (delta <= 0) return 'nothing new';
    refunds = [{ id: `${charge.id}:${charge.amount_refunded ?? payment.amountCents}`, amount: delta, reason: null }];
  }

  let recorded = 0;
  for (const r of refunds) {
    const known = await prisma.refund.findUnique({ where: { stripeRefundId: r.id } });
    if (known) continue;
    await recordRefund(
      payment,
      {
        stripeRefundId: r.id,
        amountCents: r.amount,
        reason: r.reason === 'fraudulent' ? 'chargeback' : 'other',
        note: `Recorded from Stripe${r.reason ? ` (${r.reason})` : ''}`,
      },
      'stripe',
      { paymentIntentId: intentOf(charge) ?? payment.paymentIntentId, chargeId: charge.id }
    );
    recorded++;
    payment = (await prisma.payment.findUnique({ where: { id: payment.id } })) ?? payment;
  }
  return recorded ? `${recorded} refund(s) recorded` : 'already recorded';
}

interface DisputeLike {
  id: string;
  charge?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  status?: string;
  amount?: number;
  created?: number;
}

/** charge.dispute.created / .closed: mark the payment; a lost dispute is a refund. */
export async function recordDispute(type: string, dispute: DisputeLike): Promise<string> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id ?? null;
  const payment = await findPaymentForCharge({ id: chargeId, payment_intent: dispute.payment_intent });
  if (!payment) return 'no matching payment';

  if (type === 'charge.dispute.created') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        disputedAt: dispute.created ? new Date(dispute.created * 1000) : new Date(),
        disputeStatus: 'open',
        ...(chargeId ? { chargeId } : {}),
      },
    });
    return 'dispute opened';
  }

  const outcome = dispute.status === 'won' ? 'won' : dispute.status === 'lost' ? 'lost' : dispute.status ?? 'closed';
  await prisma.payment.update({ where: { id: payment.id }, data: { disputeStatus: outcome } });
  if (outcome === 'lost') {
    const stripeRefundId = `dispute:${dispute.id}`;
    const known = await prisma.refund.findUnique({ where: { stripeRefundId } });
    if (!known) {
      const amount = Math.min(dispute.amount ?? remainingOf(payment), remainingOf(payment));
      if (amount > 0) {
        await recordRefund(payment, { stripeRefundId, amountCents: amount, reason: 'chargeback', note: 'Dispute lost' }, 'stripe');
      }
    }
  }
  return `dispute ${outcome}`;
}

// ---------------------------------------------------------------------------
// Money page reads
// ---------------------------------------------------------------------------

async function joinNames(payments: Array<{ userId: string; caseId: string | null }>) {
  const userIds = [...new Set(payments.map((p) => p.userId))];
  const caseIds = [...new Set(payments.map((p) => p.caseId).filter((c): c is string => !!c))];
  const [users, cases] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
    caseIds.length ? prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, title: true, status: true } }) : [],
  ]);
  return {
    emailOf: new Map(users.map((u) => [u.id, u.email])),
    caseOf: new Map(cases.map((c) => [c.id, c])),
  };
}

function shapePayment(p: Payment, emailOf: Map<string, string>, caseOf: Map<string, { title: string; status: string }>) {
  return {
    id: p.id,
    stripeId: p.stripeId,
    paymentIntentId: p.paymentIntentId,
    caseId: p.caseId,
    caseTitle: p.caseId ? caseOf.get(p.caseId)?.title ?? '(deleted case)' : null,
    caseStatus: p.caseId ? caseOf.get(p.caseId)?.status ?? null : null,
    customerEmail: emailOf.get(p.userId) ?? null,
    kind: p.kind,
    status: p.status,
    amountCents: p.amountCents,
    refundedCents: p.refundedCents,
    remainingCents: remainingOf(p),
    promoCode: p.promoCode,
    free: isFree(p),
    disputeStatus: p.disputeStatus,
    disputedAt: p.disputedAt,
    refundedAt: p.refundedAt,
    createdAt: p.createdAt,
  };
}
export type PaymentView = ReturnType<typeof shapePayment>;

/**
 * Stripe test-mode rows (2026-09-11): a checkout session id starts with
 * `cs_test_` in test mode and `cs_live_` in live mode; promo purchases are
 * `promo_…`. Test purchases are real rows (they create real cases) but not
 * real money, so the Money page hides them unless asked, and an admin can
 * purge them. Live rows and promo rows are never touched.
 */
export const TEST_MODE_WHERE = { stripeId: { startsWith: 'cs_test_' } } as const;
export const isTestModePayment = (p: { stripeId: string }) => p.stripeId.startsWith('cs_test_');

export async function purgeTestPayments(actorUserId: string) {
  const rows = await prisma.payment.findMany({ where: TEST_MODE_WHERE, select: { id: true, tenantId: true, caseId: true, amountCents: true } });
  if (rows.length === 0) return { payments: 0, refunds: 0, amountCents: 0 };
  const ids = rows.map((r) => r.id);
  const refunds = await prisma.refund.deleteMany({ where: { paymentId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { id: { in: ids } } });
  const amountCents = rows.reduce((a, r) => a + r.amountCents, 0);
  await AuditService.log({
    tenantId: rows[0].tenantId, caseId: rows[0].caseId ?? 'ledger', action: LogAction.CASE_ACCESS, userId: actorUserId,
    details: { op: 'purge_test_payments', payments: ids.length, refunds: refunds.count, amountCents },
  });
  return { payments: ids.length, refunds: refunds.count, amountCents };
}

export async function listPayments(opts: { status?: string; q?: string; includeTest?: boolean }) {
  const where: Record<string, unknown> = {};
  if (!opts.includeTest) where.NOT = TEST_MODE_WHERE;
  switch (opts.status) {
    case 'succeeded': where.status = 'SUCCEEDED'; where.amountCents = { gt: 0 }; break;
    case 'refunded': where.status = 'REFUNDED'; break;
    case 'partial': where.status = 'PARTIALLY_REFUNDED'; break;
    case 'disputed': where.disputeStatus = 'open'; break;
    case 'free': where.amountCents = 0; break;
  }
  const term = opts.q?.trim();
  if (term) {
    const [users, cases] = await Promise.all([
      prisma.user.findMany({ where: { email: { contains: term, mode: 'insensitive' } }, select: { id: true }, take: 50 }),
      prisma.case.findMany({ where: { title: { contains: term, mode: 'insensitive' } }, select: { id: true }, take: 50 }),
    ]);
    where.OR = [
      { userId: { in: users.map((u) => u.id) } },
      { caseId: { in: cases.map((c) => c.id) } },
      { promoCode: { contains: term.toUpperCase() } },
      { stripeId: { contains: term } },
      { paymentIntentId: { contains: term } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const { emailOf, caseOf } = await joinNames(rows);
  return { total, rows: rows.map((p) => shapePayment(p, emailOf, caseOf)) };
}

export async function listRefunds(limit = 100) {
  const refunds = await prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  const paymentIds = [...new Set(refunds.map((r) => r.paymentId))];
  const payments = paymentIds.length ? await prisma.payment.findMany({ where: { id: { in: paymentIds } } }) : [];
  const { emailOf, caseOf } = await joinNames(payments);
  const issuerIds = [...new Set(refunds.map((r) => r.issuedBy).filter((i) => i !== 'stripe'))];
  const issuers = issuerIds.length
    ? await prisma.user.findMany({ where: { id: { in: issuerIds } }, select: { id: true, email: true } })
    : [];
  const issuerEmail = new Map(issuers.map((u) => [u.id, u.email]));
  const paymentOf = new Map(payments.map((p) => [p.id, p]));
  return refunds.map((r) => {
    const p = paymentOf.get(r.paymentId);
    return {
      id: r.id,
      paymentId: r.paymentId,
      stripeRefundId: r.stripeRefundId,
      caseId: r.caseId,
      caseTitle: r.caseId ? caseOf.get(r.caseId)?.title ?? '(deleted case)' : null,
      customerEmail: p ? emailOf.get(p.userId) ?? null : null,
      amountCents: r.amountCents,
      paymentAmountCents: p?.amountCents ?? null,
      partial: p ? r.amountCents < p.amountCents : false,
      reason: r.reason,
      note: r.note,
      issuedBy: r.issuedBy,
      issuedByEmail: r.issuedBy === 'stripe' ? 'stripe' : issuerEmail.get(r.issuedBy) ?? r.issuedBy,
      createdAt: r.createdAt,
    };
  });
}

/** Monday (America/Chicago civil date) of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d: Date): string {
  const civil = d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD
  const midnightUtc = new Date(`${civil}T00:00:00Z`);
  const offset = (midnightUtc.getUTCDay() + 6) % 7; // Monday = 0
  midnightUtc.setUTCDate(midnightUtc.getUTCDate() - offset);
  return midnightUtc.toISOString().slice(0, 10);
}

const COLLECTED_STATUSES = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

export async function paymentsSummary(days: number, includeTest = false) {
  const from = new Date(Date.now() - days * 86_400_000);
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
  const [payments, hiddenTestCount, disputedRaw, recentRefunds] = await Promise.all([
    prisma.payment.findMany({ where: { createdAt: { gte: from }, status: { in: [...COLLECTED_STATUSES] }, ...(includeTest ? {} : { NOT: TEST_MODE_WHERE }) } }),
    prisma.payment.count({ where: { ...TEST_MODE_WHERE, createdAt: { gte: from } } }),
    prisma.payment.findMany({ where: { disputeStatus: 'open' }, orderBy: { disputedAt: 'asc' } }),
    listRefunds(8),
  ]);
  // Cohort view: a refund belongs to the week its PAYMENT was sold, whenever
  // it was issued. That is what the 5% reserve policy asks — how much of what
  // we sold came back — and it doesn't jump when an old case is refunded.
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const refunds = payments.length
    ? await prisma.refund.findMany({ where: { paymentId: { in: [...paymentById.keys()] } } })
    : [];

  const reviews = payments.filter((p) => p.kind === 'REVIEW');
  const caseIds = [...new Set(reviews.map((p) => p.caseId).filter((c): c is string => !!c))];
  const costs = caseIds.length
    ? await prisma.costRecord.groupBy({ by: ['caseId'], where: { caseId: { in: caseIds } }, _sum: { amountUsd: true } })
    : [];
  const costOfCase = new Map(costs.map((c) => [c.caseId, c._sum.amountUsd ?? 0]));

  const collectedCents = payments.reduce((a, p) => a + p.amountCents, 0);
  const refundedCents = refunds.reduce((a, r) => a + r.amountCents, 0);
  const netCents = collectedCents - refundedCents;
  const costUsd = reviews.reduce((a, p) => a + (p.caseId ? costOfCase.get(p.caseId) ?? 0 : 0), 0);
  const sold = reviews.length;

  type Week = { weekOf: string; sold: number; collectedCents: number; refundedCents: number; netCents: number; costUsd: number };
  const weeks = new Map<string, Week>();
  const week = (d: Date) => {
    const key = weekOf(d);
    let w = weeks.get(key);
    if (!w) {
      w = { weekOf: key, sold: 0, collectedCents: 0, refundedCents: 0, netCents: 0, costUsd: 0 };
      weeks.set(key, w);
    }
    return w;
  };
  for (const p of payments) {
    const w = week(p.createdAt);
    w.collectedCents += p.amountCents;
    if (p.kind === 'REVIEW') {
      w.sold++;
      w.costUsd += p.caseId ? costOfCase.get(p.caseId) ?? 0 : 0;
    }
  }
  for (const r of refunds) week(paymentById.get(r.paymentId)!.createdAt).refundedCents += r.amountCents;
  for (const w of weeks.values()) w.netCents = w.collectedCents - w.refundedCents;

  const { emailOf, caseOf } = await joinNames(disputedRaw);
  const { listRequests } = await import('./staff-requests.service');
  const requests = (await listRequests()).open;

  return {
    stripe: !stripeKey ? 'unset' : stripeKey.startsWith('sk_live_') ? 'live' : 'test',
    period: { days, from: from.toISOString() },
    testMode: { included: includeTest, hiddenCount: includeTest ? 0 : hiddenTestCount },
    totals: {
      sold,
      freeCount: payments.filter(isFree).length,
      collectedCents,
      refundedCents,
      netCents,
      refundRate: collectedCents > 0 ? refundedCents / collectedCents : null,
      refundCount: refunds.length,
      partialCount: payments.filter((p) => p.status === 'PARTIALLY_REFUNDED').length,
      costUsd,
      costPerCaseUsd: sold ? costUsd / sold : null,
      marginPct: netCents > 0 ? (netCents / 100 - costUsd) / (netCents / 100) : null,
      needsDecision: disputedRaw.length + requests.length,
    },
    weeks: [...weeks.values()].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)),
    disputes: disputedRaw.map((p) => shapePayment(p, emailOf, caseOf)),
    requests,
    recentRefunds,
    reconciliation: lastReconciliation,
  };
}
