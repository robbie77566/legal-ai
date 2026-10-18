import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Membership, Organisation } from '@prisma/client';
import { withTenant } from '@hg/database';
import { requireAccountKind } from '../plugins/guards';
import { requireFlag } from '../plugins/flags';
import {
  acceptQuote, buyPack, listCredits, quoteCase, requestQuote, allowanceView, QUOTE_METHODS, type QuoteError,
} from '../services/quote.service';

/**
 * Counsel checkout (persona_rollout_plan.md §4, §5 B) — the professional
 * twin of /checkout/session, in its own file so the family route stays
 * byte-for-byte what it was. Mounted under /counsel beside counsel.ts.
 *
 * Every route here is for a PROFESSIONAL account with a live seat
 * (requireAccountKind + a per-request membership load, like /counsel/me) AND
 * sits behind the `counsel_checkout` flag: a family answers 403, a
 * professional whose organisation is still dark answers 404.
 *
 *   GET  /counsel/matters/:caseId/quote           the decision, recomputed on every read
 *   POST /counsel/matters/:caseId/quote/accept    { method: CARD|CREDIT|ALLOWANCE|FREE }
 *   POST /counsel/matters/:caseId/quote/request   Long records: ask an admin
 *   POST /counsel/packs                           { rung } → Stripe Checkout
 *   GET  /counsel/credits                         the tenant's pack credits
 *   GET  /counsel/allowance                       the organisation's ledger
 *
 * `bucket` (query or body) names the record bucket until the page meter
 * (workstream D) stores Case.recordBucket; a stored bucket always wins.
 */

const Bucket = z.enum(['SHORT', 'STANDARD', 'EXTENDED', 'LONG']).optional();

declare module 'fastify' {
  interface FastifyRequest {
    counsel: (Membership & { organisation: Organisation }) | null;
  }
}

const quoteErrorStatus = (e: QuoteError) => (e.error === 'NOT_FOUND' ? 404 : 409);

export default async function counselCheckoutRoutes(fastify: FastifyInstance) {
  fastify.decorateRequest('counsel', null);
  fastify.addHook('preHandler', requireAccountKind('PROFESSIONAL'));
  fastify.addHook('preHandler', requireFlag('counsel_checkout'));
  fastify.addHook('preHandler', async (request, reply) => {
    const { userId, tenantId } = request.auth;
    const seat = await withTenant(tenantId, (tx) => tx.membership.findFirst({ where: { userId }, include: { organisation: true } }));
    if (!seat) return reply.status(403).send({ error: 'No active seat in an organisation' });
    request.counsel = seat;
  });

  fastify.get('/matters/:caseId/quote', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const q = z.object({ bucket: Bucket, promoCode: z.string().max(32).optional() }).parse(request.query ?? {});
    const out = await quoteCase(caseId, request.auth, q);
    if ('error' in out) return reply.status(quoteErrorStatus(out)).send(out);
    return out;
  });

  fastify.post('/matters/:caseId/quote/accept', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const body = z
      .object({ method: z.enum(QUOTE_METHODS as [string, ...string[]]), bucket: Bucket, promoCode: z.string().max(32).optional() })
      .parse(request.body ?? {});
    const out = await acceptQuote(caseId, request.auth, { ...body, method: body.method as (typeof QUOTE_METHODS)[number] });
    if (!out.ok) {
      const { status, ...rest } = out;
      return reply.status(status).send(rest);
    }
    return out;
  });

  fastify.post('/matters/:caseId/quote/request', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const body = z.object({ note: z.string().trim().max(2000).optional(), bucket: Bucket }).parse(request.body ?? {});
    const out = await requestQuote(caseId, request.auth, body);
    if (!out.ok) {
      const { status, ...rest } = out;
      return reply.status(status).send(rest);
    }
    return out;
  });

  fastify.post('/packs', async (request, reply) => {
    const { rung } = z.object({ rung: z.enum(['SHORT', 'STANDARD', 'EXTENDED']) }).parse(request.body ?? {});
    const out = await buyPack(rung, request.auth);
    if (!out.ok) {
      const { status, ...rest } = out;
      return reply.status(status).send(rest);
    }
    return out;
  });

  fastify.get('/credits', async (request) => listCredits(request.auth));

  fastify.get('/allowance', async (request) => {
    const org = request.counsel!.organisation;
    const view = await withTenant(request.auth.tenantId, (tx) => allowanceView(tx, org));
    return { organisationId: org.id, kind: org.kind, allowance: view };
  });
}
