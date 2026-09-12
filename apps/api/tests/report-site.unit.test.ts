import { describe, it, expect } from 'vitest';
import { renderReportPdf } from '@hg/reports';

/** The family's PDF must name the site on the cover, in every page footer, and
 *  in the closing note (PO, 2026-09-12). Read back through the same PDF text
 *  extractor the pipeline uses — pdfkit encodes page text, so raw byte
 *  searches cannot see it. */
const finding = (severity: string, confidence?: number) => ({
  id: `f_${severity}`,
  category: 'junk_science',
  severity,
  confidence,
  partAText: 'Plain-English explanation for the family.',
  partBText: 'Precise statement for an attorney, with statute cites.',
  citations: [{ volume: 'RR3', page: 214, excerpt: 'The bite mark comparison testimony will be admitted.' }],
});

describe('report PDF names the site', () => {
  it('cover, every page footer, closing note, and metadata', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Site Reference Case', reportId: 'rep_site', versionNo: 1, templateVersion: '2026-08-29.1', renderedAt: new Date(),
      subsequentWritMode: false, strongSignals: [finding('dispositive', 0.91)], possibleIssues: [finding('background'), ...Array.from({ length: 13 }, () => finding('supportive', 0.6))], droppedByReverification: 0,
      bottomLine: { headline: 'There is a real reason to talk to a lawyer.', body: ['This review found 1 issue that could support a claim on its own.', 'This is information about what is in the record, not legal advice.'] },
      summary: [
        { key: 'defendant', label: 'Person', value: 'GARY W. DOE', source: 'record', cite: { volume: 'RR1', page: 3, quote: 'THE STATE OF TEXAS VS. GARY W. DOE' } },
        { key: 'county', label: 'County', value: 'Brazoria County', source: 'family' },
        { key: 'offense', label: 'Offense', value: null, source: null },
      ],
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
    expect(text).toContain('About this case');
    expect(text).toContain('The bottom line');
    expect(text).toContain('There is a real reason to talk to a lawyer.');
    expect(text).toContain('GARY W. DOE (RR1 p. 3)');
    expect(text).toContain('as your family told us');
    expect(text).toContain('not stated in the record');
    expect(buf.toString('latin1')).toContain('snotnoselegal.com'); // metadata Author, literal
    // Per-issue weight line (PO, 2026-09-12) and its legend, once.
    expect(text).toContain('How to read each issue');
    expect(text).toContain('Weight: could stand on its own · How sure we are: high (91%)');
    expect(text).toContain('Weight: supports a larger claim · How sure we are: medium (60%)');
    expect(text).toContain('Weight: background · How sure we are: not rated');
    expect(text).toContain('not a chance of winning');
  });
});
