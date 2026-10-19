import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { MembershipRole } from '@prisma/client';
import prisma, { withTenant } from '@hg/database';
import { isFlagOn } from '@hg/database/flags';
import { generateToken } from '@hg/auth';
import { AuditService, LogAction } from '../services/audit.service';
import { requireFlag } from '../plugins/flags';
import { organisationView } from '../services/organisation.service';

/**
 * The organisation and its seats (persona_rollout_plan.md §4 "unlimited
 * users", §5 I). Mounted at /counsel/org INSIDE the counsel plugin, so every
 * route already has a PROFESSIONAL caller with a live seat on
 * request.counsel. Firm basics sit behind `counsel_surfaces`; a PD office or
 * clinic additionally needs `offices` (the office/clinic pilot surface).
 *
 * Seats are free and unlimited in January: OWNER invites by email, the
 * colleague accepts from the link and becomes a PROFESSIONAL user with that
 * membership role. The raw token travels in the email alone; the row keeps
 * its sha256 (the staff-invite and share-link pattern).
 */

const INVITE_DAYS = 7;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: 'an owner',
  ATTORNEY: 'an attorney',
  INVESTIGATOR: 'an investigator',
  VIEWER: 'a viewer',
};
const WHAT_YOU_SEE: Record<MembershipRole, string> = {
  OWNER: 'every matter in the organisation, the team, and the allowance.',
  ATTORNEY: 'the matters you open and the packets delivered on them.',
  INVESTIGATOR: "the organisation's matters, read-only, and the request form for a chronology or a records tracker.",
  VIEWER: "the organisation's matters, read-only.",
};
/** The practice type a seat implies when the colleague has none of their own yet. */
const practiceTypeFor = (role: MembershipRole, kind: string) =>
  role === 'INVESTIGATOR' ? 'investigator' : kind === 'PD_OFFICE' ? 'pd' : kind === 'CLINIC' ? 'clinic' : 'other';

const InviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((e) => e.toLowerCase()),
  role: z.enum(['OWNER', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER']),
});

const PasswordSchema = z
  .string()
  .min(12, 'Must be at least 12 characters')
  .max(200)
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>/?]/, 'Must contain a number or symbol');

const AcceptSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  password: PasswordSchema.optional(),
});

const webOrigin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];

export default async function counselOrgRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireFlag('counsel_surfaces'));
  fastify.addHook('preHandler', async (request, reply) => {
    const seat = request.counsel!;
    if (seat.organisation.kind !== 'FIRM' && !(await isFlagOn('offices', seat.tenantId))) {
      return reply.status(404).send({ error: 'Not available' });
    }
  });

  const requireOwner = (request: FastifyRequest) => request.counsel!.role === 'OWNER';

  fastify.get('/', async (request) => {
    const seat = request.counsel!;
    const { members, invitations } = await withTenant(seat.tenantId, async (tx) => ({
      members: await tx.membership.findMany({
        where: { organisationId: seat.organisationId },
        include: { user: { select: { id: true, email: true, name: true, barVerifiedAt: true, practiceType: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      invitations: await tx.invitation.findMany({
        where: { organisationId: seat.organisationId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
      }),
    }));
    return {
      organisation: organisationView(seat.organisation),
      membership: { role: seat.role },
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        name: m.user.name,
        practiceType: m.user.practiceType,
        barVerified: m.user.barVerifiedAt !== null,
        since: m.createdAt,
      })),
      invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    };
  });

  // OWNER offers a seat. Re-inviting a pending address rotates its token
  // (one row per address per organisation); a current member is refused.
  fastify.post('/invitations', async (request, reply) => {
    const seat = request.counsel!;
    if (!requireOwner(request)) return reply.status(403).send({ error: 'Only an owner can invite colleagues' });
    const { email, role } = InviteSchema.parse(request.body);

    const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null }, select: { id: true } });
    if (existingUser) {
      const member = await withTenant(seat.tenantId, (tx) =>
        tx.membership.findUnique({ where: { organisationId_userId: { organisationId: seat.organisationId, userId: existingUser.id } } })
      );
      if (member) return reply.status(409).send({ error: 'That person already has a seat here' });
    }

    const { raw, hash } = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
    const invitation = await withTenant(seat.tenantId, async (tx) => {
      const pending = await tx.invitation.findFirst({ where: { organisationId: seat.organisationId, email, acceptedAt: null } });
      if (pending) {
        return tx.invitation.update({ where: { id: pending.id }, data: { tokenHash: hash, expiresAt, role, invitedBy: request.auth.userId } });
      }
      return tx.invitation.create({
        data: { tenantId: seat.tenantId, organisationId: seat.organisationId, email, role, tokenHash: hash, invitedBy: request.auth.userId, expiresAt },
      });
    });

    const inviter = await prisma.user.findUnique({ where: { id: request.auth.userId }, select: { name: true, email: true } });
    const acceptUrl = `${webOrigin()}/counsel/join?token=${raw}`;
    const { sendOrganisationInvite } = await import('@hg/email');
    const result = await sendOrganisationInvite(email, {
      organisationName: seat.organisation.name,
      roleLabel: ROLE_LABEL[role],
      whatYouSee: WHAT_YOU_SEE[role],
      acceptUrl,
      signInUrl: `${webOrigin()}/auth/signin`,
      invitedBy: inviter?.name || inviter?.email || 'A colleague',
      days: INVITE_DAYS,
    });

    await AuditService.log({
      tenantId: seat.tenantId, caseId: `organisation:${seat.organisationId}`, action: LogAction.SEAT_CHANGE, userId: request.auth.userId,
      details: { op: 'invitation_sent', invitationId: invitation.id, role, delivered: result.delivered },
    });
    return {
      invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt },
      invite: { delivered: result.delivered, error: result.error, ...(result.delivered ? {} : { acceptUrl }) },
    };
  });

  // OWNER removes a seat. The account stays (its matters, its audit trail);
  // the seat is gone, so /counsel refuses the person on their next request.
  fastify.delete('/members/:userId', async (request, reply) => {
    const seat = request.counsel!;
    if (!requireOwner(request)) return reply.status(403).send({ error: 'Only an owner can remove a seat' });
    const { userId } = request.params as { userId: string };
    const outcome = await withTenant(seat.tenantId, async (tx) => {
      const target = await tx.membership.findUnique({ where: { organisationId_userId: { organisationId: seat.organisationId, userId } } });
      if (!target) return { status: 404 as const };
      if (target.role === 'OWNER') {
        const owners = await tx.membership.count({ where: { organisationId: seat.organisationId, role: 'OWNER' } });
        if (owners <= 1) return { status: 409 as const };
      }
      await tx.membership.delete({ where: { id: target.id } });
      return { status: 200 as const, role: target.role };
    });
    if (outcome.status === 404) return reply.status(404).send({ error: 'No such seat' });
    if (outcome.status === 409) return reply.status(409).send({ error: 'An organisation keeps at least one owner — make someone else an owner first' });
    await AuditService.log({
      tenantId: seat.tenantId, caseId: `organisation:${seat.organisationId}`, action: LogAction.SEAT_CHANGE, userId: request.auth.userId,
      details: { op: 'member_removed', targetUserId: userId, role: outcome.role },
    });
    return { ok: true };
  });
}

