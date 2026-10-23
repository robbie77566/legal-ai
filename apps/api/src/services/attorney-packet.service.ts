import prisma, { withTenant } from '@hg/database';
import {
  BRAND,
  caseLabel,
  caseRef,
  hasStructuredFields,
  harmLabel,
  investigationChecklist,
  issueWeight,
  normalizePreserved,
  preservedLabel,
  rankIssues,
  vehicleLabel,
  type SummaryRow,
} from '@hg/case-lifecycle';
import { SITE } from '@hg/reports';
import { createDocument, installFooter, renderBrandHeader, severityLabel, citeWhere, TONE_COLOR, type Pdf } from '@hg/reports/pdf-helpers';
import { verifyFindings } from './analysis.service';
import { attachConfidence } from './finding-confidence.service';
import { summaryRowsForReport } from './case-summary.service';
import { bottomLineFor } from './bottom-line.service';

/**
 * The ATTORNEY packet a clinic receives in its inbox (UPL review 2026-10-23,
 * P3: "deliver exactly what the consent names"). The family's consent card
 * promises "the attorney packet (Part B) and the case reference, nothing
 * else", so this is the SAME content the share-with-a-lawyer link serves
 * (apps/api/src/routes/next-steps.ts sharedReportRoutes): the FR-7-verified
 * findings' Part B text with the counsel labels (preservation, vehicle,
 * harm standard), the develop step, the priority ranking, the investigation
 * checklist, the lawyer posture line and the "About this case" rows — and
 * NEVER the family's Part A text, the bottom line, the deadline section or
 * the family closing notes.
 *
 * The share link answers JSON that the web page lays out; a clinic wants a
 * file, so the same data is rendered to PDF here with the report package's
 * helpers (brand header, footer, weight tones).
 *
 * TODO(ws/u3-part-b-split): branch ws/u3-part-b-split adds
 * GET /cases/:id/attorney-packet.pdf and a shared attorney-packet renderer in
 * packages/reports. When it lands, replace `renderAttorneyPacketPdf` below
 * with that renderer and `loadAttorneyPacket` with its loader, so the clinic
 * inbox, the share link and the family's own attorney-packet download are
 * one code path. Nothing else here should need to change.
 */

export interface AttorneyPacketFinding {
  id: string;
  category: string;
  severity: string;
  confidence?: number;
  partBText: string;
  citations: { volume: string | null; page: number | null; line?: number | null; excerpt: string }[];
  preserved?: string;
  harmStandard?: string;
  vehicle?: string;
  develop?: string;
  dependsOn?: string[];
}

export interface AttorneyPacketInput {
  /** "Bexar County · 2019" and the short case reference — never the family's own title. */
  caseTitle: string;
  caseRef: string;
  reportId: string;
  versionNo: number;
  templateVersion: string;
  renderedAt: Date | string;
  /** R-7: the same notice the share link carries. */
  notice: string;
  /** The lawyer posture line (bottomLine.forLawyer) — counts and the record's posture, no merit opinion. */
  posture: string | null;
  caseSummary: SummaryRow[];
  findings: AttorneyPacketFinding[];
  droppedByReverification: number;
  /** Test hook: uncompressed streams so assertions can read the text. */
  compress?: boolean;
}

/** The same notice the share link answers with; the clinic reads it on the cover. */
export const ATTORNEY_PACKET_NOTICE =
  'Attorney working packet (Part B). Prepared with AI assistance and checked against the record at render. Access to this packet does not itself create an attorney-client relationship or privilege.';

const FOOTER =
  `${BRAND.name} · ${BRAND.tagline} · ${SITE} · ` +
  'Attorney working packet (Part B): information about the contents of a court record for a lawyer\'s own review. ' +
  'It is not legal advice, does not create an attorney-client relationship, and is not protected by attorney-client privilege.';

interface SnapshotFinding extends AttorneyPacketFinding {
  partAText?: string;
}

export type AttorneyPacketLoad =
  | { status: 'gone' }
  | { status: 'ok'; input: AttorneyPacketInput; versionNo: number };

