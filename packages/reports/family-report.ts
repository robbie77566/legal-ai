import { issueWeight, WEIGHT_LEGEND, SURENESS_LEGEND, BRAND, federalWindowEndDate, hasStructuredFields, preservedLabel, harmLabel, vehicleLabel, rankIssues, investigationChecklist, normalizePreserved } from '@hg/case-lifecycle';
import { PALETTES, SITE, TONE_COLOR, severityLabel, createDocument, installFooter, renderBrandHeader, citeWhere, type ReportPalette, type PaletteColors, type Pdf } from './pdf-helpers';

/**
 * ENG-11 report PDF (M5): renders the QA-approved findings snapshot —
 * the SAME payload the web report serves after FR-7 re-verification.
 * The renderer never touches the database: verification stays the
 * caller's job, so a finding that fails re-verification can never
 * appear in a PDF by construction.
 *
 * Built-in Helvetica only (no font files); letter size; every page
 * carries the no-advice/no-privilege footer. Document metadata is
 * tagged for provenance (template version, report id).
 *
 * The palette, footer and header helpers live in pdf-helpers.ts, shared
 * with the counsel packet (counsel-packet.ts); the family layout here is
 * unchanged by that split.
 */

export interface ReportFinding {
  id: string;
  category: string;
  severity: string;
  /** 0..1 from the analysis; absent on snapshots written before 2026-09-12. */
  confidence?: number;
  partAText: string;
  partBText: string;
  citations: { volume: string | null; page: number | null; excerpt: string }[];
  /** Prompt set v2 fields — absent on older snapshots, which render as before. */
  preserved?: string;
  harmStandard?: string;
  vehicle?: string;
  develop?: string;
  dependsOn?: string[];
}

export interface DeadlinePostureView {
  finalityDate: string;
  finalityBasis: string;
  aedpa: {
    daysElapsed: number;
    daysTolled: number;
    daysRemaining: number;
    expired: boolean;
    estimatedExpiryDate: string | null;
    tollingNow: boolean;
  };
  lachesUrgency: boolean;
  asOf: string;
}

export interface ReportPdfInput {
  caseTitle: string;
  reportId: string;
  versionNo: number;
  templateVersion: string;
  renderedAt: Date | string;
  subsequentWritMode: boolean;
  deadlinePosture?: DeadlinePostureView | null;
  strongSignals: ReportFinding[];
  possibleIssues: ReportFinding[];
  droppedByReverification: number;
  /** Matches the web theme; harbor is THE theme (A/B retired 2026-09-02). */
  palette?: ReportPalette;
  /** Test hook: uncompressed streams so assertions can read the text. */
  compress?: boolean;
  /** "About this case" rows (case-lifecycle summaryRows): record-cited, family-told, or unknown. */
  summary?: SummaryRowLike[];
  /** "The bottom line" (case-lifecycle bottomLine): deterministic, never advice. */
  bottomLine?: { headline: string; body: string[] } | null;
  /** Rows not confirmed from the record + the missing documents that would state them. */
  summaryGap?: { labels: string[]; documents: Array<{ kind: string; label: string }> } | null;
  rerunPriceCents?: number;
  /**
   * FR-10 (K3): the family told us about evidence that was never presented.
   * Set only from the case facts; `note` is their own words, printed
   * verbatim — never an inference. Absent or null: no section.
   */
  newEvidence?: NewEvidenceFlag | null;
}

export interface NewEvidenceFlag {
  told: true;
  note?: string;
}

/** The new-evidence section's copy — the same words the web report card shows (lib/content/new-evidence.ts). */
export const NEW_EVIDENCE_COPY = {
  title: 'Evidence that was never presented',
  body: 'You told us about evidence that was never presented — this review can’t evaluate it, but your attorney must know about it.',
  said: 'What you told us',
  answeredYes: 'When we asked whether there is evidence that was never presented — like a recantation, an alibi, or a new witness — you answered yes.',
  next: 'Tell your attorney about it in your first conversation — it is not in the court record, so nothing in this report speaks to it.',
} as const;

/**
 * "Time limits" and the rule lines, as description (UPL review 2026-10-23,
 * E5) — the same English words the web report shows
 * (lib/content/report-deadlines.ts). `{x}` placeholders are filled at render.
 */
