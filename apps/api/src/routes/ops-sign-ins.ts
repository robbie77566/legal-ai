import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accountSummary, listSignIns, pruneSignInAttempts, SIGN_IN_FILTERS, SIGN_IN_PAGE_MAX } from '../services/sign-ins.service';

/**
 * Sign-in log and the account summary (staff_console.md §12 "Sign-in log and
 * alerts", 2026-10-31). Registered from ops.ts INSIDE its role hook: ADMIN
 * and SUPPORT read both pages; the prune is a POST, which the hook keeps to
 * ADMIN. The account page is where the admin's SMS link lands.
 */

const listQuery = z.object({
  outcome: z.enum(SIGN_IN_FILTERS).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(200).optional(),
  first: z.enum(['1', '0', 'true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(SIGN_IN_PAGE_MAX).optional(),
});

export async function opsSignInRoutes(fastify: FastifyInstance) {
  // Any account — family, professional or staff. SUPPORT sees the backup
  // email masked; ADMIN sees the address.
  fastify.get('/accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const summary = await accountSummary(id, request.auth.role);
    if (!summary) return reply.status(404).send({ error: 'Not found' });
    return summary;
  });

  fastify.get('/sign-ins', async (request) => {
    const q = listQuery.parse(request.query ?? {});
    return listSignIns({
      outcome: q.outcome,
      since: q.since ? new Date(q.since) : undefined,
      q: q.q || undefined,
      first: q.first === '1' || q.first === 'true',
      page: q.page,
      pageSize: q.pageSize,
    });
  });

  // Retention on demand (the api also sweeps hourly). ADMIN only — the ops
  // hook refuses every SUPPORT POST outside the case-unblocking actions.
  fastify.post('/sign-ins/prune', async (request) => {
    const out = await pruneSignInAttempts();
    request.log.info({ ...out, by: request.auth.userId }, 'sign-in attempts pruned');
    return { ok: true, ...out };
  });
}
