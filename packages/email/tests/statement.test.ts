/**
 * UPL review 2026-10-23, recommendations 1 and 2: every email ends with the
 * full statement (both languages, the statutory words), no email holds a
 * "trained legal reviewer" out, and the automatic-approval path sends its
 * own email that says the report passed the automated gates and was not
 * held for staff review.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NOT_A_LAW_FIRM, QUALITY_CHECKED } from '@hg/case-lifecycle';
import {
  __setEmailProviderForTests,
  sendReceipt,
  sendRecordsComplete,
  sendNeedsYou,
  sendDelayOurs,
  sendRefundIssued,
  sendReportReady,
  sendReportReadyAutoChecked,
  sendReportUpdated,
  sendQualityHold,
  sendFeedbackFollowup,
  sendCheckBackLater,
  sendPendingAppealReminder,
  sendRerunPurchased,
  type EmailMessage,
} from '../index';

let sent: EmailMessage[];
beforeEach(() => {
  sent = [];
  __setEmailProviderForTests({ async send(m) { sent.push(m); return { delivered: true, id: 'x' }; } });
});
afterEach(() => __setEmailProviderForTests(undefined));

const to = 'family@example.com';
const everyFamilyEmail = async () => {
  await sendReceipt(to, { amountCents: 29900, caseUrl: 'https://x/case/1' });
  await sendRecordsComplete(to, { expectedReadyBy: 'October 30', statusUrl: 'https://x/case/1/status' });
  await sendNeedsYou(to, { documentsUrl: 'https://x/case/1/documents' });
  await sendDelayOurs(to, { newDate: 'November 2', statusUrl: 'https://x/case/1/status' });
  await sendRefundIssued(to, { amountCents: 29900, partial: false, caseUrl: 'https://x/case/1' });
  await sendReportReady(to, { caseUrl: 'https://x/case/1/report' });
  await sendReportReadyAutoChecked(to, { caseUrl: 'https://x/case/1/report' });
  await sendReportUpdated(to, { caseUrl: 'https://x/case/1/report', versionNo: 2, notes: ['A note.'] });
  await sendQualityHold(to, { caseUrl: 'https://x/case/1/status' });
  await sendFeedbackFollowup(to, { surveyUrl: 'https://x/case/1/report?survey=report' });
  await sendCheckBackLater(to, { checkUrl: 'https://x/check', months: 3 });
  await sendPendingAppealReminder(to, { checkUrl: 'https://x/check' });
  await sendRerunPurchased(to, { documentsUrl: 'https://x/case/1/documents' });
};

describe('the statement in every email footer', () => {
  it('every family email ends with the full statement in English and Spanish', async () => {
    await everyFamilyEmail();
    expect(sent.length).toBe(13);
    for (const m of sent) {
      expect(m.text, m.subject).toContain(NOT_A_LAW_FIRM.en);
      expect(m.text, m.subject).toContain(NOT_A_LAW_FIRM.es);
      expect(m.text, m.subject).toContain('not a substitute for the advice of an attorney');
    }
  });

  it('no email holds anyone out as a legal reviewer or an attorney, or decides timing for the family', async () => {
    await everyFamilyEmail();
    for (const m of sent) {
      expect(`${m.subject}\n${m.text}`, m.subject).not.toMatch(/legal reviewer|trained reviewer|licensed Texas attorney|specialist|would be dismissed/i);
    }
  });
});

describe('how the report is checked, said once', () => {
  it('records-complete, report-ready and the hold email use the one sentence', async () => {
    await sendRecordsComplete(to, {});
    await sendReportReady(to, { caseUrl: 'https://x/case/1/report' });
    await sendQualityHold(to, { caseUrl: 'https://x/case/1/status' });
    for (const m of sent) expect(m.text, m.subject).toContain(QUALITY_CHECKED.en);
  });

  it('the auto-approved report gets a distinct email: passed the automated gates, not held for staff review', async () => {
    await sendReportReadyAutoChecked(to, { caseUrl: 'https://x/case/1/report' });
    await sendReportReady(to, { caseUrl: 'https://x/case/1/report' });
    const [auto, manual] = sent;
    expect(auto.text).toMatch(/passed our automated quality gates/);
    expect(auto.text).toMatch(/was not held for staff review/);
    expect(auto.text).toContain('https://x/case/1/report');
    expect(manual.text).not.toMatch(/was not held for staff review/);
    expect(auto.text).not.toBe(manual.text);
  });
});