/**
 * Accepting an invitation: anonymous, token-verified, the twin of
 * /auth/setup. Mounted at the counsel plugin's top level (public prefix in
 * the auth plugin), outside the seat hook. Creates the colleague as a
 * PROFESSIONAL (role CLIENT, like /counsel/signup) with the invited
 * membership role, or re-seats a professional of this organisation whose seat
 * was removed. An address that already belongs to another account or another
 * organisation is refused: a person belongs to one tenant.
 */
export async function invitationAcceptRoutes(fastify: FastifyInstance) {
  fastify.post('/org/invitations/:token/accept', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = AcceptSchema.parse(request.body);
    const fail = () =>
      reply.status(400).send({ error: 'This invitation link is invalid or has expired — ask the person who invited you to send it again.' });
    if (!token || token.length > 128) return fail();

    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organisation: true } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) return fail();
    const org = invitation.organisation;

    const existing = await prisma.user.findFirst({ where: { email: { equals: invitation.email, mode: 'insensitive' } } });
    let userId: string;
    let created = false;
    if (existing) {
      if (existing.deletedAt || existing.accountKind !== 'PROFESSIONAL') {
        return reply.status(409).send({ error: 'This email address already belongs to another kind of account. Ask for the invitation to be sent to a different address.' });
      }
      if (existing.tenantId !== org.tenantId) {
        return reply.status(409).send({ error: 'This email address already belongs to another organisation.' });
      }
      userId = existing.id;
      if (!existing.passwordHash && body.password) {
        await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(body.password, 12), passwordChangedAt: new Date() } });
      }
    } else {
      if (!body.password) return reply.status(400).send({ error: 'Choose a password to take your seat', field: 'password' });
      if (!body.name) return reply.status(400).send({ error: 'Tell us your name', field: 'name' });
      const user = await prisma.user.create({
        data: {
          email: invitation.email,
          name: body.name,
          passwordHash: await bcrypt.hash(body.password, 12),
          role: 'CLIENT',
          accountKind: 'PROFESSIONAL',
          tenantId: org.tenantId,
          practiceType: practiceTypeFor(invitation.role, org.kind),
        },
      });
      userId = user.id;
      created = true;
    }

    await withTenant(org.tenantId, async (tx) => {
      await tx.membership.upsert({
        where: { organisationId_userId: { organisationId: org.id, userId } },
        update: { role: invitation.role, invitedBy: invitation.invitedBy },
        create: { organisationId: org.id, tenantId: org.tenantId, userId, role: invitation.role, invitedBy: invitation.invitedBy },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    });

    await AuditService.log({
      tenantId: org.tenantId, caseId: `account:${userId}`, action: LogAction.ACCOUNT_SIGNUP, userId,
      details: { op: 'invitation_accepted', organisationId: org.id, invitationId: invitation.id, role: invitation.role, created },
    });
    return { ok: true, userId, organisationId: org.id, organisationName: org.name, role: invitation.role, created, email: invitation.email };
  });
}
