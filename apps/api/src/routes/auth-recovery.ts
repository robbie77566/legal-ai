import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@hg/database';
import { generateToken, verifyToken } from '@hg/auth';
import { sendPasswordReset } from '@hg/email';

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

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const { raw, hash } = generateToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: hash, resetExpires: new Date(Date.now() + RESET_WINDOW_MS) },
      });
      const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      await sendPasswordReset(email, {
        resetUrl: `${origin}/auth/reset-password?token=${raw}&id=${user.id}`,
      });
    }
    // Same answer whether or not the account exists.
    return { ok: true };
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

    return { ok: true };
  });
}
