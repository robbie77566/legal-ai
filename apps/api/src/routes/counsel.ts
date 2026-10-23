import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { Membership, Organisation } from '@prisma/client';
import prisma, { withTenant } from '@hg/database';
import { AuditService, LogAction } from '../services/audit.service';
import { requireAccountKind, checkLawyerSeat } from '../plugins/guards';
import counselOrgRoutes, { invitationAcceptRoutes } from './counsel-org';
import { clinicInboxRoutes } from './packets';
import { counselInvestigationRoutes } from './investigations';
import counselPublicRoutes from './counsel-public';

/**
 * Professional accounts (persona_rollout_plan.md §5 A — the identity EXPAND
 * step). Two routes:
 *
 *  1. POST /counsel/signup (anon) — the professional self-registration
 *     surface, the twin of POST /buy/account: one transaction creates the
 *     Tenant, its Organisation, the User (accountKind PROFESSIONAL) and the
 *     OWNER membership. The bar number is stored UNVERIFIED; staff verify it
 *     from the queue (workstream G). Matter intake, pricing and the landing
 *     page are workstreams B, C and F.
 *  2. GET /counsel/me (PROFESSIONAL only) — the signed-in professional, their
 *     organisation and their seat. Refused the moment the seat is gone.
 *     Carries `barVerificationStatus` (PENDING | VERIFIED | REJECTED) and
 *     `lawyerSeat` — whether this request passes the lawyer gate
 *     (guards.ts requireLawyerSeat; UPL review 2026-10-23, P1 + P2) — so the
 *     pages show the pending banner and hide lawyer-only cards.
 *  3. PATCH /counsel/me { barNumber, barState? } — a colleague who took an
 *     attorney or owner seat by invitation has no bar number yet; this puts
 *     one on the account (PENDING) so it reaches the verification queue.
 *     Refused once a number is verified (staff reverse that, not the user).
 *
 * Practice types `investigator` and `other` may sign up, but the account is
 * PENDING and staff cannot verify it as a lawyer (ops-professional.ts); the
 * invite flow is the intended path for investigators.
 *
 * Why PROFESSIONAL accounts keep `role: CLIENT`: every existing staff gate
 * (/ops, /qa, /admin, /dashboard, /workspace) refuses CLIENT, and the Role
 * column stays authoritative for those gates until the contract step. The
 * auth plugin additionally refuses a PROFESSIONAL on the staff prefixes
 * whatever its role says.
 */

export const PRACTICE_TYPES = ['writ', 'appellate', 'trial', 'pd', 'clinic', 'investigator', 'other'] as const;

const SignupSchema = z.object({
  email: z.string().email().max(254),
  // Same rules as /buy/account and the auth spec: ≥12 chars, uppercase, number-or-symbol.
  password: z
    .string()
    .min(12, 'Must be at least 12 characters')
    .max(200)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>/?]/, 'Must contain a number or symbol'),
  name: z.string().trim().min(1, 'Name is required').max(100),
  barNumber: z.string().trim().min(1, 'Bar number is required').max(32),
  barState: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Bar state is a two-letter code')
    .default('TX')
    .transform((s) => s.toUpperCase()),
  practiceType: z.enum(PRACTICE_TYPES),
  organisationName: z.string().trim().min(1).max(120).optional(),
  // FAMILY organisations are never self-registered here.
  organisationKind: z.enum(['FIRM', 'PD_OFFICE', 'CLINIC']).default('FIRM'),
});

export type CounselSignupBody = z.input<typeof SignupSchema>;

declare module 'fastify' {
  interface FastifyRequest {
    /** The professional's seat, loaded per request on /counsel/* (null until the hook runs). */
    counsel: (Membership & { organisation: Organisation }) | null;
  }
}

