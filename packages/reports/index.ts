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

export interface ReportPdfInput {
  caseTitle: string;
  reportId: string;
  versionNo: number;
  templateVersion: string;
  renderedAt: Date | string;
  subsequentWritMode: boolean;
  strongSignals: ReportFinding[];
  possibleIssues: ReportFinding[];
  droppedByReverification: number;
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
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const footer = () => {
      const y = doc.page.height - MARGIN - 14;
      doc.save();
      doc.fontSize(6.5).fillColor('#666666').font('Helvetica');
      doc.text(FOOTER, MARGIN, y, { width: doc.page.width - MARGIN * 2, lineBreak: false, ellipsis: true });
      doc.restore();
    };
    footer();
    doc.on('pageAdded', footer);

    // ---- Cover header ----
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text('Family Case Review');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('a service of Snot Nose Legal');
    doc.moveDown(0.8);
    doc.fontSize(12).fillColor('#111111').text(input.caseTitle);
    doc
      .fontSize(9)
      .fillColor('#555555')
      .text(
        `Report ${input.reportId} · version ${input.versionNo} · rendered ${new Date(input.renderedAt).toDateString()} · template ${input.templateVersion}`
      );
    doc.moveDown(1);

    // ---- TL;DR ----
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('What we found');
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

    const renderFinding = (f: ReportFinding, idx: number) => {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(`${idx}. ${severityLabel(f.severity)} — ${f.category.replace(/_/g, ' ')}`);
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
      doc.font('Helvetica-Bold').fontSize(13).text('Strong signals');
      doc.moveDown(0.4);
      for (const f of input.strongSignals) renderFinding(f, n++);
    }
    if (input.possibleIssues.length > 0) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('Possible issues and background');
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
