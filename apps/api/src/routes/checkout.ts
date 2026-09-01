import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma, { withTenant } from '@hg/database';
import { DISCLOSURE_SET_VERSION } from '@hg/case-lifecycle';
import { getStripe, PRICES_CENTS, type PurchaseKind } from '../services/payments.service';

/**
 * The S1 purchase flow, API side (landing spec §3 W-3/W-4, auth design §12.2):
 *  1. POST /buy/account (anon)  — the ONLY self-registration surface: creates
 *     a CLIENT user + single-member tenant in one transaction. Every other
 *     role stays invite-only.
 *  2. POST /checkout/session (auth, CLIENT) — Stripe Checkout hosted page;
 *     the Case is created by the webhook on payment success, never here.
 */

const AccountSchema = z.object({
  email: z.string().email().max(254),
  // Mirrors the auth spec: ≥12 chars, uppercase, number-or-symbol.
  password: z
    .string()
    .min(12)
    .max(200)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>/?]/, 'Must contain a number or symbol'),
  name: z.string().max(100).optional(),
});

const SessionSchema = z.object({
  kind: z.enum(['review', 'overage', 'rerun']).default('review'),
  promoCode: z.string().max(32).optional(), // review purchases only (promo_codes.md)
  draftToken: z.string().max(64).optional(),
  caseId: z.string().max(64).optional(), // overage/rerun target
});

