import crypto from 'crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RequestAuth } from './auth'

/**
 * The eval gate's machine path (persona_rollout_plan.md §5 J "weekly eval
 * gate in CI"). The GitHub workflow has no session cookie; it carries
 * `Authorization: Bearer <EVAL_GATE_TOKEN>` instead. The token is a secret
 * env var on the api (`sync: false` in both blueprints) that the founder
 * pastes in Render and in GitHub (Settings → Secrets); unset = the machine
 * path does not exist and every bearer is a session token as before.
 *
 * Scope is the two eval-run routes and nothing else: the identity below is
 * minted only when the request path is one of them, so the same token on
 * any other route is an ordinary bad session token (401).
 */

export const EVAL_GATE_USER_ID = 'eval-gate'

/** `/ops/eval/runs` and `/ops/eval/runs/:id` — the only paths the token opens. */
export const EVAL_GATE_PATH = /^\/ops\/eval\/runs(?:\/[A-Za-z0-9_-]{1,64})?$/

export function isEvalGatePath(path: string): boolean {
  return EVAL_GATE_PATH.test(path)
}

function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * The machine identity when the request is an eval-gate path AND carries
 * the configured token; null otherwise. Role ADMIN so the /ops hook gates
 * it like the console; `machine` marks it for audit rows and the route's
 * own preHandler.
 */
export function evalGateIdentity(request: FastifyRequest): RequestAuth | null {
  const expected = process.env.EVAL_GATE_TOKEN
  if (!expected || expected.length < 16) return null
  const path = request.url.split('?')[0]
  if (!isEvalGatePath(path)) return null
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const presented = header.slice('Bearer '.length).trim()
  if (!presented || !tokensMatch(presented, expected)) return null
  return {
    userId: EVAL_GATE_USER_ID,
    tenantId: '',
    role: 'ADMIN',
    accountKind: 'STAFF',
    grants: ['ADMIN'],
    machine: EVAL_GATE_USER_ID,
  }
}

/**
 * The eval-run routes' own preHandler: an Ops administrator's session or the
 * machine token — nothing else, whatever the enclosing hooks allowed.
 */
export async function requireEvalGateAccess(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.auth
  if (!auth) return reply.status(401).send({ error: 'Unauthorized' })
  if (auth.machine === EVAL_GATE_USER_ID) return
  if (auth.role === 'ADMIN') return
  return reply.status(403).send({ error: 'Ops administrators only' })
}
