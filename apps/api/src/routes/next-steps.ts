import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { verifyFindings } from '../services/analysis.service';

/**
 * S7 — act (US-5, ENG-8): consent-based referral (opt-in only, default off,
 * revocable) and the share-with-a-lawyer link (hashed token, expiring,
 * revocable, access-logged). Referral compliance note (R-6): recipientClass
 * only — no per-referral consideration, no matching; the directory surface
 * links the State Bar LRIS.
 */

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const SHARE_TTL_DAYS = 30;

export default async function nextStepsRoutes(fastify: FastifyInstance) {
  const requireDeliverableCase = async (
    tx: Parameters<Parameters<typeof withTenant>[1]>[0],
    caseId: string,
    userId: string
  ) => {
    const access = await tx.caseAccess.findUnique({
      where: { caseId_userId: { caseId, userId } },
    });
    if (!access) return null;
    const kase = await tx.case.findUnique({ where: { id: caseId } });
    if (!kase || (kase.status !== 'READY' && kase.status !== 'DELIVERED')) return null;
    return kase;
  };

  // Consent: grant (explicit, per recipient class) / revoke / read state.
  fastify.get('/:id/consent', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({ where: { caseId_userId: { caseId: id, userId } } });
      if (!access) return reply.status(403).send({ error: 'Forbidden' });
      const grants = await tx.consentGrant.findMany({ where: { caseId: id }, orderBy: { grantedAt: 'desc' } });
      return { grants };
    });
  });

  fastify.post('/:id/consent', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const { recipientClass } = z
      .object({ recipientClass: z.enum(['clinic', 'attorney']) })
      .parse(request.body);

    return withTenant(tenantId, async (tx) => {
      const kase = await requireDeliverableCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Consent is available after your report is ready' });

      const existing = await tx.consentGrant.findFirst({
        where: { caseId: id, recipientClass, revokedAt: null },
      });
      if (existing) return { grant: existing };

      const grant = await tx.consentGrant.create({
        data: { caseId: id, tenantId, userId, recipientClass },
      });
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'consent.granted',
        payload: { consentId: grant.id, recipientClass }, actor: userId,
      });
      return { grant };
    });
  });

  fastify.post('/:id/consent/revoke', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const { recipientClass } = z
      .object({ recipientClass: z.enum(['clinic', 'attorney']) })
      .parse(request.body);

    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({ where: { caseId_userId: { caseId: id, userId } } });
      if (!access) return reply.status(403).send({ error: 'Forbidden' });

      const grant = await tx.consentGrant.findFirst({
        where: { caseId: id, recipientClass, revokedAt: null },
      });
      if (!grant) return reply.status(404).send({ error: 'No active consent to revoke' });

      await tx.consentGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'consent.revoked',
        payload: { consentId: grant.id }, actor: userId,
      });
      return { ok: true };
    });
  });

  // Share-with-a-lawyer link (ENG-8): raw token travels in the URL only;
  // the DB stores its hash. Re-issuable; revocable from the case.
  fastify.post('/:id/share-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;

    return withTenant(tenantId, async (tx) => {
      const kase = await requireDeliverableCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Sharing is available after your report is ready' });

      const report = await tx.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' } });
      if (!report) return reply.status(404).send({ error: 'No report to share' });

      const raw = crypto.randomBytes(24).toString('base64url');
      const link = await tx.shareLink.create({
        data: {
          caseId: id, tenantId, reportId: report.id,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000),
        },
      });
      return { token: raw, expiresAt: link.expiresAt };
    });
  });

  fastify.post('/:id/share-link/revoke', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({ where: { caseId_userId: { caseId: id, userId } } });
      if (!access) return reply.status(403).send({ error: 'Forbidden' });
      await tx.shareLink.updateMany({
        where: { caseId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    });
  });

  // "Your lawyer opened it": the access log the family can see.
  fastify.get('/:id/share-link/activity', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    return withTenant(tenantId, async (tx) => {
      const access = await tx.caseAccess.findUnique({ where: { caseId_userId: { caseId: id, userId } } });
      if (!access) return reply.status(403).send({ error: 'Forbidden' });
      const links = await tx.shareLink.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } });
      return {
        links: links.map((l) => ({
          createdAt: l.createdAt, expiresAt: l.expiresAt, revokedAt: l.revokedAt,
          opens: (l.accessLog as unknown[]).length,
        })),
      };
    });
  });
}

/**
 * The attorney-facing view: anonymous, token-verified, Part B only.
 * Registered separately under /shared (public path in the auth plugin).
 */
export async function sharedReportRoutes(fastify: FastifyInstance) {
  fastify.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const link = await prisma.shareLink.findUnique({ where: { tokenHash: sha256(token) } });
    if (!link || link.revokedAt || link.expiresAt < new Date()) {
      return reply.status(404).send({ error: 'This link is no longer available' });
    }

    return withTenant(link.tenantId, async (tx) => {
      const report = await tx.report.findUnique({ where: { id: link.reportId } });
      if (!report) return reply.status(404).send({ error: 'This link is no longer available' });

      const snapshot = report.findingsSnapshot as {
        findings: { id: string; category: string; severity: string; partBText: string; citations: unknown[] }[];
      };
      const { verified } = await verifyFindings(tx, snapshot.findings.map((f) => f.id));

      // Access log: count + timestamp only (the family's trust signal).
      await tx.shareLink.update({
        where: { id: link.id },
        data: {
          accessLog: [
            ...(link.accessLog as { at: string }[]),
            { at: new Date().toISOString() },
          ],
        },
      });

      return {
        // R-7: sharing creates no attorney-client relationship or privilege.
        notice:
          'Attorney working packet (Part B). Prepared with AI assistance, approved by a trained reviewer. Access to this packet does not itself create an attorney-client relationship or privilege.',
        templateVersion: report.templateVersion,
        findings: snapshot.findings
          .filter((f) => verified.includes(f.id))
          .map(({ id: _id, ...f }) => f),
      };
    });
  });
}
