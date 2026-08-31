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

  it('renders a many-page report without footer recursion (73-finding regression)', async () => {
    const many = Array.from({ length: 73 }, (_, i) => ({
      ...finding(i < 3 ? 'dispositive' : 'supportive'),
      id: `f_${i}`,
      partBText: 'A long attorney statement. '.repeat(30),
    }));
    const buf = await renderReportPdf({
      caseTitle: 'Big Case', reportId: 'rep_big', versionNo: 1,
      templateVersion: '2026-08-29.1', renderedAt: new Date(), subsequentWritMode: false,
      strongSignals: many.slice(0, 3), possibleIssues: many.slice(3), droppedByReverification: 0,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(20000);
  });

  it('renders in the harbor palette (themed document, semantic colors fixed)', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Harbor Case', reportId: 'rep_h', versionNo: 1,
      templateVersion: '2026-08-29.1', renderedAt: new Date(), subsequentWritMode: false,
      palette: 'harbor',
      strongSignals: [finding('dispositive')], possibleIssues: [], droppedByReverification: 0,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
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
