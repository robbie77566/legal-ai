import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { isFlagOn } from '@hg/database/flags';
import { caseLabel, caseRef } from '@hg/case-lifecycle';
import { AuditService, LogAction } from '../services/audit.service';
import { requireFlag } from '../plugins/flags';

/**
 * The consented-packet inbox (persona_rollout_plan.md §3 clinic director,
 * §5 I; share_link_ux.md "Delivering the packet to a clinic").
 *
 * Two halves. The FAMILY half (mounted at /cases) lists the clinics that are
 * live and delivers the current released report to one of them: it needs an
 * active ConsentGrant for the clinic class that either names that clinic or
 * names none, and writes a PacketDelivery into the CLINIC's tenant. Nothing is
 * uploaded or copied: the row points at the family's report, and every read
 * re-checks the consent. The CLINIC half (mounted at /counsel/inbox inside
 * the counsel plugin) lists its deliveries and streams the PDF through the
 * same renderer the family and staff downloads use, marking the first open.
 *
 * The flag is read against the CLINIC's tenant: the test-in-production
 * protocol lights a clinic with a tenant override, and families can then
 * deliver to it; a family's own tenant never needs an override.
 */

const DeliverSchema = z.object({ clinicOrganisationId: z.string().min(1).max(64) });

/** The clinics a family may deliver to: kind CLINIC with clinic_inbox on. */
async function liveClinics() {
  const clinics = await prisma.organisation.findMany({ where: { kind: 'CLINIC' }, select: { id: true, name: true, tenantId: true }, orderBy: { name: 'asc' } });
  const live: { id: string; name: string }[] = [];
  for (const c of clinics) if (await isFlagOn('clinic_inbox', c.tenantId)) live.push({ id: c.id, name: c.name });
  return live;
}

/** The family-side truth behind a delivery, read under the family's tenant like a share link. */
async function sourceOf(d: { sourceTenantId: string; caseId: string; reportId: string; consentGrantId: string }) {
  return withTenant(d.sourceTenantId, async (tx) => {
    const [kase, report, consent] = await Promise.all([
      tx.case.findUnique({ where: { id: d.caseId }, select: { id: true, county: true, convictionYear: true, status: true, createdAt: true } }),
      tx.report.findUnique({ where: { id: d.reportId }, select: { id: true, versionNo: true, renderedAt: true } }),
      tx.consentGrant.findUnique({ where: { id: d.consentGrantId }, select: { revokedAt: true } }),
    ]);
    const revoked = !consent || consent.revokedAt !== null || !kase || kase.status === 'DELETED' || !report;
    return { kase, report, revoked };
  });
}

export default async function packetRoutes(fastify: FastifyInstance) {
  const requireOwningAccess = (tx: Parameters<Parameters<typeof withTenant>[1]>[0], caseId: string, userId: string) =>
    tx.caseAccess.findUnique({ where: { caseId_userId: { caseId, userId } } });

  fastify.get('/:id/packets/clinics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const access = await withTenant(tenantId, (tx) => requireOwningAccess(tx, id, userId));
    if (!access) return reply.status(403).send({ error: 'Forbidden' });
    return { clinics: await liveClinics() };
  });

  fastify.post('/:id/packets/deliver', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tenantId, userId } = request.auth;
    const { clinicOrganisationId } = DeliverSchema.parse(request.body);

    const gate = await withTenant(tenantId, async (tx) => {
      const access = await requireOwningAccess(tx, id, userId);
      if (!access || access.role !== 'ADMIN') return { error: 403 as const, message: 'Forbidden' };
      const kase = await tx.case.findUnique({ where: { id }, select: { status: true } });
      if (!kase || (kase.status !== 'READY' && kase.status !== 'DELIVERED')) {
        return { error: 403 as const, message: 'Delivery is available after your report is ready' };
      }
      return { error: null };
    });
    if (gate.error) return reply.status(gate.error).send({ error: gate.message });

    const clinic = await prisma.organisation.findUnique({ where: { id: clinicOrganisationId } });
    if (!clinic || clinic.kind !== 'CLINIC' || !(await isFlagOn('clinic_inbox', clinic.tenantId))) {
      return reply.status(404).send({ error: 'Not available' });
    }

    const { consent, report } = await withTenant(tenantId, async (tx) => ({
      consent: await tx.consentGrant.findFirst({
        where: { caseId: id, recipientClass: 'clinic', revokedAt: null, OR: [{ recipientOrganisationId: null }, { recipientOrganisationId: clinic.id }] },
        orderBy: { grantedAt: 'desc' },
      }),
      report: await tx.report.findFirst({ where: { caseId: id }, orderBy: { versionNo: 'desc' } }),
    }));
    if (!consent) return reply.status(403).send({ error: 'Consent to share with this clinic is needed first' });
    if (!report) return reply.status(404).send({ error: 'No report to deliver' });

    const existing = await withTenant(clinic.tenantId, (tx) =>
      tx.packetDelivery.findUnique({ where: { organisationId_reportId: { organisationId: clinic.id, reportId: report.id } } })
    );
    if (existing) {
      return { alreadyDelivered: true, delivery: { id: existing.id, organisationId: clinic.id, reportVersion: report.versionNo, deliveredAt: existing.deliveredAt } };
    }

    const delivery = await withTenant(clinic.tenantId, (tx) =>
      tx.packetDelivery.create({
        data: { tenantId: clinic.tenantId, organisationId: clinic.id, sourceTenantId: tenantId, caseId: id, reportId: report.id, consentGrantId: consent.id },
      })
    );
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId: id, tenantId, type: 'packet.delivered',
        payload: { deliveryId: delivery.id, organisationId: clinic.id, reportId: report.id, versionNo: report.versionNo }, actor: userId,
      })
    );
    await AuditService.log({
      tenantId, caseId: id, action: LogAction.PACKET_DELIVERY, userId,
      details: { op: 'packet_delivered', deliveryId: delivery.id, organisationId: clinic.id, versionNo: report.versionNo },
    });
    return { alreadyDelivered: false, delivery: { id: delivery.id, organisationId: clinic.id, reportVersion: report.versionNo, deliveredAt: delivery.deliveredAt } };
  });
}

