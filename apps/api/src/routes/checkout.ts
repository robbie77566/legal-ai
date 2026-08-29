import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@hg/database';
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

  fastify.post('/checkout/session', async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(503).send({ error: 'Payments are not configured' });
    }

    const { userId, tenantId, role } = request.auth;
    if (role !== 'CLIENT') {
      return reply.status(403).send({ error: 'Consumer purchases only' });
    }

    const { kind, draftToken, caseId } = SessionSchema.parse(request.body);
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
