import { describe, it, expect } from 'vitest';
import { renderReportPdf } from '../index';

const finding = (severity: string) => ({
  id: `f_${severity}`,
  category: 'junk_science',
  severity,
  partAText: 'Plain-English explanation for the family.',
  partBText: 'Precise statement for an attorney, with statute cites.',
  citations: [{ volume: 'RR3', page: 214, excerpt: 'The bite mark comparison testimony will be admitted.' }],
});

describe('renderReportPdf', () => {
  it('renders a well-formed PDF with findings', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Test Case',
      reportId: 'rep_1',
      versionNo: 1,
      templateVersion: '2026-08-29.1',
      renderedAt: new Date(),
      subsequentWritMode: true,
      strongSignals: [finding('dispositive')],
      possibleIssues: [finding('supportive'), finding('background')],
      droppedByReverification: 1,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.toString('latin1')).toContain('%%EOF');
  });

  it('renders the neutral nothing-found report', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Empty Case',
      reportId: 'rep_2',
      versionNo: 1,
      templateVersion: '2026-08-29.1',
      renderedAt: new Date(),
      subsequentWritMode: false,
      strongSignals: [],
      possibleIssues: [],
      droppedByReverification: 0,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
