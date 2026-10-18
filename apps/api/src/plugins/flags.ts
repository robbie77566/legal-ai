import type { FastifyReply, FastifyRequest } from 'fastify'
import { isFlagOn, type FlagKey } from '@hg/database/flags'

/**
 * Route guard for a dark surface (persona_rollout_plan.md §7 "Flags, not
 * branches"): `preHandler: requireFlag('counsel_surfaces')`. When the flag is
 * off for the caller's tenant the route answers 404, not 403, so a surface
 * that has not launched does not confirm it exists. Reads come from the
 * 15-second in-process cache (packages/database/flags.ts), so a flip is live
 * on every instance within 15 seconds and no deploy is involved.
 */
export function requireFlag(key: FlagKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenantId
    if (!(await isFlagOn(key, tenantId))) {
      return reply.status(404).send({ error: 'Not available' })
    }
  }
}
