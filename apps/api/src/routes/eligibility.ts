import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '@hg/database';

/**
 * Anonymous S0 eligibility drafts (ENG-7, workflow S0):
 *  - No account, no case — answers are sensitive facts about a real person,
 *    stored server-side keyed by an opaque token, 30-day TTL then hard delete,
 *    never used for marketing.
 *  - Promotion to a case (at purchase, M2 webhook) copies then deletes.
 *  - Anonymous ⇒ owner connection by design (pre-tenant data, no RLS), with
 *    token-addressed access only and a tight rate limit.
 */

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const OUTCOMES = [
  'fit_trial',
  'fit_plea',
  'capital',
  'pending_appeal',
  'discharged',
  'misdemeanor',
  'prior_writ_warned',
  'not_fit_other',
] as const;

const DraftSchema = z.object({
  // S0 answers are enum/boolean shaped by design — never free text (§11a).
  answers: z.record(z.string().max(64), z.union([z.string().max(64), z.boolean()])),
  outcome: z.enum(OUTCOMES),
});

export default async function eligibilityRoutes(fastify: FastifyInstance) {
  const draftLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  fastify.post('/draft', draftLimit, async (request) => {
    const { answers, outcome } = DraftSchema.parse(request.body);
    const token = crypto.randomBytes(24).toString('base64url');

    await prisma.eligibilityDraft.create({
      data: {
        token,
        answers,
        outcome,
        expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      },
    });

    return { token };
  });

  fastify.get('/draft/:token', draftLimit, async (request, reply) => {
    const { token } = request.params as { token: string };
    const draft = await prisma.eligibilityDraft.findUnique({ where: { token } });
    if (!draft || draft.expiresAt < new Date()) {
      return reply.status(404).send({ error: 'Draft not found or expired' });
    }
    return { answers: draft.answers, outcome: draft.outcome };
  });
}

/** Hard-delete expired drafts (called at boot + on an interval). */
export async function deleteExpiredEligibilityDrafts(): Promise<number> {
  const res = await prisma.eligibilityDraft.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
