import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AccountKind, Role, StaffGrantKind } from '@prisma/client'
import { decodeSessionToken, type SessionIdentity } from '@hg/auth'
import prisma from '@hg/database'
// Subpath import on purpose: tests that mock '@hg/database' wholesale (cases.test.ts)
// still get the real, dependency-free helpers.
import { effectiveAccountKind, effectiveStaffGrants } from '@hg/database/staff'
import { evalGateIdentity } from './eval-gate-token'

/**
 * What every route sees. userId/tenantId/role come from the session token
 * (format unchanged); accountKind and grants are read from the DATABASE on
 * each request (identity expand step, persona_rollout_plan.md §5 A), so a
 * demotion takes effect on the next request even though the token is the
 * same.
 */
export interface RequestAuth extends SessionIdentity {
  accountKind: AccountKind
  grants: StaffGrantKind[]
  /**
   * Set only for a machine caller (the eval gate's bearer token, workstream
   * J); absent on every session-backed request. Routes that accept the
   * machine use it; audit rows carry its userId.
   */
  machine?: 'eval-gate'
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth
  }
}

/**
 * Global authentication (system design §10.1): every route requires a verified
 * NextAuth session token; request identity comes ONLY from the token. The
 * legacy x-tenant-id / x-user-id headers are dead — any value sent in them is
 * ignored.
 *
 * Public paths are an explicit allowlist, not a pattern.
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/health',
  '/healthz',
  '/buy/account',
  '/counsel/signup', // professional self-registration (rate-limited in-route like /buy/account)
  '/counsel/pilot-interest', // the PD-pilot form on the public office/counsel pages (rate-limited in-route)
  // The buy page offers the promo field before the account exists; this route
  // only previews a code's own validity (never redeems, never reveals more
  // than "valid / not valid") and is rate-limited in-route. Redemption and the
  // once-per-account rule remain authenticated, at /checkout/session.
  '/checkout/promo/validate',
])

// Prefix-public: anonymous S0 drafts (token-addressed) and Stripe webhooks
// (signature-verified in-route).
const PUBLIC_PREFIXES = [
  '/eligibility/draft',
  '/eligibility/lead', // pending-appeal email capture (rate-limited in-route)
  '/webhooks/stripe',
  '/shared/',
  '/auth/forgot', // enumeration-safe + rate-limited in-route
  '/auth/reset', // token-verified in-route
  '/auth/setup', // invite acceptance — token-verified in-route
  '/me/email/confirm', // email change — token-verified in-route
  '/counsel/org/invitations/', // seat acceptance (…/:token/accept) — token-verified in-route; the OWNER's POST /counsel/org/invitations stays authenticated
]

// Staff-only prefixes a PROFESSIONAL account is refused outright, whatever its
// legacy `role` column says (Role.ATTORNEY is a staff reviewer, not a
// customer). The per-route hooks under them keep their own role gating.
const STAFF_PREFIXES = ['/ops', '/qa', '/admin', '/permissions']

const SESSION_COOKIES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

// Parsed here rather than via @fastify/cookie so this hook has no ordering
// dependency on another plugin's onRequest hook.
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return cookies
}

function extractToken(request: FastifyRequest): string | undefined {
  const cookies = parseCookieHeader(request.headers.cookie)
  for (const name of SESSION_COOKIES) {
    if (cookies[name]) return cookies[name]
  }
  const header = request.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return undefined
}

/**
 * accountKind and the effective staff grants, from the database. A token
 * whose user row is gone (or a test identity that was never stored) falls
 * back to what its role implies — exactly what the gates see today.
 */
export async function loadAccount(identity: SessionIdentity): Promise<Pick<RequestAuth, 'accountKind' | 'grants'>> {
  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: { role: true, accountKind: true, grants: { select: { kind: true, revokedAt: true } } },
  })
  const role = (user?.role ?? identity.role) as Role
  const accountKind = effectiveAccountKind({ role, accountKind: user?.accountKind ?? null })
  const grants = effectiveStaffGrants({ role, accountKind, grants: user?.grants ?? null })
  return { accountKind, grants }
}

export function registerAuth(fastify: FastifyInstance) {
  fastify.decorateRequest('auth')

  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.url.split('?')[0]
      const isPublic = PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))

      const token = extractToken(request)
      const identity = token ? await decodeSessionToken(token) : null

      if (!identity) {
        // The eval gate's machine token (workstream J): minted ONLY for
        // /ops/eval/runs[/:id] with the configured bearer; the same bearer
        // anywhere else is just a bad session token and falls through to 401.
        const machine = evalGateIdentity(request)
        if (machine) {
          request.auth = machine
          return
        }
        // A public route serves the anonymous visitor; everything else refuses.
        // A public route with NO identity attached must leave request.auth
        // undefined, so the route can tell the two apart.
        if (isPublic) return
        return reply.status(401).send({ error: 'Unauthorized' })
      }
      // Public routes still get the identity when the caller has one: the
      // promo preview applies the once-per-account rule to a signed-in
      // customer, and skipping decode here silently made everyone anonymous
      // (CI, 2026-09-15: "already used" came back 200 instead of 400).

      // Ops surfaces are ADMIN-only (Bull Board at /admin/queues).
      if (path.startsWith('/admin') && identity.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      const account = await loadAccount(identity)
      if (account.accountKind === 'PROFESSIONAL' && STAFF_PREFIXES.some((p) => path.startsWith(p))) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      request.auth = { ...identity, ...account }
    }
  )
}