export const DEADLINE_COPY = {
  title: 'Time limits (as of {asOf})',
  verify:
    'These dates are counted from the dates your family gave and the standard rules. They are not legal advice. A lawyer must check every date before anyone relies on it.',
  ended: 'By our count from the dates you gave, the one-year federal window ended on {date}.',
  endedNoDate: 'By our count from the dates you gave, the one-year federal window has ended.',
  open: 'By our count from the dates you gave, the one-year federal window is open until about {date}.',
  openNoDate: 'By our count from the dates you gave, the one-year federal window is open.',
  paused: 'By our count, the one-year federal window is paused while the state court decides.',
  basis: 'The count starts when the conviction became final ({finalityDate} — {finalityBasis}); about {daysElapsed} countable days have passed.',
  basisTolled: ' {daysTolled} of the days since then were paused during state filings.',
  pauseRule: 'A properly filed state application pauses this count only while it is pending; it does not restart it.',
  laches:
    'This conviction is old. Texas state habeas has no fixed deadline. Texas courts may consider delay (the rule is called laches); a lawyer can tell you whether it applies.',
  subsequentWrit:
    'A writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4. A licensed Texas attorney is the person to take this to.',
} as const;

export interface SummaryRowLike {
  key: string;
  label: string;
  value: string | null;
  source: 'record' | 'family' | null;
  cite?: { volume?: string | null; page?: number | null; quote: string };
}

const FOOTER =
  `${BRAND.name} · ${BRAND.tagline} · ${SITE} · ` +
  'This is an information report about the contents of a court record. It is not legal advice, ' +
  'does not create an attorney-client relationship, and is not protected by attorney-client privilege. ' +
  'Decisions about any filing should be made with a licensed attorney.';

/** The gap note, shared wording with the web report. */
export function summaryGapNote(gap: { labels: string[]; documents: Array<{ kind: string; label: string }> }, rerunPriceCents?: number): string {
  const docs = gap.documents.map((d) => d.label).join(', ');
  const price = rerunPriceCents != null ? ` — $${Math.round(rerunPriceCents / 100)} at today's price` : '';
  return `Not confirmed from the documents you sent: ${gap.labels.join(', ')}. These are usually stated on: ${docs} (not uploaded). If you can get ${gap.documents.length === 1 ? 'it' : 'them'}, upload and re-run the analysis${price}; the review would then fill these in from the record.`;
}

export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const { doc, done } = createDocument({
    compress: input.compress ?? true, // tests read the text stream uncompressed
    info: {
      Title: `${BRAND.name} — case review — ${input.caseTitle}`,
      Author: `${BRAND.name} (${SITE})`,
      Subject: `Report ${input.reportId} v${input.versionNo} (template ${input.templateVersion}) — snotnoselegal.com`,
    },
  });
  installFooter(doc, FOOTER);
  renderBrandHeader(doc);
  renderFamilyReportBody(doc, input);
  doc.end();
  return done;
}

/**
 * The family report's content path, from the case title under the brand
 * header to the closing note — reused by the counsel packet's optional
 * Part A client letter so the family voice is rendered by exactly one
 * piece of code. The caller owns the document, the footer and the header.
 */
