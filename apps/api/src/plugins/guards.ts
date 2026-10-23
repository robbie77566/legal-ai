import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AccountKind, MembershipRole, StaffGrantKind } from '@prisma/client'
import prisma, { withTenant } from '@hg/database'
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

// ── The lawyer gate (UPL review 2026-10-23, P1 + P2; staff_console.md §11) ──

/** The seats that may receive lawyer-only output: the owner and an attorney seat. */
export const LAWYER_SEAT_ROLES: ReadonlySet<MembershipRole> = new Set<MembershipRole>(['OWNER', 'ATTORNEY'])

export type LawyerSeatRefusal =
  | { reason: 'NOT_PROFESSIONAL'; error: string }
  | { reason: 'NO_SEAT'; error: string }
  | { reason: 'LAWYER_SEAT_REQUIRED'; error: string }
  | { reason: 'BAR_PENDING'; error: string }
  | { reason: 'BAR_REJECTED'; error: string }

export type LawyerSeatCheck = { ok: true } | ({ ok: false } & LawyerSeatRefusal)

export const BAR_PENDING_MESSAGE = 'Your bar number is awaiting verification'
export const BAR_REJECTED_MESSAGE = 'Your bar number could not be verified, so counsel review is not open on this account'
export const LAWYER_SEAT_MESSAGE = 'This is for the organisation\'s attorneys — the owner or an attorney seat with a verified bar number'

/**
 * Is this request a LAWYER's? Three facts, every one read live:
 *   1. the account is PROFESSIONAL (request.auth, from the database per request);
 *   2. the live membership role is OWNER or ATTORNEY (request.counsel when
 *      the seat hook already loaded it, else loaded here);
 *   3. the user's bar number has been verified by staff — `barVerifiedAt`
 *      set and `barVerificationStatus` not REJECTED. A rejection closes
 *      counsel review on the next request; a later verify reopens it.
 *
 * The role is tested before the bar so an investigator or viewer seat (who
 * usually has no bar number at all) is told the seat is the reason, never
 * that a verification is pending.
 */
export async function checkLawyerSeat(request: FastifyRequest): Promise<LawyerSeatCheck> {
  if (!request.auth || request.auth.accountKind !== 'PROFESSIONAL') {
    return { ok: false, reason: 'NOT_PROFESSIONAL', error: 'This is for counsel accounts' }
  }
  const { userId, tenantId } = request.auth
  const seat =
    request.counsel ??
    (await withTenant(tenantId, (tx) => tx.membership.findFirst({ where: { userId }, include: { organisation: true } })))
  if (!seat) return { ok: false, reason: 'NO_SEAT', error: 'No active seat in an organisation' }
  if (!LAWYER_SEAT_ROLES.has(seat.role)) return { ok: false, reason: 'LAWYER_SEAT_REQUIRED', error: LAWYER_SEAT_MESSAGE }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { barVerifiedAt: true, barVerificationStatus: true, deletedAt: true },
  })
  if (!user || user.deletedAt) return { ok: false, reason: 'NO_SEAT', error: 'No active seat in an organisation' }
  if (user.barVerificationStatus === 'REJECTED') return { ok: false, reason: 'BAR_REJECTED', error: BAR_REJECTED_MESSAGE }
  if (!user.barVerifiedAt) return { ok: false, reason: 'BAR_PENDING', error: BAR_PENDING_MESSAGE }
  return { ok: true }
}

/**
 * preHandler: passes only for a verified lawyer seat (checkLawyerSeat). Every
 * refusal is a 403 with `reason`, so the pages can say the right sentence:
 * BAR_PENDING ("awaiting verification"), BAR_REJECTED, LAWYER_SEAT_REQUIRED.
 * Register it AFTER the flag hook (404 first — a dark surface never confirms
 * it exists) and after the seat hook when there is one.
 */
export function requireLawyerSeat() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) return reply.status(401).send({ error: 'Unauthorized' })
    const check = await checkLawyerSeat(request)
    if (!check.ok) return reply.status(403).send({ error: check.error, reason: check.reason })
  }
}
