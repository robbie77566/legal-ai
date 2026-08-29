import { FastifyInstance } from 'fastify';
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

  fastify.post('/checkout/session', async (request, reply) => {
    const { userId, tenantId, role } = request.auth;
    if (role !== 'CLIENT') {
      return reply.status(403).send({ error: 'Consumer purchases only' });
    }

    const { kind, draftToken, caseId } = SessionSchema.parse(request.body);

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

    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ error: 'Payments are not configured' });
    }
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: PRICES_CENTS[kind as PurchaseKind],
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
      },
    });

    return { url: session.url };
  });
}