export function renderFamilyReportBody(doc: Pdf, input: ReportPdfInput): void {
  const pal: PaletteColors = PALETTES[input.palette ?? 'snotnose'];
  doc.moveDown(0.8);
  doc.fontSize(12).fillColor(pal.ink).text(input.caseTitle);
  doc
    .fontSize(9)
    .fillColor('#555555')
    .text(
      `Report ${input.reportId} · version ${input.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · template ${input.templateVersion}`
    );
  doc.moveDown(1);

  // ---- About this case (PO 2026-09-12): grounded summary, never inferred ----
  if (input.summary && input.summary.some((r) => r.value)) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('About this case');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text('From the record you sent, with the page it comes from. A line marked "as your family told us" is from your answers, not the record.');
    doc.moveDown(0.4);
    for (const r of input.summary) {
      const where = r.cite ? ` (${[r.cite.volume, r.cite.page != null ? `p. ${r.cite.page}` : null].filter(Boolean).join(' ') || 'record'})` : r.source === 'family' ? ' — as your family told us' : '';
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(pal.ink).text(`${r.label}: `, { continued: true });
      doc.font('Helvetica').fontSize(9.5).fillColor(r.value ? '#222222' : '#777777').text(r.value ? `${r.value}${where}` : 'not stated in the record');
    }
    if (input.summaryGap && input.summaryGap.documents.length > 0) {
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(summaryGapNote(input.summaryGap, input.rerunPriceCents));
    }
    doc.moveDown(1);
  }

  // ---- TL;DR ----
  doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('What we found');
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#222222')
    .text(
      `${input.strongSignals.length} strong signal(s) and ${input.possibleIssues.length} possible issue(s) were confirmed against the record. ` +
        'Every quoted passage below was mechanically re-verified, character for character, against the digitized court record at the moment this report was produced.' +
        (input.droppedByReverification > 0
          ? ` ${input.droppedByReverification} item(s) failed that re-verification and are not shown.`
          : '')
    );
  // ---- The bottom line (PO 2026-09-12) ----
  if (input.bottomLine) {
    doc.moveDown(0.7);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('The bottom line');
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(pal.accent).text(input.bottomLine.headline);
    for (const p of input.bottomLine.body) {
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#222222').text(p);
    }
  }

  if (input.subsequentWritMode) {
    // UPL review 2026-10-23 (E1/E5): the rule, stated; no bar "applies", no instruction.
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(DEADLINE_COPY.subsequentWrit);
  }
  doc.moveDown(1);

  // FR-5 as description (UPL review 2026-10-23, E5): the dates given and
  // what was counted from them, the rule, and the verify sentence first at
  // body size. No verdicts: no "CLOSED", no bold day count, no urgency.
  if (input.deadlinePosture) {
    const d = input.deadlinePosture;
    const date = federalWindowEndDate({ expired: d.aedpa.expired, tollingNow: d.aedpa.tollingNow, estimatedExpiryDate: d.aedpa.estimatedExpiryDate, finalityDate: d.finalityDate, daysTolled: d.aedpa.daysTolled });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text(DEADLINE_COPY.title.replace('{asOf}', d.asOf));
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(DEADLINE_COPY.verify);
    doc.moveDown(0.3);
    const count = d.aedpa.expired
      ? date ? DEADLINE_COPY.ended.replace('{date}', date) : DEADLINE_COPY.endedNoDate
      : d.aedpa.tollingNow
        ? DEADLINE_COPY.paused
        : date ? DEADLINE_COPY.open.replace('{date}', date) : DEADLINE_COPY.openNoDate;
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(count);
    doc.moveDown(0.2);
    doc.text(
      DEADLINE_COPY.basis.replace('{finalityDate}', d.finalityDate).replace('{finalityBasis}', d.finalityBasis).replace('{daysElapsed}', String(d.aedpa.daysElapsed)) +
        (d.aedpa.daysTolled > 0 ? DEADLINE_COPY.basisTolled.replace('{daysTolled}', String(d.aedpa.daysTolled)) : '') +
        ' ' +
        DEADLINE_COPY.pauseRule
    );
    if (d.lachesUrgency) {
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#222222').text(DEADLINE_COPY.laches);
    }
    doc.moveDown(1);
  }

  const renderFinding = (f: ReportFinding, idx: number) => {
    if (doc.y > doc.page.height - 200) doc.addPage();
    const w = issueWeight(f.severity, f.confidence);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TONE_COLOR[w.tone]).text(`${idx}. ${severityLabel(f.severity)} — ${f.category.replace(/_/g, ' ')}`);
    // The weight line (PO, 2026-09-12): how much it could matter, and how
    // sure the review is — so major and minor are told apart at a glance.
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TONE_COLOR[w.tone]).text(w.line);
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text('For your family (plain English)');
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(f.partAText);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text('For an attorney');
    doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(f.partBText);
    if (hasStructuredFields(f)) {
      // What a manual appellate review tracks per issue (prompt set v2).
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(8.5).fillColor('#444444')
        .text(`${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}`);
      if (f.develop) doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444444').text('To develop: ', { continued: true }).font('Helvetica').text(f.develop);
      if (f.dependsOn?.length) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#8a4b00').text(`Depends on records not provided: ${f.dependsOn.join('; ')}`);
    }
    for (const c of f.citations) {
      doc.moveDown(0.2);
      const where = citeWhere(c);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(`Record${where ? ` (${where})` : ''}: “${c.excerpt}”`, { indent: 12 });
    }
    doc.moveDown(0.8);
  };

  let n = 1;
  if (input.strongSignals.length + input.possibleIssues.length > 0) {
    // Legend once, before the first issue: what the weight words mean.
    doc.font('Helvetica-Bold').fontSize(10).fillColor(pal.ink).text('How to read each issue');
    doc.moveDown(0.2);
    for (const l of WEIGHT_LEGEND) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TONE_COLOR[l.tone]).text(`${l.badge}: `, { continued: true });
      doc.font('Helvetica').fillColor('#222222').text(l.means);
    }
    doc.font('Helvetica').fontSize(9).fillColor('#222222').text(SURENESS_LEGEND);
    doc.moveDown(0.8);
  }
  if (input.strongSignals.length > 0) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TONE_COLOR.urgent).text('Strong signals');
    doc.moveDown(0.4);
    for (const f of input.strongSignals) renderFinding(f, n++);
  }
  if (input.possibleIssues.length > 0) {
    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(TONE_COLOR.review).text('Possible issues and background');
    doc.moveDown(0.4);
    for (const f of input.possibleIssues) renderFinding(f, n++);
  }
  // For counsel (prompt set v2): the ranked table and the investigation
  // checklist a manual review ends with. Rendered only when the findings
  // carry the fields, so older reports are unchanged.
  const all = [...input.strongSignals, ...input.possibleIssues];
  if (all.some(hasStructuredFields)) {
    if (doc.y > doc.page.height - 220) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('For counsel — issues by priority');
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text('Ordered by weight, then preservation, then the review standard. Preservation calls are the review\'s reading of the record and must be verified.');
    doc.moveDown(0.4);
    rankIssues(all).forEach((f, i) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222').text(`${i + 1}. ${f.category.replace(/_/g, ' ')} — ${severityLabel(f.severity)}`);
      doc.font('Helvetica').fontSize(8.5).fillColor('#444444').text(`${preservedLabel(f.preserved)} · ${vehicleLabel(f.vehicle)} · ${harmLabel(f.harmStandard)}`, { indent: 12 });
    });
    const checklist = investigationChecklist(all);
    if (checklist.length) {
      doc.moveDown(0.8);
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('Investigation checklist');
      doc.font('Helvetica').fontSize(8.5).fillColor('#555555').text('What would need to be obtained or done to prove or rule out the issues above. For the attorney; not a recommendation to file anything.');
      doc.moveDown(0.3);
      checklist.forEach((item, i) => doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(`${i + 1}. ${item}`));
    }
    const unknown = all.filter((f) => normalizePreserved(f.preserved) === 'unknown').length;
    if (unknown) doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(`${unknown} issue(s) carry no preservation call — the record excerpt did not show an objection and ruling.`);
    doc.moveDown(1);
  }
  if (input.strongSignals.length + input.possibleIssues.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(
        'Our review did not surface findings meeting our reporting threshold. This does not mean no issue exists — it means this screening, on these documents, did not find one. An attorney reviewing the full record may see more.'
      );
  }

  // ---- New evidence (FR-10, K3): its own section, after the findings and
  // before the closing notes. Only what the family told us, in their words.
  if (input.newEvidence?.told) {
    doc.moveDown(0.8);
    if (doc.y > doc.page.height - 180) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text(NEW_EVIDENCE_COPY.title);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(NEW_EVIDENCE_COPY.body);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text(NEW_EVIDENCE_COPY.said);
    const note = input.newEvidence.note?.trim();
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(note ? `“${note}”` : NEW_EVIDENCE_COPY.answeredYes);
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(NEW_EVIDENCE_COPY.next);
    doc.moveDown(0.6);
  }

  doc.moveDown(1);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555555')
    .text(
      'This report covers the complete set of documents you provided, as inventoried on your case page. If you have additional volumes or exhibits, a re-run with the new documents may change these results.'
    );
  doc.moveDown(0.6);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#555555')
    .text(`Your case page, this report, and the guide to getting court documents are at ${SITE}. Questions? Reply to any email from us — a person reads it.`);
}