/**
 * The data behind the clinic's PDF, read under the FAMILY's tenant exactly
 * as the share link reads it: the report the delivery points at, FR-7
 * re-verified at this render, confidence attached, the lawyer posture and
 * the case summary rows. Part A text is dropped before the renderer sees it.
 */
export async function loadAttorneyPacket(caseId: string, reportId: string, opts: { compress?: boolean } = {}): Promise<AttorneyPacketLoad> {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.status === 'DELETED') return { status: 'gone' };
  return withTenant(kase.tenantId, async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (!report || report.caseId !== caseId) return { status: 'gone' as const };
    const snapshot = report.findingsSnapshot as unknown as { findings: SnapshotFinding[] };
    const { verified, failed } = await verifyFindings(tx, snapshot.findings.map((f) => f.id));
    const visible = await attachConfidence(tx, snapshot.findings.filter((f) => verified.includes(f.id)));
    const findings: AttorneyPacketFinding[] = visible.map(({ partAText: _partA, ...f }) => ({
      ...f,
      citations: (f.citations ?? []).map((c) => ({ volume: c.volume ?? null, page: c.page ?? null, line: c.line ?? null, excerpt: c.excerpt })),
    }));
    // The lawyer line of the bottom line only — the family headline and body never travel.
    const posture = bottomLineFor(visible, kase.subsequentWrit, null).forLawyer;
    const caseSummary = await summaryRowsForReport(report.runId, kase);
    return {
      status: 'ok' as const,
      versionNo: report.versionNo,
      input: {
        // The conviction (county · year) and the reference — never the family's own title for the case.
        caseTitle: caseLabel({ county: kase.county, convictionYear: kase.convictionYear, createdAt: kase.createdAt }),
        caseRef: caseRef(kase.id),
        reportId: report.id,
        versionNo: report.versionNo,
        templateVersion: report.templateVersion,
        renderedAt: report.renderedAt,
        notice: ATTORNEY_PACKET_NOTICE,
        posture: posture || null,
        caseSummary,
        findings,
        droppedByReverification: failed.length,
        compress: opts.compress,
      },
    };
  });
}

/**
 * Part B to PDF. Section order: cover (reference, notice), about this case,
 * the posture line, findings by weight with the counsel labels and the
 * develop step, issues by priority, the investigation checklist. No bottom
 * line, no Part A, no deadline section, no family notes.
 */
export function renderAttorneyPacketPdf(input: AttorneyPacketInput): Promise<Buffer> {
  const { doc, done } = createDocument({
    compress: input.compress ?? true,
    info: {
      Title: `${BRAND.name} — attorney packet (Part B) — ${input.caseRef}`,
      Author: `${BRAND.name} (${SITE})`,
      Subject: `Report ${input.reportId} v${input.versionNo} (template ${input.templateVersion}) — attorney packet`,
    },
  });
  installFooter(doc, FOOTER);
  renderBrandHeader(doc);
  renderAttorneyPacketBody(doc, input);
  doc.end();
  return done;
}

