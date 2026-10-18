import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createInvoice, decideQuoteRequest, listInvoices, listQuoteRequests, markInvoicePaid,
} from '../services/invoices.service';

/**
 * Ops: quotes, credits, allowances, invoices (staff_console.md §11,
 * workstream B). Registered from ops.ts INSIDE its role hook, so SUPPORT gets
 * the quote-request reads and the usual 403 sentence on every write, and
 * /ops/invoices is money (denied to SUPPORT outright, like /ops/payments).
 * Every write is one audit row (invoices.service).
 */
export default async function opsCommerceRoutes(fastify: FastifyInstance) {
  fastify.get('/quote-requests', async (request) => {
    const { status } = z.object({ status: z.enum(['OPEN', 'QUOTED', 'DECLINED']).optional() }).parse(request.query ?? {});
    return listQuoteRequests({ status });
  });

  fastify.post('/quote-requests/:id/decide', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        quotedCents: z.number().int().positive().max(100_000_000).optional(),
        decline: z.boolean().optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(request.body ?? {});
    const out = await decideQuoteRequest({ id, ...body, actorId: request.auth.userId });
    if (!out.ok) return reply.status(out.status).send({ error: out.error });
    return out.quoteRequest;
  });

  fastify.get('/invoices', async (request) => {
    const q = z.object({ organisationId: z.string().max(64).optional(), status: z.enum(['DRAFT', 'SENT', 'PAID', 'VOID']).optional() }).parse(request.query ?? {});
    return listInvoices(q);
  });

  fastify.post('/invoices', async (request, reply) => {
    const body = z
      .object({
        organisationId: z.string().min(1).max(64),
        caseIds: z.array(z.string().min(1).max(64)).min(1).max(200),
        centsByCase: z.record(z.string(), z.number().int().nonnegative()).optional(),
      })
      .parse(request.body ?? {});
    const out = await createInvoice({ ...body, actorId: request.auth.userId });
    if (!out.ok) return reply.status(out.status).send({ error: out.error, ...(out.caseId ? { caseId: out.caseId } : {}) });
    return out.invoice;
  });

  fastify.post('/invoices/:id/mark-paid', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { achReference } = z.object({ achReference: z.string().trim().min(1).max(120) }).parse(request.body ?? {});
    const out = await markInvoicePaid({ invoiceId: id, achReference, actorId: request.auth.userId });
    if (!out.ok) return reply.status(out.status).send({ error: out.error });
    return out.invoice;
  });
}
