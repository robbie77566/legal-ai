import { BRAND, NOT_A_LAW_FIRM, hasStructuredFields, preservedLabel, harmLabel, vehicleLabel, rankIssues, investigationChecklist, normalizePreserved } from '@hg/case-lifecycle';
import type { ReportFinding, DeadlinePostureView, SummaryRowLike } from './family-report';
import { PALETTES, SITE, MARGIN, TONE_COLOR, severityLabel, createDocument, installFooter, renderBrandHeader, citeWhere, ensureRoom, type Pdf } from './pdf-helpers';

/**
 * The sealed attorney packet (UPL review 2026-10-23, finding E2,
 * recommendation 5; counsel question 3 pending). The attorney content the
 * family report used to carry inline — Part B, the preservation · vehicle ·
 * harm line, the develop steps, the issues-by-priority table, the
 * investigation checklist and the time computation for the lawyer — as ONE
 * separate document the family downloads and hands to licensed counsel, or
 * shares by link.
 *
 * `attorneyPacketSections(input)` is the content as structured JSON in
 * packet order; `renderAttorneyPacketPdf(input)` draws exactly those
 * sections, and the share-link page renders the same JSON — so the PDF and
 * the page cannot drift. Like every renderer in this package it never
 * touches the database: FR-7 re-verification is the caller's job.
 *
 * This is NOT the counsel-tier packet (counsel-packet.ts): no matter, no
 * inventory, no TRAP chain, no disclosure instruments. It is the attorney
 * half of the family product.
 */

export const ATTORNEY_PACKET_TEMPLATE_VERSION = 'attorney-v1';

/** The cover line (English; the Spanish line follows it on the cover). */
export const ATTORNEY_PACKET_COVER_LINE = {
  en: 'For the attorney. Prepared for the family to hand to licensed counsel; information about a court record, not legal advice.',
  es: 'Para el abogado. Preparado para que la familia lo entregue a un abogado con licencia; información sobre un expediente judicial, no asesoría legal.',
} as const;

/** R-7: the packet creates no relationship and no privilege. */
export const ATTORNEY_PACKET_NOTICE =
  'Prepared with AI assistance; every record citation was re-verified, character for character, against the digitized court record at the moment this packet was produced. Access to this packet does not itself create an attorney-client relationship or privilege.';

const FOOTER =
  `${BRAND.name} · attorney packet · ${SITE} · ` +
  'Information about the contents of a court record for licensed counsel. Not legal advice; ' +
  'not a prediction of any outcome; creates no attorney-client relationship or privilege.';

export interface AttorneyPacketInput {
  caseTitle: string;
  reportId: string;
  versionNo: number;
  /** The released report's template (AB-v2 …); the packet's own is ATTORNEY_PACKET_TEMPLATE_VERSION. */
  reportTemplateVersion: string;
  renderedAt: Date | string;
  subsequentWritMode: boolean;
  /** The verified findings (FR-7 at this render), strong and possible together or apart. */
  findings: ReportFinding[];
  droppedByReverification: number;
  /** "About this case" rows, printed without the family's re-run pitch. */
  caseSummary?: SummaryRowLike[] | null;
  /** The bottom line's lawyer posture line (bottomLine.forLawyer). */
  posture?: string | null;
  deadlinePosture?: DeadlinePostureView | null;
  /** Test hook: uncompressed streams so assertions can read the text. */
  compress?: boolean;
}

export interface PacketFinding {
  id: string;
  category: string;
  severity: string;
  severityLabel: string;
  confidence?: number;
  partBText: string;
  /** "Preserved · Direct appeal · Constitutional" — null when the snapshot predates the fields. */
  labels: string | null;
  develop: string | null;
  dependsOn: string[];
  citations: Array<{ volume: string | null; page: number | null; line?: number | null; excerpt: string; where: string }>;
}