export function renderAttorneyPacketBody(doc: Pdf, input: AttorneyPacketInput): void {
  const ink = BRAND.colors.ink;
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(ink).text('Attorney working packet — Part B');
  doc.font('Helvetica').fontSize(11).fillColor('#222222').text(`${input.caseTitle} · ${input.caseRef}`);
  doc
    .fontSize(9)
    .fillColor('#555555')
    .text(`Report ${input.reportId} · version ${input.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · template ${input.templateVersion}`);
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text(input.notice);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`${BRAND.name} is operated by ${BRAND.operator}. We are not a law firm; this packet describes what is in a court record for a lawyer's own review and is not legal advice.`);
  doc.moveDown(1);

  // ---- About this case: record-cited rows, the family-told ones labelled ----
  if (input.caseSummary.some((r) => r.value)) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text('About this case');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text('From the record, with the page it comes from. A row marked "as the family told us" is from their answers, not the record.');
    doc.moveDown(0.4);
    for (const r of input.caseSummary) {
      const where = r.cite ? ` (${[r.cite.volume, r.cite.page != null ? `p. ${r.cite.page}` : null].filter(Boolean).join(' ') || 'record'})` : r.source === 'family' ? ' — as the family told us' : '';
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ink).text(`${r.label}: `, { continued: true });
      doc.font('Helvetica').fontSize(9.5).fillColor(r.value ? '#222222' : '#777777').text(r.value ? `${r.value}${where}` : 'not stated in the record');
    }
    doc.moveDown(1);
  }

  // ---- What the review found, for the attorney ----
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text('For the attorney');
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#222222')
    .text(
      `${input.findings.length} finding(s) were confirmed against the record at this render; every quoted passage was re-verified, character for character, against the digitised court record.` +
        (input.droppedByReverification > 0 ? ` ${input.droppedByReverification} item(s) failed that re-verification and are not shown.` : '')
    );
  if (input.posture) {
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text(input.posture);
  }
  doc.moveDown(1);

  const renderFinding = (f: AttorneyPacketFinding, idx: number) => {
    if (doc.y > doc.page.height - 200) doc.addPage();
    const w = issueWeight(f.severity, f.confidence);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TONE_COLOR[w.tone]).text(`${idx}. ${severityLabel(f.severity)} — ${f.category.replace(/_/g, ' ')}`);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TONE_COLOR[w.tone]).text(w.line);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(f.partBText);
    if (hasStructuredFields(f)) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8.5).fillColor('#444444').text(`${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}`);
      if (f.develop) doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444444').text('To develop: ', { continued: true }).font('Helvetica').text(f.develop);
      if (f.dependsOn?.length) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#8a4b00').text(`Depends on records not provided: ${f.dependsOn.join('; ')}`);
    }
    for (const c of f.citations) {
      doc.moveDown(0.2);
      const where = [citeWhere(c), c.line != null ? `l. ${c.line}` : null].filter(Boolean).join(' ');
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(`Record${where ? ` (${where})` : ''}: “${c.excerpt}”`, { indent: 12 });
    }
    doc.moveDown(0.8);
  };

  const strong = input.findings.filter((f) => f.severity === 'dispositive');
  const rest = input.findings.filter((f) => f.severity !== 'dispositive');
  let n = 1;
  if (strong.length > 0) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TONE_COLOR.urgent).text('Strong signals');
    doc.moveDown(0.4);
    for (const f of strong) renderFinding(f, n++);
  }
  if (rest.length > 0) {
    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TONE_COLOR.review).text('Possible issues and background');
    doc.moveDown(0.4);
    for (const f of rest) renderFinding(f, n++);
  }
  if (input.findings.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#222222')
      .text('The review recorded no finding meeting its reporting threshold on these documents. That is a statement about this screening, not about the record: a lawyer reviewing the full record may see more.');
    doc.moveDown(1);
  }

  // ---- Priority and the investigation checklist (the same helpers the share link's page uses) ----
  if (input.findings.some(hasStructuredFields)) {
    if (doc.y > doc.page.height - 220) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text('Issues by priority');
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text("Ordered by weight, then preservation, then the review standard. Preservation calls are the review's reading of the record and must be verified.");
    doc.moveDown(0.4);
    rankIssues(input.findings).forEach((f, i) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text(`${i + 1}. ${f.category.replace(/_/g, ' ')} — ${severityLabel(f.severity)}`);
      doc.font('Helvetica').fontSize(8.5).fillColor('#444444').text(`${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}`, { indent: 12 });
    });
    const checklist = investigationChecklist(input.findings);
    if (checklist.length) {
      doc.moveDown(0.8);
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(ink).text('Investigation checklist');
      doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text('What would need to be obtained or done to prove or rule out the issues above. For the attorney; not a recommendation to file anything.');
      doc.moveDown(0.3);
      checklist.forEach((item, i) => doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(`${i + 1}. ${item}`));
    }
    const unknown = input.findings.filter((f) => normalizePreserved(f.preserved) === 'unknown').length;
    if (unknown) doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(`${unknown} issue(s) carry no preservation call — the record excerpt did not show an objection and ruling.`);
    doc.moveDown(1);
  }

  doc.moveDown(0.6);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555555')
    .text(`Delivered to this clinic's inbox with the family's consent, which they may withdraw at any time; a withdrawn consent closes the packet. ${SITE}.`);
}
