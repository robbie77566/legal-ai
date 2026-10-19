import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@hg/database';
import { isFlagOn } from '@hg/database/flags';
import { AuditService, LogAction } from '../services/audit.service';

/**
 * The anonymous half of the professional surfaces (persona_rollout_plan.md
 * §5 F). Both routes are public — listed in the auth plugin's allowlist —
 * and rate-limited in-route like /counsel/signup:
 *
 *   GET  /counsel/signup          { open } — whether professional sign-ups
 *                                 are open: the GLOBAL counsel_surfaces flag
 *                                 (no tenant yet; a visitor has none). The
 *                                 /for-counsel/signup form says "Sign-ups
 *                                 open January 2027" when it answers false.
 *   POST /counsel/pilot-interest  { office, county, name, email, note? } —
 *                                 the PD pilot form on /for-offices and
 *                                 /for-counsel §7. Emails every admin
 *                                 (sendPilotInterest) and writes one audit
 *                                 row; no table, no row of its own (the
 *                                 founder answers by hand in January).
 */

const origin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];

const PilotInterestSchema = z.object({
  office: z.string().trim().min(1, 'Tell us the office').max(160),
  county: z.string().trim().min(1, 'Tell us the county').max(64),
  name: z.string().trim().min(1, 'Tell us your name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  note: z.string().trim().max(2000).optional(),
});

export type PilotInterestBody = z.input<typeof PilotInterestSchema>;

export default async function counselPublicRoutes(fastify: FastifyInstance) {
  fastify.get('/signup', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => ({
    open: await isFlagOn('counsel_surfaces'),
  }));

  fastify.post('/pilot-interest', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    const body = PilotInterestSchema.parse(request.body);
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { email: true, tenantId: true },
      orderBy: { createdAt: 'asc' },
    });

    // Every admin, once; a failed send never fails the form (ENG-9).
    const { sendPilotInterest } = await import('@hg/email');
    const results = await Promise.allSettled(
      admins.map((a) =>
        sendPilotInterest(a.email, {
          office: body.office,
          county: body.county,
          name: body.name,
          email: body.email.toLowerCase(),
          note: body.note || null,
          consoleUrl: `${origin()}/ops/accounts`,
        })
      )
    );
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value.delivered).length;

    // One audit row under the staff tenant (the first admin's), never the
    // requester's name or email: the office and county are enough to
    // reconcile against the inbox.
    const staffTenant = admins[0]?.tenantId;
    if (staffTenant) {
      await AuditService.log({
        tenantId: staffTenant,
        caseId: `pilot-interest:${body.office.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`,
        action: LogAction.PILOT_INTEREST,
        userId: 'anonymous',
        details: { office: body.office, county: body.county, admins: admins.length, delivered, hasNote: Boolean(body.note) },
      });
    } else {
      request.log.warn({ office: body.office }, 'pilot interest received with no admin to notify');
    }

    return { ok: true };
  });
}
