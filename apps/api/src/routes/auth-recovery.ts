import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@hg/database';
import { generateToken, verifyToken } from '@hg/auth';
import { sendPasswordReset, sendPasswordChangedNotice, sendBackupEmailNotice, maskEmail } from '@hg/email';

/**
 * Password recovery (auth design §4.6/§6 Phase 2 — pulled into v1.0 scope
 * per ENG-7: a family returning after weeks of records-gathering is the
 * primary recovery case).
 *
 * Enumeration-safe throughout: forgot always answers {ok:true}; reset
 * failures are one generic message. Token: 256-bit random, sha256 hash
 * stored, 1-hour window, single-use (cleared on success). A successful
 * reset stamps passwordChangedAt — every existing session dies (the
 * auth-options jwt callback).
 */

const RESET_WINDOW_MS = 60 * 60 * 1000;

const PasswordSchema = z
  .string()
  .min(12)
  .max(200)
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>/?]/, 'Must contain a number or symbol');

export default async function authRecoveryRoutes(fastify: FastifyInstance) {
  const tightLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };

  fastify.post('/forgot', tightLimit, async (request) => {
    const { email } = z.object({ email: z.string().email().max(254) }).parse(request.body);

    // Case-insensitive, trimmed (2026-09-05): a capitalized first letter
    // must not make a real account look nonexistent.
    const address = email.trim().toLowerCase();
    const primary = await prisma.user.findFirst({ where: { email: { equals: address, mode: 'insensitive' } } });
    // Backup email (your_account "Backup email (2026-10-24)"): a VERIFIED
    // backup also answers — the link goes to the backup and the primary is
    // told. An unverified backup never matches. Two accounts may share one
    // backup address, so each of them gets its own link.
    const viaBackup = primary
      ? []
      : await prisma.user.findMany({
          where: { backupEmail: { equals: address, mode: 'insensitive' }, backupEmailVerifiedAt: { not: null }, deletedAt: null },
        });
    // WEB_ORIGIN is a comma-separated list (CORS allowlist); links use the
    // FIRST entry — same rule as checkout redirects. Raw use produced
    // 'http://a,http://b/auth/reset-password' links in dev (2026-09-02).
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
    for (const user of primary ? [primary] : viaBackup) {
      const { raw, hash } = generateToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: hash, resetExpires: new Date(Date.now() + RESET_WINDOW_MS) },
      });
      await sendPasswordReset(email, {
        resetUrl: `${origin}/auth/reset-password?token=${raw}&id=${user.id}`,
      });
      if (!primary) await sendBackupEmailNotice(user.email, { event: 'reset_requested_from_backup', backupMasked: maskEmail(address) });
    }
    // Same answer whether or not the account exists.
    return { ok: true };
  });

  // Invite acceptance (auth design §4.6): a staff account created by an
  // Admin has no password until its owner sets one through this link.
  fastify.post('/setup', tightLimit, async (request, reply) => {
    const { userId, token, password } = z
      .object({ userId: z.string().max(64), token: z.string().max(128), password: PasswordSchema })
      .parse(request.body);
    const fail = () =>
      reply.status(400).send({ error: 'This invite link is invalid or has expired — ask the person who added you to resend it.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.inviteToken || !user.inviteExpires || user.inviteExpires < new Date()) return fail();
    if (!verifyToken(token, user.inviteToken)) return fail();

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), inviteToken: null, inviteExpires: null },
    });
    return { ok: true, email: user.email };
  });

  fastify.post('/reset', tightLimit, async (request, reply) => {
    const { userId, token, password } = z
      .object({ userId: z.string().max(64), token: z.string().max(128), password: PasswordSchema })
      .parse(request.body);

    const fail = () =>
      reply.status(400).send({ error: 'This reset link is invalid or has expired — request a new one.' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.resetToken || !user.resetExpires || user.resetExpires < new Date()) return fail();
    if (!verifyToken(token, user.resetToken)) return fail();

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(), // kills every existing session
        resetToken: null,
        resetExpires: null,
      },
    });
    // Both addresses hear (2026-10-24): a reset that came through the
    // backup must reach the primary, and the other way round.
    void sendPasswordChangedNotice(user.email);
    if (user.backupEmail && user.backupEmailVerifiedAt) void sendPasswordChangedNotice(user.backupEmail);

    return { ok: true };
  });
}