/** The clinic's side. Mounted at /counsel/inbox inside the counsel plugin (seat on request.counsel). */
export async function clinicInboxRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireFlag('clinic_inbox'));
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.counsel!.organisation.kind !== 'CLINIC') {
      return reply.status(403).send({ error: 'The packet inbox is for clinic organisations' });
    }
  });

  fastify.get('/', async (request) => {
    const seat = request.counsel!;
    const deliveries = await withTenant(seat.tenantId, (tx) =>
      tx.packetDelivery.findMany({ where: { organisationId: seat.organisationId }, orderBy: { deliveredAt: 'desc' } })
    );
    const items = [];
    for (const d of deliveries) {
      const { kase, report, revoked } = await sourceOf(d);
      items.push({
        id: d.id,
        caseId: d.caseId,
        caseRef: caseRef(d.caseId),
        // The clinic reads the conviction (county · year), never the family's
        // own title for the case: the label is what a packet is about.
        caseTitle: kase ? caseLabel({ county: kase.county, convictionYear: kase.convictionYear, createdAt: kase.createdAt }) : 'No longer available',
        county: kase?.county ?? null,
        convictionYear: kase?.convictionYear ?? null,
        reportVersion: report?.versionNo ?? null,
        deliveredAt: d.deliveredAt,
        openedAt: d.openedAt,
        openedBy: d.openedBy,
        revoked,
      });
    }
    return { items };
  });

  fastify.get('/:deliveryId/report.pdf', async (request, reply) => {
    const seat = request.counsel!;
    const { deliveryId } = request.params as { deliveryId: string };
    const delivery = await withTenant(seat.tenantId, (tx) =>
      tx.packetDelivery.findFirst({ where: { id: deliveryId, organisationId: seat.organisationId } })
    );
    if (!delivery) return reply.status(404).send({ error: 'Not found' });
    const { report, revoked } = await sourceOf(delivery);
    if (revoked || !report) return reply.status(410).send({ error: 'The family has withdrawn consent for this packet' });

    const { staffReportPdf } = await import('../services/case-file.service');
    const out = await staffReportPdf(delivery.caseId, report.versionNo);
    if (!out) return reply.status(410).send({ error: 'This packet is no longer available' });

    if (!delivery.openedAt) {
      await withTenant(seat.tenantId, (tx) =>
        tx.packetDelivery.update({ where: { id: delivery.id }, data: { openedAt: new Date(), openedBy: request.auth.userId } })
      );
      await withTenant(delivery.sourceTenantId, (tx) =>
        appendCaseEvent(tx, {
          caseId: delivery.caseId, tenantId: delivery.sourceTenantId, type: 'packet.opened',
          payload: { deliveryId: delivery.id, organisationId: seat.organisationId }, actor: request.auth.userId,
        })
      );
    }
    await AuditService.log({
      tenantId: seat.tenantId, caseId: `delivery:${delivery.id}`, action: LogAction.PACKET_DELIVERY, userId: request.auth.userId,
      details: { op: 'packet_opened', sourceCaseId: delivery.caseId, versionNo: out.versionNo, firstOpen: !delivery.openedAt },
    });
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="snot-nose-legal-packet-${caseRef(delivery.caseId)}-v${out.versionNo}.pdf"`)
      .send(out.pdf);
  });
}