export default async function checkoutRoutes(fastify: FastifyInstance) {
  const accountLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  fastify.post('/buy/account', accountLimit, async (request, reply) => {
    const { email, password, name } = AccountSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Enumeration-safe: same shape as success; the sign-in path is where
      // an existing owner proceeds.
      return { ok: true };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: name ? `${name} (family)` : email },
      });
      await tx.user.create({
        data: { email, name: name ?? '', passwordHash, role: 'CLIENT', tenantId: tenant.id },
      });
    });

    return { ok: true };
  });

  /**
   * W-2: the disclosure review screen posts the explicit acknowledgment
   * BEFORE payment. The full set version + timestamp + IP/UA is archived
   * per §11a.2 (24 mo, survives case deletion) — the E-6 dispute packet.
   */
  fastify.post('/buy/disclosure-ack', async (request, reply) => {
    const { userId, tenantId, role } = request.auth;
    if (role !== 'CLIENT') {
      return reply.status(403).send({ error: 'Consumer purchases only' });
    }
    const { disclosureSetVersion } = z
      .object({ disclosureSetVersion: z.literal(DISCLOSURE_SET_VERSION) })
      .parse(request.body);

    await withTenant(tenantId, (tx) =>
      tx.disclosureAck.create({
        data: {
          userId,
          tenantId,
          disclosureSetVersion,
          ip: request.ip,
          userAgent:
            typeof request.headers['user-agent'] === 'string'
              ? request.headers['user-agent'].slice(0, 256)
              : null,
        },
      })
    );

    return { ok: true, disclosureSetVersion };
  });

  // Promo validation for the buy page: applied-state preview before any
  // payment step. Generic failure only (promo_codes.md §1.2, §4.5).
  fastify.post('/checkout/promo/validate', async (request, reply) => {
    const { userId, role } = request.auth;
    if (role !== 'CLIENT') return reply.status(403).send({ error: 'Consumer purchases only' });
    const { code } = z.object({ code: z.string().max(32) }).parse(request.body);
    const { checkPromo, normalizeCode } = await import('../services/promo.service');
    const check = await checkPromo(code, userId);
    if (!check.valid) {
      request.log.info({ code, reason: check.reason }, 'promo validate rejected');
      return reply.status(400).send({ error: "That code isn't valid" });
    }
    const newTotal = Math.max(PRICES_CENTS.review - (check.amountOffCents ?? 0), 0);
    return { code: normalizeCode(code), amountOffCents: check.amountOffCents, newTotalCents: newTotal };
  });

  fastify.post('/checkout/session', async (request, reply) => {
    const { userId, tenantId, role } = request.auth;
    if (role !== 'CLIENT') {
      return reply.status(403).send({ error: 'Consumer purchases only' });
    }

    const { kind, draftToken, caseId, promoCode } = SessionSchema.parse(request.body);

    // No pay button without the acknowledged disclosure set (W-2). Checked
    // before Stripe config so the contract holds in every environment.
    if (kind === 'review') {
      const ack = await withTenant(tenantId, (tx) =>
        tx.disclosureAck.findFirst({
          where: { userId, disclosureSetVersion: DISCLOSURE_SET_VERSION },
        })
      );
      if (!ack) {
        return reply
          .status(409)
          .send({ error: 'Disclosures must be acknowledged before purchase' });
      }
    }

    // Promo (review only): validate; a full-price code takes the FREE path
    // through the same fulfillment machinery — no Stripe at all.
    let amountCents = PRICES_CENTS[kind as PurchaseKind];
    let appliedPromo: string | undefined;
    if (promoCode && kind === 'review') {
      const { checkPromo, redeemPromo, normalizeCode } = await import('../services/promo.service');
      const check = await checkPromo(promoCode, userId);
      if (!check.valid) {
        request.log.info({ code: promoCode, reason: check.reason }, 'promo rejected');
        return reply.status(400).send({ error: "That code isn't valid" });
      }
      appliedPromo = normalizeCode(promoCode);
      amountCents = Math.max(PRICES_CENTS.review - (check.amountOffCents ?? 0), 0);

      if (amountCents === 0) {
        // Atomic redemption BEFORE fulfillment: two racers for the last
        // slot cannot both create a free case.
        if (!(await redeemPromo(appliedPromo))) {
          return reply.status(400).send({ error: "That code isn't valid" });
        }
        const { fulfillCheckoutSession } = await import('../services/payments.service');
        const synthetic = {
          id: `promo_${appliedPromo}_${crypto.randomUUID()}`,
          amount_total: 0,
          metadata: {
            userId, tenantId, kind: 'review' as const,
            ...(draftToken ? { draftToken } : {}),
            promoCode: appliedPromo,
          },
        };
        const result = await fulfillCheckoutSession(synthetic);
        if (!result.caseId) return reply.status(500).send({ error: 'Could not start your review' });
        const { capture } = await import('../services/analytics.service');
        capture('snl.promo_applied', tenantId, { code: appliedPromo, free: true });
        const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
        return { free: true, caseId: result.caseId, url: `${origin}/case/${result.caseId}/interview` };
      }
    }

    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ error: 'Payments are not configured' });
    }
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              // Managed Payments/Stripe Tax require a product tax code.
              // 'General - Services' pending the accountant's TX
              // data-processing determination (M7 gate item).
              tax_code: process.env.STRIPE_TAX_CODE ?? 'txcd_20030000',
              name:
                kind === 'review'
                  ? 'Family Case Review — up to 5,000 pages, all screens, human review'
                  : kind === 'overage'
                    ? 'Additional pages (+2,500)'
                    : 'Re-run with new documents',
            },
          },
        },
      ],
      success_url: `${origin}/buy/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/buy?canceled=1`,
      // Managed Payments (Stripe as merchant of record) is default-on for new
      // accounts but its eligible-category list excludes this product; we are
      // the merchant of record by design — our disclosures, our dispute
      // evidence (E-6), our Stripe Tax configuration.
      ...({ managed_payments: { enabled: false } } as object),
      // Stripe Tax (PO decision: collect correctly from the first charge;
      // remittance/registration follow the accountant's determination) and
      // dashboard-managed payment methods (incl. Affirm/Klarna installments,
      // W-6: Stripe-native only, never a custom ledger).
      ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true } } : {}),
      metadata: {
        userId,
        tenantId,
        kind,
        ...(draftToken ? { draftToken } : {}),
        ...(caseId ? { caseId } : {}),
        ...(appliedPromo ? { promoCode: appliedPromo } : {}),
      },
    });

    return { url: session.url };
  });
}
