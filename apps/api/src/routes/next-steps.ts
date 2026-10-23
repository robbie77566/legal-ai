import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { verifyFindings } from '../services/analysis.service';
import { buildAttorneyPacketInput } from '../services/attorney-packet.service';

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
    const { recipientClass, recipientOrganisationId } = z
      .object({
        recipientClass: z.enum(['clinic', 'attorney']),
        // Workstream I: the family may name the clinic the packet goes to
        // (share_link_ux.md "Delivering the packet to a clinic"). Null keeps
        // the pre-inbox shape: consent for the clinic class as a whole.
        recipientOrganisationId: z.string().min(1).max(64).nullable().optional(),
      })
      .parse(request.body);

    const namedOrganisationId = recipientClass === 'clinic' ? recipientOrganisationId ?? null : null;
    if (namedOrganisationId) {
      // The organisation is another tenant's row: read on the owner connection, kind checked.
      const org = await prisma.organisation.findUnique({ where: { id: namedOrganisationId }, select: { kind: true } });
      if (!org || org.kind !== 'CLINIC') return reply.status(400).send({ error: 'That is not a clinic we can deliver to' });
    }

    return withTenant(tenantId, async (tx) => {
      const kase = await requireDeliverableCase(tx, id, userId);
      if (!kase) return reply.status(403).send({ error: 'Consent is available after your report is ready' });

      const existing = await tx.consentGrant.findFirst({
        where: { caseId: id, recipientClass, revokedAt: null, recipientOrganisationId: namedOrganisationId },
      });
      if (existing) return { grant: existing };

      const grant = await tx.consentGrant.create({
        data: { caseId: id, tenantId, userId, recipientClass, recipientOrganisationId: namedOrganisationId },
      });
      await appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'consent.granted',
        payload: { consentId: grant.id, recipientClass, ...(namedOrganisationId ? { recipientOrganisationId: namedOrganisationId } : {}) }, actor: userId,
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

      const grants = await tx.consentGrant.findMany({
        where: { caseId: id, recipientClass, revokedAt: null },
      });
      if (!grants.length) return reply.status(404).send({ error: 'No active consent to revoke' });

      // Every active grant of the class goes at once — a clinic the family
      // named and the class-wide grant alike. "Turn it off" means off.
      for (const grant of grants) {
        await tx.consentGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
        await appendCaseEvent(tx, {
          caseId: id, tenantId, type: 'consent.revoked',
          payload: { consentId: grant.id }, actor: userId,
        });
      }
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
 *
 * UPL review 2026-10-23 (E2): the page renders `sections` — the same
 * `attorneyPacketSections` the sealed attorney packet PDF prints, from the
 * same verified input — so the link and the download never drift. The
 * flat fields (`findings`, `posture`, `caseSummary`) stay for callers that
 * read them.
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
        findings: { id: string; category: string; severity: string; confidence?: number; partBText: string; citations: unknown[]; preserved?: string; harmStandard?: string; vehicle?: string; develop?: string; dependsOn?: string[] }[];
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

      const packetCase = await tx.case.findUnique({ where: { id: report.caseId } });
      const { attachConfidence } = await import('../services/finding-confidence.service');
      const visible = await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)));
      const { attorneyPacketSections, ATTORNEY_PACKET_NOTICE } = await import('@hg/reports');
      const input = await buildAttorneyPacketInput({
        kase: packetCase ?? { id: report.caseId, title: 'Case review', subsequentWrit: false },
        report,
        visible: visible as Parameters<typeof buildAttorneyPacketInput>[0]['visible'],
        droppedByReverification: snapshot.findings.length - visible.length,
      });
      return {
        // R-7: sharing creates no attorney-client relationship or privilege.
        // The words are the packet cover's (UPL review 2026-10-23: no claim
        // of a reviewer's approval, which no licence is required for).
        notice: ATTORNEY_PACKET_NOTICE,
        templateVersion: report.templateVersion,
        posture: input.posture,
        caseSummary: input.caseSummary,
        findings: visible.map(({ id: _id, ...f }) => f),
        sections: attorneyPacketSections(input),
      };
    });
  });
}
