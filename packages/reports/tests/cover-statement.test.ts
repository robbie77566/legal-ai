/**
 * UPL review 2026-10-23, recommendation 1 (U1-c, E8/P7): both PDFs carry
 * the one statement with the statutory words on the cover at body size, the
 * "AI-generated content" label on the cover, and a per-page footer of at
 * least 8 pt that carries the statutory words on every page.
 */
import { describe, it, expect } from 'vitest';
import { computeTrapClock, trapInputsForMatter, NOT_A_LAW_FIRM, STATUTORY_WORDS, AI_GENERATED_LABEL } from '@hg/case-lifecycle';
import { renderReportPdf, renderCounselPacketPdf, type CounselPacketInput } from '../index';
import { FOOTER_FONT_SIZE, FAMILY_FOOTER } from '../pdf-helpers';
import { pdfText, pdfPageCount } from './pdf-text';

const finding = (severity: string) => ({
  id: `f_${severity}`,
  category: 'junk_science',
  screen: 'junk_science',
  severity,
  partAText: 'Plain-English explanation for the family.',
  partBText: 'Precise statement for an attorney. '.repeat(20),
  citations: [{ volume: 'RR3', page: 214, line: null, excerpt: 'The bite mark comparison testimony will be admitted.' }],
});

const packet = (): CounselPacketInput => ({
  matter: { vehicle: 'direct_appeal', county: 'Harris', court: '176th District Court', causeNumber: '1234567', clientInitials: 'GW', priorWrits: 0, subsequentWrit: false, lane: 'TRIAL' },
  organisationName: 'A public defender office',
  reportId: 'rep_1',
  versionNo: 1,
  reportTemplateVersion: 'AB-v2',
  renderedAt: new Date('2026-10-19T15:00:00Z'),
  findings: [finding('dispositive'), finding('supportive')],
  droppedFindings: [],
  inventory: {
    volumes: [{ kind: 'REPORTER', pages: 612, ocrConfidence: 0.97, docs: [{ label: 'RR vol. 1', filename: 'rr1.pdf', pages: 612, digitised: true, ocrConfidence: 0.97 }] }],
    missing: [],
    unknownCount: 0,
    meteredPages: { reporter: 612, clerk: 0, exhibit: 0, unknown: 0, total: 612 },
    bucket: 'EXTENDED',
    bucketNote: null,
  },
  trapClock: computeTrapClock(trapInputsForMatter({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-09-01', judgmentSignedAt: '2026-09-03', noticeOfAppealFiledAt: '2026-09-20' }, '2026-10-19')),
  compress: false,
});

/** pdfkit wraps the statement across TJ lines; compare on collapsed whitespace. */
const flat = (buf: Buffer) => pdfText(buf).replace(/\s+/g, ' ');

describe('U1-c — the statement and the AI label on both PDF covers', () => {
  it('the family report: statement in both languages and the AI label before the case title; the statutory words in every page footer', async () => {
    const buf = await renderReportPdf({
      caseTitle: 'Statement Case', reportId: 'rep_s', versionNo: 1, templateVersion: 'AB-v2', renderedAt: new Date(), subsequentWritMode: false,
      strongSignals: [finding('dispositive')], possibleIssues: Array.from({ length: 12 }, () => finding('supportive')), droppedByReverification: 0, compress: false,
    });
    const text = flat(buf);
    expect(text).toContain(NOT_A_LAW_FIRM.en);
    expect(text).toContain(NOT_A_LAW_FIRM.es);
    expect(text).toContain(AI_GENERATED_LABEL.en);
    expect(text.indexOf(AI_GENERATED_LABEL.en)).toBeLessThan(text.indexOf('Statement Case'));
    // The footer is on every page: the statutory words appear at least once per page plus the cover.
    const pages = pdfPageCount(buf);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(text.split(STATUTORY_WORDS.en).length - 1).toBeGreaterThanOrEqual(pages + 1);
    expect(FAMILY_FOOTER).toContain(STATUTORY_WORDS.en);
  });

  it('the counsel packet: statement and AI label on the cover, the statutory words with the work-product footer on every page', async () => {
    const buf = await renderCounselPacketPdf(packet());
    const text = flat(buf);
    expect(text).toContain(NOT_A_LAW_FIRM.en);
    expect(text).toContain(AI_GENERATED_LABEL.en);
    expect(text.indexOf(AI_GENERATED_LABEL.en)).toBeLessThan(text.indexOf('Counsel packet'));
    const pages = pdfPageCount(buf);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(text.split('ATTORNEY WORK PRODUCT').length - 1).toBe(pages);
    expect(text.split(STATUTORY_WORDS.en).length - 1).toBeGreaterThanOrEqual(pages + 1);
  });

  it('the per-page footer is set at least 8 pt (was 6.5)', async () => {
    expect(FOOTER_FONT_SIZE).toBeGreaterThanOrEqual(8);
    const buf = await renderReportPdf({
      caseTitle: 'Font Case', reportId: 'rep_f', versionNo: 1, templateVersion: 'AB-v2', renderedAt: new Date(), subsequentWritMode: false,
      strongSignals: [], possibleIssues: [], droppedByReverification: 0, compress: false,
    });
    // pdfkit writes the size as "/F1 8.5 Tf"; 6.5 must be gone from the stream.
    const raw = buf.toString('latin1');
    expect(raw).toMatch(new RegExp(`/F\\d+ ${FOOTER_FONT_SIZE} Tf`));
    expect(raw).not.toMatch(/\/F\d+ 6\.5 Tf/);
  });
});