export type AttorneyPacketSection =
  | {
      id: 'cover';
      title: string;
      coverLine: typeof ATTORNEY_PACKET_COVER_LINE;
      statement: string;
      notice: string;
      caseTitle: string;
      reportId: string;
      versionNo: number;
      templateVersion: string;
      reportTemplateVersion: string;
      renderedAt: string;
      subsequentWritMode: boolean;
    }
  | { id: 'case_summary'; rows: Array<{ label: string; value: string | null; source: 'record' | 'family' | null; where: string | null }> }
  | { id: 'posture'; line: string }
  | {
      id: 'time_computation';
      asOf: string;
      lines: Array<{ label: string; value: string }>;
      note: string;
    }
  | { id: 'part_b'; findings: PacketFinding[]; droppedByReverification: number }
  | {
      id: 'priority';
      intro: string;
      items: Array<{ id: string; category: string; severityLabel: string; labels: string }>;
      unknownPreservation: number;
    }
  | { id: 'checklist'; intro: string; items: string[] };

export type AttorneyPacketSectionId = AttorneyPacketSection['id'];

const civil = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

function packetFinding(f: ReportFinding): PacketFinding {
  const structured = hasStructuredFields(f);
  return {
    id: f.id,
    category: f.category,
    severity: f.severity,
    severityLabel: severityLabel(f.severity),
    ...(typeof f.confidence === 'number' ? { confidence: f.confidence } : {}),
    partBText: f.partBText,
    labels: structured ? `${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}` : null,
    develop: f.develop ?? null,
    dependsOn: f.dependsOn ?? [],
    citations: f.citations.map((c) => ({ ...c, where: citeWhere(c) || 'record' })),
  };
}

/** The time computation as data lines: the rule, the dates given and the arithmetic — no verdict. */
export function timeComputationLines(d: DeadlinePostureView): Array<{ label: string; value: string }> {
  return [
    { label: 'Rule', value: '28 U.S.C. §2244(d): one year from finality, tolled while a properly filed state application is pending' },
    { label: 'Finality date, as given', value: `${d.finalityDate} (${d.finalityBasis})` },
    { label: 'Countable days elapsed', value: String(d.aedpa.daysElapsed) },
    { label: 'Days tolled by state filings', value: String(d.aedpa.daysTolled) },
    { label: 'Computed days remaining', value: d.aedpa.expired ? `0 — the computed window ended on the dates given${d.aedpa.estimatedExpiryDate ? ` (${d.aedpa.estimatedExpiryDate})` : ''}` : String(d.aedpa.daysRemaining) },
    { label: 'Estimated end of the window', value: d.aedpa.estimatedExpiryDate ?? 'not computed' },
    { label: 'Tolling now', value: d.aedpa.tollingNow ? 'yes — a state application is recorded as pending' : 'no' },
    { label: 'Age of the conviction', value: d.lachesUrgency ? 'old enough that laches is a consideration under Texas state habeas practice' : 'laches not flagged on the dates given' },
  ];
}

const TIME_NOTE =
  'Computed from the dates the family provided under the rule as recalled; counsel verifies every date, filing and tolling event against the record before relying on any of it.';
const PRIORITY_INTRO =
  'Ordered by weight, then preservation, then the review standard. Preservation calls are the review\'s reading of the record and must be verified.';
const CHECKLIST_INTRO =
  'What would need to be obtained or done to prove or rule out the issues above. For the attorney; not a recommendation to file anything.';

