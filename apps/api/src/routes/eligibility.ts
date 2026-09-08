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

  // G-E1: the pending-appeal outcome is the one not-fit that becomes a fit
  // later. Email only; a confirmation now and one reminder in ~3 months.
  fastify.post('/lead', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request) => {
    const { email, outcome } = z.object({ email: z.string().email().max(254), outcome: z.enum(['pending_appeal']) }).parse(request.body);
    const lead = await createEligibilityLead(email, outcome);
    return { ok: true, remindAt: lead.remindAt };
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

const REMIND_MONTHS = 3;

/** G-E1: pending-appeal families leave an email; one reminder ~90 days on. */
export async function createEligibilityLead(email: string, outcome: string) {
  const remindAt = new Date();
  remindAt.setMonth(remindAt.getMonth() + REMIND_MONTHS);
  const lead = await prisma.eligibilityLead.create({ data: { email: email.trim().toLowerCase(), outcome, remindAt } });
  const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
  const { sendCheckBackLater } = await import('@hg/email');
  void sendCheckBackLater(lead.email, { checkUrl: `${origin}/check`, months: REMIND_MONTHS });
  return lead;
}

/** Daily sweep: the one reminder, stamped idempotently. */
export async function sendPendingAppealReminders(now = new Date()): Promise<number> {
  const due = await prisma.eligibilityLead.findMany({ where: { remindAt: { lte: now }, remindedAt: null }, take: 200 });
  const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
  const { sendPendingAppealReminder } = await import('@hg/email');
  let sent = 0;
  for (const lead of due) {
    await sendPendingAppealReminder(lead.email, { checkUrl: `${origin}/check` });
    await prisma.eligibilityLead.update({ where: { id: lead.id }, data: { remindedAt: now } });
    sent++;
  }
  return sent;
}

/** Hard-delete expired drafts (called at boot + on an interval). */
export async function deleteExpiredEligibilityDrafts(): Promise<number> {
  const res = await prisma.eligibilityDraft.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
