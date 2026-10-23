import { describe, it, expect } from 'vitest';
import { computeTrapClock, trapInputsForMatter } from '@hg/case-lifecycle';
import { renderReportPdf, renderCounselPacketPdf, type CounselPacketInput, type ReportPdfInput } from '../index';
import { pdfText as rawPdfText } from './pdf-text';

/** PDFKit wraps long lines; compare on whitespace-normalised text. */
const pdfText = (buf: Buffer) => rawPdfText(buf).replace(/\s+/g, ' ');

/**
 * K3 — the new-evidence section of the family PDF (PRD FR-10;
 * mvp_ui_design_spec §5.7 "New-evidence flag (FR-10) renders as its own
 * card"). Rendered only when the case facts say the family told us about
 * evidence that was never presented; the family's note is printed verbatim,
 * never paraphrased. The counsel packet's Part A letter inherits the section
 * through the shared body renderer.
 */

const finding = {
  id: 'f_1',
  category: 'brady',
  severity: 'supportive',
  partAText: 'Plain-English explanation for the family.',
  partBText: 'Precise statement for an attorney.',
  citations: [{ volume: 'RR3', page: 214, excerpt: 'The exhibit was not disclosed.' }],
};

const base: ReportPdfInput = {
  caseTitle: 'State v. Test',
  reportId: 'rep_ne',
  versionNo: 1,
  templateVersion: '2026-08-29.1',
  renderedAt: new Date('2026-10-19T00:00:00Z'),
  subsequentWritMode: false,
  strongSignals: [],
  possibleIssues: [finding],
  droppedByReverification: 0,
  bottomLine: { headline: 'Talk to a lawyer.', body: ['Not legal advice.'] },
  compress: false,
};

const NOTE = 'My cousin Ana saw him at work that night and was never called to testify.';

describe('family PDF — new-evidence section (FR-10, K3)', () => {
  it('renders the section with the spec copy and the family note verbatim when told is true', async () => {
    const text = pdfText(await renderReportPdf({ ...base, newEvidence: { told: true, note: NOTE } }));
    expect(text).toContain('Evidence that was never presented');
    expect(text).toContain('You told us about evidence that was never presented');
    expect(text).toContain('evaluate it, but your attorney must know about it');
    expect(text).toContain('What you told us');
    expect(text).toContain(NOTE);
    // placed after the findings and before the closing note
    const section = text.indexOf('Evidence that was never presented');
    expect(section).toBeGreaterThan(text.indexOf('Plain-English explanation for the family.'));
    expect(section).toBeLessThan(text.indexOf('This report covers the complete set of documents'));
  });

  it('without a note, prints the answer the family gave — never an inference', async () => {
    const text = pdfText(await renderReportPdf({ ...base, newEvidence: { told: true } }));
    expect(text).toContain('Evidence that was never presented');
    expect(text).toContain('you answered yes');
    expect(text).not.toContain(NOTE);
  });

  it('is absent when the facts say nothing or the family said no', async () => {
    for (const newEvidence of [undefined, null]) {
      const text = pdfText(await renderReportPdf({ ...base, newEvidence }));
      expect(text).not.toContain('Evidence that was never presented');
      expect(text).not.toContain('You told us about evidence');
    }
  });

  it('the counsel packet never carries the section: the Part A letter is withheld (UPL review 2026-10-23, question 8) even when its input is supplied', async () => {
    const packet: CounselPacketInput = {
      matter: { vehicle: 'direct_appeal', county: 'Harris', court: '176th District Court', causeNumber: '1234567', clientInitials: 'GW', priorWrits: 0, subsequentWrit: false, lane: 'TRIAL' },
      organisationName: 'Test Law',
      reportId: 'rep_ne',
      versionNo: 1,
      reportTemplateVersion: 'AB-v2',
      renderedAt: new Date('2026-10-19T00:00:00Z'),
      findings: [{ ...finding, screen: 'brady', confidence: 0.6, citations: [{ volume: 'RR3', page: 214, line: null, excerpt: 'The exhibit was not disclosed.' }] }],
      droppedFindings: [],
      inventory: { volumes: [], missing: [], unknownCount: 0, meteredPages: { reporter: 0, clerk: 0, exhibit: 0, unknown: 0, total: 0 }, bucket: 'SHORT', bucketNote: null },
      trapClock: computeTrapClock(trapInputsForMatter({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-09-01', judgmentSignedAt: '2026-09-03', noticeOfAppealFiledAt: '2026-09-20' }, '2026-10-19')),
      compress: false,
    };
    const letter = { ...base, newEvidence: { told: true as const, note: NOTE } };
    // The section lives in the family letter only, and the letter is withheld from the packet.
    const withLetterInput = pdfText(await renderCounselPacketPdf({ ...packet, clientLetter: letter }));
    expect(withLetterInput).not.toContain('Evidence that was never presented');
    expect(withLetterInput).not.toContain(NOTE);
    const withoutLetter = pdfText(await renderCounselPacketPdf(packet));
    expect(withoutLetter).not.toContain(NOTE);
  });
});
