import Stripe from 'stripe';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';

/**
 * Commerce core (ENG-5, landing spec §3, system design §7).
 *
 * Two-level idempotency:
 *  1. `PaymentEvent` ledger — one row per Stripe event id; a replayed webhook
 *     is a no-op.
 *  2. `Payment.stripeId` unique — reconciliation can re-drive a session that
 *     the webhook missed without double-creating anything.
 *
 * Account exists BEFORE checkout (W-3); the CASE is created here, on
 * payment success, transactionally — a crash between charge and case
 * self-heals via reconciliation, never via support.
 */

export const PRICES_CENTS = {
  review: Number(process.env.PRICE_REVIEW_CENTS ?? 29900),
  overage: Number(process.env.PRICE_OVERAGE_CENTS ?? 4900),
  rerun: Number(process.env.PRICE_RERUN_CENTS ?? 9900),
} as const;

export type PurchaseKind = keyof typeof PRICES_CENTS;

let stripeSingleton: Stripe | null | undefined;
export function getStripe(): Stripe | null {
  if (stripeSingleton !== undefined) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  stripeSingleton = key ? new Stripe(key) : null;
  return stripeSingleton;
}

/** Maps an S0 outcome to the case's lane/vehicle/mode (workflow §S0). */
export function caseSetupFromOutcome(
  outcome: string,
  answers: Record<string, unknown>
): { lane: 'TRIAL' | 'PLEA' | null; vehicle: string | null; subsequentWrit: boolean } {
  switch (outcome) {
    case 'fit_trial':
      return { lane: 'TRIAL', vehicle: '11.07', subsequentWrit: false };
    case 'fit_plea':
      return { lane: 'PLEA', vehicle: '11.07', subsequentWrit: false };
    case 'prior_writ_warned': {
      const lane = answers['trialOrPlea'] === 'plea' ? 'PLEA' : answers['trialOrPlea'] === 'trial' ? 'TRIAL' : null;
      return { lane, vehicle: '11.07', subsequentWrit: true };
    }
    default:
      // Defensive: non-fit outcomes shouldn't reach purchase (S0 routing).
      return { lane: null, vehicle: null, subsequentWrit: false };
  }
}

interface CheckoutMetadata {
  userId: string;
  tenantId: string;
  kind: PurchaseKind;
  draftToken?: string;
  caseId?: string; // overage/rerun target
}

/** Fulfil a completed checkout session. Safe to call more than once. */
export async function fulfillCheckoutSession(session: {
  id: string;
  amount_total: number | null;
  metadata: Partial<CheckoutMetadata> | null;
}): Promise<{ caseId?: string; skipped?: string }> {
  const meta = session.metadata ?? {};
  const { userId, tenantId, kind } = meta;
  if (!userId || !tenantId || !kind) {
    return { skipped: 'missing metadata' };
  }
  const { capture } = await import('./analytics.service');
  capture('snl.purchase_fulfilled', tenantId, { kind });

  // Level-2 idempotency: this session already fulfilled?
  const existing = await prisma.payment.findUnique({ where: { stripeId: session.id } });
  if (existing) return { caseId: existing.caseId ?? undefined, skipped: 'already fulfilled' };

  // Overage and re-run attach to an EXISTING case — they never create one.
  if (kind !== 'review') {
    if (!meta.caseId) return { skipped: 'missing caseId for non-review purchase' };
    const target = await prisma.case.findUnique({ where: { id: meta.caseId } });
    if (!target || target.tenantId !== tenantId) return { skipped: 'unknown case for purchase' };

    await withTenant(tenantId, async (tx) => {
      await tx.payment.create({
        data: {
          stripeId: session.id,
          caseId: meta.caseId,
          userId,
          tenantId,
          kind: kind.toUpperCase() as 'OVERAGE' | 'RERUN',
          status: 'SUCCEEDED',
          amountCents: session.amount_total ?? PRICES_CENTS[kind],
        },
      });
      if (kind === 'rerun') {
        const runNo = (await tx.analysisRun.count({ where: { caseId: meta.caseId } })) + 1;
        await appendCaseEvent(tx, {
          caseId: meta.caseId!,
          tenantId,
          type: 'rerun.purchased',
          payload: { paymentId: session.id, runNo },
          actor: 'system',
        });
      } else {
        await appendCaseEvent(tx, {
          caseId: meta.caseId!,
          tenantId,
          type: 'payment.succeeded',
          payload: { paymentId: session.id, kind },
          actor: 'system',
        });
      }
    });
    return { caseId: meta.caseId };
  }

  const draft = meta.draftToken
    ? await prisma.eligibilityDraft.findUnique({ where: { token: meta.draftToken } })
    : null;
  const setup = draft
    ? caseSetupFromOutcome(draft.outcome, (draft.answers ?? {}) as Record<string, unknown>)
    : { lane: null, vehicle: null, subsequentWrit: false };

  const caseId = await withTenant(tenantId, async (tx) => {
    const created = await tx.case.create({
      data: {
        title: 'Family Case Review',
        tenantId,
        lane: setup.lane ?? undefined,
        vehicle: setup.vehicle ?? undefined,
        subsequentWrit: setup.subsequentWrit,
        accessList: { create: { userId, role: 'ADMIN' } },
      },
    });

    await tx.payment.create({
      data: {
        stripeId: session.id,
        caseId: created.id,
        userId,
        tenantId,
        kind: kind.toUpperCase() as 'REVIEW' | 'OVERAGE' | 'RERUN',
        status: 'SUCCEEDED',
        amountCents: session.amount_total ?? PRICES_CENTS[kind],
      },
    });

    await appendCaseEvent(tx, {
      caseId: created.id,
      tenantId,
      type: 'case.created',
      payload: {
        ...(setup.lane ? { lane: setup.lane } : {}),
        ...(setup.vehicle ? { vehicle: setup.vehicle as '11.07' } : {}),
      },
      actor: 'system',
    });
    await appendCaseEvent(tx, {
      caseId: created.id,
      tenantId,
      type: 'payment.succeeded',
      payload: { paymentId: session.id, kind },
      actor: 'system',
      transition: 'AWAITING_DOCS',
    });
    if (setup.subsequentWrit) {
      await appendCaseEvent(tx, {
        caseId: created.id,
        tenantId,
        type: 'hold.set',
        payload: { hold: 'SUBSEQUENT_WRIT_MODE' },
        actor: 'system',
        setHold: 'SUBSEQUENT_WRIT_MODE',
      });
    }

    // E-6: bind this purchaser's disclosure acknowledgments to the case so
    // the dispute packet is one query (OPS-3).
    await tx.disclosureAck.updateMany({
      where: { userId, tenantId, caseId: null },
      data: { caseId: created.id },
    });

    return created.id;
  });

  // Receipt (ENG-9): fire-and-forget — a failed send never fails fulfillment.
  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  if (buyer?.email) {
    const { sendReceipt } = await import('@hg/email');
    void sendReceipt(buyer.email, { amountCents: session.amount_total ?? PRICES_CENTS.review });
  }

  // Promotion complete: the draft is copied, now deleted (ENG-7).
  if (draft) {
    await prisma.eligibilityDraft.delete({ where: { token: draft.token } }).catch(() => {});
  }

  return { caseId };
}

