import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AccountKind, StaffGrantKind } from '@prisma/client'
import { hasGrant } from '@hg/database/staff'

/**
 * Reusable route guards over the identity the auth plugin attaches to every
 * request (persona_rollout_plan.md §5 A). Both read request.auth, which the
 * plugin fills from the DATABASE on each request — so a revoked grant or a
 * removed membership is refused on the very next call, not the next sign-in.
 *
 * The existing /ops and /qa hooks keep gating on the legacy `role` until the
 * swap step adopts requireGrant; nothing here changes them.
 */
const label = (k: AccountKind) => (k === 'PROFESSIONAL' ? 'counsel' : k.toLowerCase())

export function requireAccountKind(...kinds: AccountKind[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) return reply.status(401).send({ error: 'Unauthorized' })
    if (!kinds.includes(request.auth.accountKind)) {
      return reply.status(403).send({ error: `This is for ${kinds.map(label).join(' or ')} accounts` })
    }
  }
}

export function requireGrant(kind: StaffGrantKind) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) return reply.status(401).send({ error: 'Unauthorized' })
    if (request.auth.accountKind !== 'STAFF' || !hasGrant(request.auth.grants, kind)) {
      return reply.status(403).send({ error: `Needs the ${kind.toLowerCase()} grant` })
    }
  }
}
