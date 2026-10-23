import { describe, it, expect } from 'vitest';
import { renderReportPdf, type ReportPdfInput } from '../index';
import { DEADLINE_COPY, type DeadlinePostureView } from '../family-report';
import { pdfText as rawPdfText } from './pdf-text';

/** PDFKit wraps long lines; compare on whitespace-normalised text. */
const pdfText = (buf: Buffer) => rawPdfText(buf).replace(/\s+/g, ' ');

/**
 * UPL review 2026-10-23 (E5): the family PDF's "Time limits" section keeps
 * the arithmetic and drops the verdicts. It prints the dates given and what
 * was counted from them, the rule, and the verify sentence first at body
 * size — never "CLOSED", never a bold day count, never "acting promptly".
 */
const base: ReportPdfInput = {
  caseTitle: 'State v. Test',
  reportId: 'rep_dl',
  versionNo: 1,
  templateVersion: 'AB-v2',
  renderedAt: new Date('2026-10-23T00:00:00Z'),
  subsequentWritMode: false,
  strongSignals: [],
  possibleIssues: [],
  droppedByReverification: 0,
  compress: false,
};

const posture = (over: Partial<DeadlinePostureView> = {}): DeadlinePostureView => ({
  finalityDate: '2019-05-01',
  finalityBasis: 'Judgment + 30-day notice-of-appeal window (TRAP 26.2(a)(1)).',
  aedpa: { daysElapsed: 2700, daysTolled: 40, daysRemaining: 0, expired: true, estimatedExpiryDate: null, tollingNow: false },
  lachesUrgency: true,
  asOf: '2026-10-23',
  ...over,
});

const FORBIDDEN = [/\bCLOSED\b/, /acting promptly/i, /claims left out/i, /appears? to remain/i, /exceptions exist/i, /would be dismissed/i];

describe('family PDF — Time limits as description (E5)', () => {
  it('closed window: prints the ended-on date by our count, the basis, and the laches rule; the verify sentence comes first', async () => {
    const text = pdfText(await renderReportPdf({ ...base, deadlinePosture: posture() }));
    expect(text).toContain('Time limits (as of 2026-10-23)');
    expect(text).toContain('By our count from the dates you gave, the one-year federal window ended on 2020-06-09.');
    // The em dash is a WinAnsi glyph the helper does not decode; assert around it.
    expect(text).toContain('The count starts when the conviction became final (2019-05-01');
    expect(text).toContain('Judgment + 30-day notice-of-appeal window (TRAP 26.2(a)(1)).); about 2700 countable days have passed. 40 of the days since then were paused during state filings.');
    expect(text).toContain(DEADLINE_COPY.pauseRule);
    expect(text).toContain('Texas courts may consider delay (the rule is called laches); a lawyer can tell you whether it applies.');
    expect(text.indexOf(DEADLINE_COPY.verify)).toBeGreaterThan(text.indexOf('Time limits (as of'));
    expect(text.indexOf(DEADLINE_COPY.verify)).toBeLessThan(text.indexOf('one-year federal window ended on'));
    for (const re of FORBIDDEN) expect(text).not.toMatch(re);
  });

  it('open window: "is open until about DATE"; paused: "is paused while the state court decides"', async () => {
    const open = pdfText(await renderReportPdf({ ...base, deadlinePosture: posture({ aedpa: { daysElapsed: 100, daysTolled: 0, daysRemaining: 265, expired: false, estimatedExpiryDate: '2027-07-15', tollingNow: false }, lachesUrgency: false }) }));
    expect(open).toContain('By our count from the dates you gave, the one-year federal window is open until about 2027-07-15.');
    expect(open).not.toContain('laches');
    expect(open).not.toMatch(/265 days/);
    const paused = pdfText(await renderReportPdf({ ...base, deadlinePosture: posture({ aedpa: { daysElapsed: 100, daysTolled: 30, daysRemaining: 265, expired: false, estimatedExpiryDate: null, tollingNow: true }, lachesUrgency: false }) }));
    expect(paused).toContain('By our count, the one-year federal window is paused while the state court decides.');
    for (const re of FORBIDDEN) { expect(open).not.toMatch(re); expect(paused).not.toMatch(re); }
  });

  it('the subsequent-writ paragraph states the rule and the same next step', async () => {
    const text = pdfText(await renderReportPdf({ ...base, subsequentWritMode: true }));
    expect(text).toContain('A writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4. A licensed Texas attorney is the person to take this to.');
    expect(text).not.toMatch(/strictly limits|before any filing|subsequent-writ bar/);
  });

  it('every deadline string is a description: no verdict, no instruction, no prediction', () => {
    const all = Object.values(DEADLINE_COPY).join(' ');
    for (const re of [...FORBIDDEN, /you should/i, /we recommend/i, /worth/i, /would likely/i]) expect(all).not.toMatch(re);
  });
});