export function attorneyPacketSections(input: AttorneyPacketInput): AttorneyPacketSection[] {
  const out: AttorneyPacketSection[] = [];
  const findings = input.findings;

  out.push({
    id: 'cover',
    title: 'Attorney packet',
    coverLine: ATTORNEY_PACKET_COVER_LINE,
    statement: NOT_A_LAW_FIRM,
    notice: ATTORNEY_PACKET_NOTICE,
    caseTitle: input.caseTitle,
    reportId: input.reportId,
    versionNo: input.versionNo,
    templateVersion: ATTORNEY_PACKET_TEMPLATE_VERSION,
    reportTemplateVersion: input.reportTemplateVersion,
    renderedAt: civil(input.renderedAt),
    subsequentWritMode: input.subsequentWritMode,
  });

  if (input.caseSummary && input.caseSummary.some((r) => r.value)) {
    out.push({
      id: 'case_summary',
      rows: input.caseSummary.map((r) => ({
        label: r.label,
        value: r.value,
        source: r.source,
        where: r.cite ? citeWhere(r.cite) || 'record' : null,
      })),
    });
  }

  if (input.posture) out.push({ id: 'posture', line: input.posture });

  if (input.deadlinePosture) {
    out.push({ id: 'time_computation', asOf: input.deadlinePosture.asOf, lines: timeComputationLines(input.deadlinePosture), note: TIME_NOTE });
  }

  out.push({ id: 'part_b', findings: findings.map(packetFinding), droppedByReverification: input.droppedByReverification });

  if (findings.some(hasStructuredFields)) {
    out.push({
      id: 'priority',
      intro: PRIORITY_INTRO,
      items: rankIssues(findings).map((f) => ({
        id: f.id,
        category: f.category,
        severityLabel: severityLabel(f.severity),
        labels: `${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}`,
      })),
      unknownPreservation: findings.filter((f) => normalizePreserved(f.preserved) === 'unknown').length,
    });
    const items = investigationChecklist(findings);
    if (items.length) out.push({ id: 'checklist', intro: CHECKLIST_INTRO, items });
  }

  return out;
}

// ── The PDF ─────────────────────────────────────────────────────────────────

const INK: string = PALETTES.snotnose.ink;
const BODY = '#222222';
const MUTED = '#555555';

