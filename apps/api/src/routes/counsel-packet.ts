import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '@hg/database';
import { requireFlag } from '../plugins/flags';
import { requireAccountKind, requireLawyerSeat } from '../plugins/guards';
import { AuditService, LogAction } from '../services/audit.service';
import { loadCounselPacket, type PacketLoad } from '../services/counsel-packet.service';

/**
 * The counsel packet (persona_rollout_plan.md §5 E, January slice), mounted
 * at /counsel/matters beside the matter routes and under the same hooks:
 * dark behind `counsel_surfaces` (404 when off), PROFESSIONAL-only with a
 * live seat (403), organisation-scoped (another organisation's matter is a
 * 404). The deliverable exists only once QA has released a report, so an
 * unreleased case answers 409 rather than an empty packet.
 *
 *   GET /counsel/matters/:caseId/packet.json  → { caseId, versionNo, templateVersion, sections }
 *   GET /counsel/matters/:caseId/packet.pdf   → the PDF (attachment)
 *
 * Both take `?version=`. Unknown query parameters are ignored: the former
 * `clientLetter=1` and `wdtex=1` switches are gone — UPL review 2026-10-23:
 * counsel decision pending (questions 8 and 9); the renderer holds those
 * paths behind `WITHHELD_PENDING_COUNSEL` — and an old link must not 400.
 * Every fetch is audited with ids only — never initials, a cause number or
 * a county.
 *
 * The packet is lawyer-only output (UPL review 2026-10-23, P1 + P2): after
 * the seat hook, requireLawyerSeat refuses an investigator or viewer seat
 * (LAWYER_SEAT_REQUIRED) and a lawyer seat whose bar number is pending or
 * rejected (BAR_PENDING / BAR_REJECTED), each a 403 with `reason`.
 */

const PacketQuery = z.object({
  version: z.coerce.number().int().min(1).optional(),
});

export default async function counselPacketRoutes(fastify: FastifyInstance) {
  // Order matters: the flag answers 404 before anything confirms the surface
  // exists; then the account kind (403); then the seat (403).
  fastify.addHook('preHandler', requireFlag('counsel_surfaces'));
  fastify.addHook('preHandler', requireAccountKind('PROFESSIONAL'));
  fastify.addHook('preHandler', async (request, reply) => {
    const { userId, tenantId } = request.auth;
    const seat = await withTenant(tenantId, (tx) =>
      tx.membership.findFirst({ where: { userId }, include: { organisation: true } })
    );
    if (!seat) return reply.status(403).send({ error: 'No active seat in an organisation' });
    request.counsel = seat;
  });
  fastify.addHook('preHandler', requireLawyerSeat());

  const refusal = (load: PacketLoad) =>
    load.status === 'not_found'
      ? { status: 404 as const, body: { error: 'Matter not found' } }
      : load.status === 'no_report'
        ? { status: 409 as const, body: { error: 'No report has been released for this matter yet; the packet is built from the released report.', reason: 'NO_RELEASED_REPORT' } }
        : null;

  const load = async (request: FastifyRequest) => {
    const { caseId } = request.params as { caseId: string };
    const q = PacketQuery.parse(request.query ?? {});
    const { tenantId } = request.auth;
    const seat = request.counsel!;
    const loaded = await loadCounselPacket(caseId, tenantId, seat.organisationId, seat.organisation.name, { versionNo: q.version });
    return { caseId, q, loaded, seat };
  };

  const audit = async (request: FastifyRequest, caseId: string, format: 'json' | 'pdf', versionNo: number, _q: z.output<typeof PacketQuery>, organisationId: string) =>
    AuditService.log({
      tenantId: request.auth.tenantId,
      caseId,
      action: LogAction.PACKET_DOWNLOAD,
      userId: request.auth.userId,
      details: { format, versionNo, organisationId },
    });

  fastify.get('/:caseId/packet.json', async (request, reply) => {
    const { caseId, q, loaded, seat } = await load(request);
    const refused = refusal(loaded);
    if (refused || loaded.status !== 'ok') return reply.status(refused!.status).send(refused!.body);
    const { counselPacketSections, COUNSEL_TEMPLATE_VERSION } = await import('@hg/reports');
    const sections = counselPacketSections(loaded.input);
    await audit(request, caseId, 'json', loaded.report.versionNo, q, seat.organisationId);
    return { caseId, reportId: loaded.report.id, versionNo: loaded.report.versionNo, templateVersion: COUNSEL_TEMPLATE_VERSION, sections };
  });

  fastify.get('/:caseId/packet.pdf', async (request, reply) => {
    const { caseId, q, loaded, seat } = await load(request);
    const refused = refusal(loaded);
    if (refused || loaded.status !== 'ok') return reply.status(refused!.status).send(refused!.body);
    const { renderCounselPacketPdf } = await import('@hg/reports');
    const pdf = await renderCounselPacketPdf(loaded.input);
    await audit(request, caseId, 'pdf', loaded.report.versionNo, q, seat.organisationId);
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="counsel-packet-${caseId}-v${loaded.report.versionNo}.pdf"`)
      .send(pdf);
  });
}
