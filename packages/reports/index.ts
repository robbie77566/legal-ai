import PDFDocument from 'pdfkit';

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
 */

export interface ReportFinding {
  id: string;
  category: string;
  severity: string;
  partAText: string;
  partBText: string;
  citations: { volume: string | null; page: number | null; excerpt: string }[];
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

/** Brand palettes (color_research_landing.md §3) — semantic colors stay fixed. */
const PALETTES = {
  amber: { accent: '#7a5f15', ink: '#1f2937' },
  harbor: { accent: '#1f5c99', ink: '#1a2433' },
} as const;
export type ReportPalette = keyof typeof PALETTES;

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
  /** Matches the customer's assigned web scheme; default amber. */
  palette?: ReportPalette;
}

const FOOTER =
  'This is an information report about the contents of a court record. It is not legal advice, ' +
  'does not create an attorney-client relationship, and is not protected by attorney-client privilege. ' +
  'Decisions about any filing should be made with a licensed attorney.';

const MARGIN = 54;

function severityLabel(s: string): string {
  return s === 'dispositive' ? 'Strong signal' : s === 'supportive' ? 'Possible issue' : 'Background';
}

export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN + 28, left: MARGIN, right: MARGIN },
      info: {
        Title: `Family Case Review — ${input.caseTitle}`,
        Author: 'Family Case Review, a service of Snot Nose Legal',
        Subject: `Report ${input.reportId} v${input.versionNo} (template ${input.templateVersion})`,
      },
    });
    const pal = PALETTES[input.palette ?? 'amber'];
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Footer discipline: save/restore covers graphics state but NOT the
    // text cursor — writing at the page bottom moves doc.y past the edge,
    // and if that happens while a text wrap is in flight, pdfkit adds a
    // page, which fires pageAdded, which writes a footer… (live 500 on the
    // first 73-finding report). Restore the cursor and guard re-entrancy.
    let inFooter = false;
    const footer = () => {
      if (inFooter) return;
      inFooter = true;
      const { x, y } = doc;
      doc.save();
      doc.fontSize(6.5).fillColor('#666666').font('Helvetica');
      doc.text(FOOTER, MARGIN, doc.page.height - MARGIN - 14, {
        width: doc.page.width - MARGIN * 2,
        height: 24,
        lineBreak: false,
        ellipsis: true,
      });
      doc.restore();
      doc.x = x;
      doc.y = y;
      inFooter = false;
    };
    footer();
    doc.on('pageAdded', footer);

    // ---- Cover header ----
    doc.font('Helvetica-Bold').fontSize(20).fillColor(pal.accent).text('Family Case Review');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('a service of Snot Nose Legal');
    doc.moveDown(0.8);
    doc.fontSize(12).fillColor(pal.ink).text(input.caseTitle);
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(
        `Report ${input.reportId} · version ${input.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · template ${input.templateVersion}`
      );
    doc.moveDown(1);

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
    if (input.subsequentWritMode) {
      doc.moveDown(0.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#8a4b00')
        .text(
          'Important: our records indicate a prior application may have been filed. Texas strictly limits second applications — discuss the subsequent-writ bar with an attorney before any filing.'
        );
    }
    doc.moveDown(1);

    // FR-5: elapsed/remaining prominent, dates stamped "as of", the
    // tolling direction stated correctly, laches urgency for old cases.
    if (input.deadlinePosture) {
      const d = input.deadlinePosture;
      doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('Time limits (as of ' + d.asOf + ')');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).fillColor('#222222');
      if (d.aedpa.expired) {
        doc
          .font('Helvetica-Bold')
          .fillColor('#8a1c1c')
          .text(
            `Based on the dates provided, the one-year federal habeas window appears to have CLOSED (about ${d.aedpa.daysElapsed} countable days have passed since the conviction became final on ${d.finalityDate}). An attorney should verify — exceptions exist, and state filings remain possible.`
          );
      } else if (d.aedpa.tollingNow) {
        doc.text(
          `The one-year federal habeas clock is currently PAUSED because a state application is pending. About ${d.aedpa.daysElapsed} countable days have already been used; roughly ${d.aedpa.daysRemaining} days will remain when the state court rules. Important: a state filing pauses this clock only while it is pending — it does not restart it.`
        );
      } else {
        doc
          .font('Helvetica-Bold')
          .text(
            `About ${d.aedpa.daysRemaining} days appear to remain in the one-year federal habeas window (estimated end: ${d.aedpa.estimatedExpiryDate ?? 'n/a'}).`
          );
        doc
          .font('Helvetica')
          .text(
            `The clock started when the conviction became final (${d.finalityDate} — ${d.finalityBasis}); about ${d.aedpa.daysElapsed} countable days have been used${d.aedpa.daysTolled > 0 ? `, and ${d.aedpa.daysTolled} days were paused during state filings` : ''}. A properly filed state application pauses this clock while it is pending — but only while it is pending.`
          );
      }
      if (d.lachesUrgency) {
        doc.moveDown(0.3);
        doc
          .fontSize(9.5)
          .fillColor('#8a4b00')
          .text(
            'This conviction is old. Texas state habeas has no fixed deadline, but courts can refuse applications that waited too long (laches) — acting promptly matters even where no clock is shown.'
          );
      }
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor('#555555')
        .text(
          'These time estimates are computed from the dates your family provided and standard rules; they are not legal advice. An attorney must verify every date and deadline before relying on them.'
        );
      doc.moveDown(1);
    }

    const renderFinding = (f: ReportFinding, idx: number) => {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(pal.ink).text(`${idx}. ${severityLabel(f.severity)} — ${f.category.replace(/_/g, ' ')}`);
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text('For your family (plain English)');
      doc.font('Helvetica').fontSize(10).fillColor('#222222').text(f.partAText);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444').text('For an attorney');
      doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(f.partBText);
      for (const c of f.citations) {
        doc.moveDown(0.2);
        const where = [c.volume, c.page != null ? `p. ${c.page}` : null].filter(Boolean).join(' ');
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555').text(`Record${where ? ` (${where})` : ''}: “${c.excerpt}”`, { indent: 12 });
      }
      doc.moveDown(0.8);
    };

    let n = 1;
    if (input.strongSignals.length > 0) {
      doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('Strong signals');
      doc.moveDown(0.4);
      for (const f of input.strongSignals) renderFinding(f, n++);
    }
    if (input.possibleIssues.length > 0) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(pal.ink).text('Possible issues and background');
      doc.moveDown(0.4);
      for (const f of input.possibleIssues) renderFinding(f, n++);
    }
    if (input.strongSignals.length + input.possibleIssues.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(
          'Our review did not surface findings meeting our reporting threshold. This does not mean no issue exists — it means this screening, on these documents, did not find one. An attorney reviewing the full record may see more.'
        );
    }

    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555555')
      .text(
        'This report covers the complete set of documents you provided, as inventoried on your case page. If you have additional volumes or exhibits, a re-run with the new documents may change these results.'
      );

    doc.end();
  });
}
