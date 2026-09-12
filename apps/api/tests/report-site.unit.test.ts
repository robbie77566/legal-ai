import { describe, it, expect } from 'vitest';
import { renderReportPdf } from '@hg/reports';

/** The family's PDF must name the site on the cover, in every page footer, and
 *  in the closing note (PO, 2026-09-12). Read back through the same PDF text
 *  extractor the pipeline uses — pdfkit encodes page text, so raw byte
 *  searches cannot see it. */
const finding = (severity: string) => ({
  id: `f_${severity}`,
  category: 'junk_science',
  severity,
  partAText: 'Plain-English explanation for the family.',
  partBText: 'Precise statement for an attorney, with statute cites.',
  citations: [{ volume: 'RR3', page: 214, excerpt: 'The bite mark comparison testimony will be admitted.' }],
});

describe('report PDF names the site', () => {
  it('cover, every page footer, closing note, and metadata', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Site Reference Case', reportId: 'rep_site', versionNo: 1, templateVersion: '2026-08-29.1', renderedAt: new Date(),
      subsequentWritMode: false, strongSignals: [finding('dispositive')], possibleIssues: Array.from({ length: 14 }, () => finding('supportive')), droppedByReverification: 0,
    });
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const info = await parser.getInfo();
    const text = (await parser.getText()).text;
    const pages = info.total ?? (await parser.getText()).pages?.length ?? 2;
    const mentions = text.split('snotnoselegal.com').length - 1;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(mentions).toBeGreaterThanOrEqual(pages + 2); // one footer per page + cover + closing note
    expect(text).toContain('a service of Snot Nose Legal');
    expect(text).toContain('are at snotnoselegal.com');
    expect(buf.toString('latin1')).toContain('snotnoselegal.com'); // metadata Author, literal
  });
});