/**
 * Process one Stripe event, exactly once (level-1 idempotency via the
 * PaymentEvent ledger).
 */
export async function handleStripeEvent(event: {
  id: string;
  type: string;
  data: { object: unknown };
}): Promise<{ handled: boolean; detail?: string }> {
  try {
    await prisma.paymentEvent.create({
      data: { stripeEventId: event.id, type: event.type },
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      return { handled: false, detail: 'duplicate event' };
    }
    throw e;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Parameters<typeof fulfillCheckoutSession>[0];
      const res = await fulfillCheckoutSession(session);
      return { handled: true, detail: res.skipped ?? `case ${res.caseId}` };
    }
    case 'charge.refunded': {
      const charge = event.data.object as { payment_intent?: string; id: string };
      // Refunds are issued from the Ops console (OPS-2, M6); the webhook is
      // the source-of-truth confirmation that updates the ledger.
      const sessionId = charge.payment_intent ?? charge.id;
      await prisma.payment.updateMany({
        where: { stripeId: sessionId },
        data: { status: 'REFUNDED' },
      });
      return { handled: true, detail: 'refund recorded' };
    }
    case 'charge.dispute.created': {
      // E-6 trigger: the dispute-evidence flow (disclosure archive export)
      // is an Ops console feature (M6); until then this is loudly logged so
      // the 7-21 day response window is never silently missed.
      console.warn('[stripe] DISPUTE OPENED — assemble E-6 evidence packet:', event.id);
      return { handled: true, detail: 'dispute logged' };
    }
    default:
      return { handled: true, detail: `ignored ${event.type}` };
  }
}

/**
 * Hourly reconciliation (ENG-5): recent completed sessions that never got a
 * webhook are fulfilled here; fulfilled ones are level-2 no-ops.
 */
export async function reconcilePayments(): Promise<{ checked: number; healed: number }> {
  const stripe = getStripe();
  if (!stripe) return { checked: 0, healed: 0 };

  // Sessions expire 24h after creation but can be PAID at any point in that
  // window — the lookback must cover the full session lifetime plus slack,
  // or a payment on an old session slips through unfulfilled.
  const lookback = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: lookback },
    limit: 100,
  });

  let healed = 0;
  for (const s of sessions.data) {
    if (s.payment_status !== 'paid') continue;
    const res = await fulfillCheckoutSession({
      id: s.id,
      amount_total: s.amount_total,
      metadata: (s.metadata ?? null) as Partial<CheckoutMetadata> | null,
    });
    if (res.caseId && !res.skipped) healed++;
  }
  return { checked: sessions.data.length, healed };
}