export function renderAttorneyPacketPdf(input: AttorneyPacketInput): Promise<Buffer> {
  const sections = attorneyPacketSections(input);
  const { doc, done } = createDocument({
    compress: input.compress ?? true,
    info: {
      Title: `${BRAND.name} — attorney packet — ${input.caseTitle}`,
      Author: `${BRAND.name} (${SITE})`,
      Subject: `Attorney packet for report ${input.reportId} v${input.versionNo} (template ${ATTORNEY_PACKET_TEMPLATE_VERSION} over ${input.reportTemplateVersion}) — ${SITE}`,
    },
  });
  installFooter(doc, FOOTER);
  renderBrandHeader(doc);

  const h1 = (t: string) => { doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(t); doc.moveDown(0.3); };
  const body = (t: string, size = 9.5, color = BODY) => doc.font('Helvetica').fontSize(size).fillColor(color).text(t);
  const muted = (t: string, size = 8.5) => doc.font('Helvetica-Oblique').fontSize(size).fillColor(MUTED).text(t);
  const kv = (label: string, value: string, size = 9.5) => {
    doc.font('Helvetica-Bold').fontSize(size).fillColor(INK).text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor(BODY).text(value);
  };

  let n = 1;
  for (const s of sections) {
    switch (s.id) {
      case 'cover': {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(s.title);
        doc.font('Helvetica').fontSize(12).fillColor(INK).text(s.caseTitle);
        doc.moveDown(0.4);
        // The cover line and the statutory statement at body size, both languages.
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BODY).text(s.coverLine.en);
        doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(s.coverLine.es);
        doc.moveDown(0.4);
        body(s.statement, 10);
        doc.moveDown(0.3);
        body(s.notice, 9.5, MUTED);
        doc.moveDown(0.4);
        body(`Report ${s.reportId} · version ${s.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · packet template ${s.templateVersion} · report template ${s.reportTemplateVersion}`, 8.5, MUTED);
        if (s.subsequentWritMode) {
          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TONE_COLOR.review).text('The case facts record a prior application on this conviction; the findings are marked for the subsequent-application analysis.');
        }
        doc.save().rect(MARGIN, doc.y + 8, doc.page.width - MARGIN * 2, 0.75).fill('#999999').restore();
        doc.y += 16;
        break;
      }
      case 'case_summary': {
        ensureRoom(doc, 180);
        h1('About this case');
        muted('From the record, with the page it comes from; a row marked "as the family stated" is from the family\'s answers, not the record.');
        doc.moveDown(0.3);
        for (const r of s.rows) {
          const where = r.where ? ` (${r.where})` : r.source === 'family' ? ' — as the family stated' : '';
          doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(`${r.label}: `, { continued: true });
          doc.font('Helvetica').fontSize(9.5).fillColor(r.value ? BODY : '#777777').text(r.value ? `${r.value}${where}` : 'not stated in the record');
        }
        doc.moveDown(1);
        break;
      }
      case 'posture': {
        ensureRoom(doc, 80);
        h1('Posture');
        body(s.line, 9.5);
        doc.moveDown(1);
        break;
      }
      case 'time_computation': {
        ensureRoom(doc, 200);
        h1(`Time computation (as of ${s.asOf})`);
        for (const l of s.lines) kv(l.label, l.value, 9);
        doc.moveDown(0.3);
        muted(s.note);
        doc.moveDown(1);
        break;
      }
      case 'part_b': {
        ensureRoom(doc, 200);
        h1('Part B — findings on the record');
        muted(`${s.findings.length} finding${s.findings.length === 1 ? '' : 's'} verified against the record at render${s.droppedByReverification > 0 ? `; ${s.droppedByReverification} failed re-verification and are not shown` : ''}. Record citations and doctrine categories only.`);
        doc.moveDown(0.5);
        for (const f of s.findings) {
          ensureRoom(doc, 150);
          const tone = f.severity === 'dispositive' ? TONE_COLOR.urgent : f.severity === 'supportive' ? TONE_COLOR.review : TONE_COLOR.muted;
          doc.font('Helvetica-Bold').fontSize(11).fillColor(tone).text(`${n++}. ${f.severityLabel} — ${f.category.replace(/_/g, ' ')}${typeof f.confidence === 'number' ? ` · confidence ${Math.round(f.confidence * 100)}%` : ''}`);
          doc.moveDown(0.2);
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text('For an attorney');
          body(f.partBText, 9.5);
          if (f.labels) {
            doc.moveDown(0.2);
            body(f.labels, 8.5, '#444444');
          }
          if (f.develop) doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444444').text('To develop: ', { continued: true }).font('Helvetica').text(f.develop);
          if (f.dependsOn.length) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(TONE_COLOR.review).text(`Depends on records not provided: ${f.dependsOn.join('; ')}`);
          for (const c of f.citations) {
            doc.moveDown(0.2);
            doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(`Record (${c.where}): “${c.excerpt}”`, { indent: 12 });
          }
          doc.moveDown(0.8);
        }
        if (s.findings.length === 0) body('The review recorded no finding that met the reporting threshold and verified at render. A clean screen is not a verdict on every possible claim.', 9.5, MUTED);
        doc.moveDown(0.6);
        break;
      }
      case 'priority': {
        ensureRoom(doc, 220);
        h1('For counsel — issues by priority');
        muted(s.intro);
        doc.moveDown(0.4);
        s.items.forEach((it, i) => {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(BODY).text(`${i + 1}. ${it.category.replace(/_/g, ' ')} — ${it.severityLabel}`);
          body(it.labels, 8.5, '#444444');
        });
        if (s.unknownPreservation) {
          doc.moveDown(0.3);
          muted(`${s.unknownPreservation} issue(s) carry no preservation call — the record excerpt did not show an objection and ruling.`);
        }
        doc.moveDown(1);
        break;
      }
      case 'checklist': {
        ensureRoom(doc, 160);
        h1('Investigation checklist');
        muted(s.intro);
        doc.moveDown(0.3);
        s.items.forEach((item, i) => body(`${i + 1}. ${item}`, 9.5));
        doc.moveDown(1);
        break;
      }
    }
  }

  doc.moveDown(0.6);
  body(`The family's own report, the court documents and this packet are at ${SITE}. Questions from counsel: ${BRAND.email}.`, 9, MUTED);
  doc.end();
  return done;
}