export default async function counselRoutes(fastify: FastifyInstance) {
  fastify.decorateRequest('counsel', null);

  // Seat acceptance (workstream I): anonymous, token-verified, like /auth/setup.
  fastify.register(invitationAcceptRoutes);
  // Workstream F: GET /counsel/signup (are sign-ups open?) and the public PD-pilot form.
  fastify.register(counselPublicRoutes);

  fastify.post('/signup', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const parsed = SignupSchema.parse(request.body);
    const { password, name, barNumber, barState, practiceType, organisationKind } = parsed;
    const email = parsed.email.trim().toLowerCase();
    const organisationName = parsed.organisationName ?? name;

    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      // Enumeration-safe, the same answer /buy/account gives: the sign-in
      // path is where an existing owner proceeds.
      return { ok: true };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { user, organisation } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: organisationName } });
      const organisation = await tx.organisation.create({
        data: { tenantId: tenant.id, kind: organisationKind, name: organisationName },
      });
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'CLIENT',
          accountKind: 'PROFESSIONAL',
          tenantId: tenant.id,
          barNumber,
          barState,
          practiceType,
        },
      });
      await tx.membership.create({
        data: { organisationId: organisation.id, tenantId: tenant.id, userId: user.id, role: 'OWNER' },
      });
      return { user, organisation };
    });

    // Audited like every account event; the bar number itself never enters the log.
    await AuditService.log({
      tenantId: user.tenantId,
      caseId: `account:${user.id}`,
      action: LogAction.ACCOUNT_SIGNUP,
      userId: user.id,
      details: { op: 'counsel_signup', organisationId: organisation.id, organisationKind, practiceType, barState },
    });

    return { ok: true, userId: user.id, organisationId: organisation.id, barVerificationStatus: user.barVerificationStatus };
  });

  // Everything else under /counsel is for PROFESSIONAL accounts with a live
  // seat. Both checks read the database per request (auth plugin + the hook
  // below), so a removed membership is a 403 on the very next call.
  fastify.register(async (counsel) => {
    counsel.addHook('preHandler', requireAccountKind('PROFESSIONAL'));
    counsel.addHook('preHandler', async (request, reply) => {
      const { userId, tenantId } = request.auth;
      const seat = await withTenant(tenantId, (tx) =>
        tx.membership.findFirst({ where: { userId }, include: { organisation: true } })
      );
      if (!seat) return reply.status(403).send({ error: 'No active seat in an organisation' });
      request.counsel = seat;
    });

    counsel.get('/me', async (request, reply) => {
      const seat = request.counsel!;
      const user = await prisma.user.findUnique({
        where: { id: request.auth.userId },
        select: {
          id: true, email: true, name: true, deletedAt: true,
          barNumber: true, barState: true, barVerifiedAt: true, barVerificationStatus: true, practiceType: true,
        },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'Not found' });
      const o = seat.organisation;
      const lawyer = await checkLawyerSeat(request);
      return {
        user: {
          id: user.id, email: user.email, name: user.name,
          barNumber: user.barNumber, barState: user.barState, practiceType: user.practiceType,
          barVerified: user.barVerifiedAt !== null, barVerifiedAt: user.barVerifiedAt,
          barVerificationStatus: user.barVerificationStatus,
        },
        organisation: {
          id: o.id, kind: o.kind, name: o.name, pilot: o.pilot, pilotEndsAt: o.pilotEndsAt,
          allowanceRecords: o.allowanceRecords, allowanceResetsAt: o.allowanceResetsAt,
          // U4 (P3): a clinic's inbox opens only once staff have verified it.
          clinicVerified: o.clinicVerifiedAt !== null,
        },
        membership: { role: seat.role },
        /** The lawyer gate's answer for this seat right now; `lawyerSeatReason` names the refusal. */
        lawyerSeat: lawyer.ok,
        ...(lawyer.ok ? {} : { lawyerSeatReason: lawyer.reason }),
      };
    });

    // A bar number for an invited attorney or owner (UPL review P1). Stored
    // PENDING; staff decide from the queue. A verified number is not changed
    // here — staff reverse a verification, never the account itself.
    counsel.patch('/me', async (request, reply) => {
      const body = z
        .object({
          barNumber: z.string().trim().min(1, 'Bar number is required').max(32),
          barState: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Bar state is a two-letter code').default('TX').transform((v) => v.toUpperCase()),
        })
        .parse(request.body ?? {});
      const user = await prisma.user.findUnique({
        where: { id: request.auth.userId },
        select: { id: true, tenantId: true, barVerifiedAt: true, barVerificationStatus: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'Not found' });
      if (user.barVerifiedAt || user.barVerificationStatus === 'VERIFIED') {
        return reply.status(409).send({ error: 'Your bar number is verified; reply to any email from us to change it', reason: 'BAR_VERIFIED' });
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { barNumber: body.barNumber, barState: body.barState, barVerificationStatus: 'PENDING', barRejectedAt: null, barRejectionNote: null },
        select: { barNumber: true, barState: true, barVerificationStatus: true },
      });
      // Audited like the sign-up; the number itself never enters the log.
      await AuditService.log({
        tenantId: user.tenantId,
        caseId: `account:${user.id}`,
        action: LogAction.ACCOUNT_SIGNUP,
        userId: user.id,
        details: { op: 'bar_number_added', barState: body.barState, before: user.barVerificationStatus, after: 'PENDING' },
      });
      return { ok: true, user: updated };
    });

    // Workstream I (persona_rollout_plan.md §5 I): the organisation and its
    // seats, the clinic's packet inbox, the Record Desk request form. Each
    // sits behind its own flag inside the route file.
    counsel.register(counselOrgRoutes, { prefix: '/org' });
    counsel.register(clinicInboxRoutes, { prefix: '/inbox' });
    counsel.register(counselInvestigationRoutes, { prefix: '/investigations' });
  });
}
