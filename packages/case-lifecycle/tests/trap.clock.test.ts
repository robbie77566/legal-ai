/**
 * Workstream E (January slice) — the TRAP clock. E1–E3 of the brief.
 *
 * Every date below is a literal: the engine must reproduce it from the
 * rule text, not the other way round. Weekday checks were made against a
 * calendar when the test was written (2026-03-10 is a Tuesday).
 */
import { describe, it, expect } from 'vitest';
import { computeTrapClock, rollForward, isLegalHoliday, HOLIDAY_TABLE_COVERAGE } from '../trap';

const step = (clock: ReturnType<typeof computeTrapClock>, id: string) => {
  const s = clock.steps.find((x) => x.id === id);
  if (!s) throw new Error(`step ${id} not emitted; got ${clock.steps.map((x) => x.id).join(', ')}`);
  return s;
};

describe('E1 — direct-appeal chain from a sentencing date', () => {
  it('26.2(a)(1): notice of appeal 30 days after sentence, no motion for new trial', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-03-10', today: '2026-03-11' });
    const noa = step(c, 'noa');
    expect(noa.rule).toBe('TRAP 26.2');
    expect(noa.due).toBe('2026-04-09');
    expect(noa.jurisdictional).toBe(true);
    expect(c.steps.find((s) => s.id === 'noa_mnt')).toBeUndefined();
  });

  it('26.2(a)(2): 90 days when a timely motion for new trial was filed', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      motionForNewTrialFiledAt: '2026-03-20',
      today: '2026-03-21',
    });
    expect(step(c, 'noa_mnt').due).toBe('2026-06-08');
    expect(c.steps.find((s) => s.id === 'noa')).toBeUndefined();
    // the motion itself was timely under 21.4 (30 days)
    const mnt = step(c, 'mnt');
    expect(mnt.status).toBe('done');
    expect(mnt.late).toBe(false);
  });

  it('a late motion for new trial does not open the 90-day window', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      motionForNewTrialFiledAt: '2026-04-15', // after 21.4's 30 days
      today: '2026-04-16',
    });
    expect(step(c, 'mnt').late).toBe(true);
    expect(step(c, 'noa').due).toBe('2026-04-09');
    expect(c.steps.find((s) => s.id === 'noa_mnt')).toBeUndefined();
  });

  it('26.3: the 15-day extension window runs from the notice-of-appeal deadline', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-03-10', today: '2026-04-10' });
    const ext = step(c, 'noa_ext');
    expect(ext.rule).toBe('TRAP 26.3');
    expect(ext.due).toBe('2026-04-24');
    expect(ext.jurisdictional).toBe(true);
  });

  it('35.2: record due 60 days after sentence (Saturday rolls to Monday), 120 with a timely motion for new trial', () => {
    const plain = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-03-10', today: '2026-03-11' });
    const rec = step(plain, 'record');
    expect(rec.rule).toBe('TRAP 35.2');
    expect(rec.rawDue).toBe('2026-05-09'); // Saturday
    expect(rec.due).toBe('2026-05-11');
    expect(rec.rolled).toBe(true);
    expect(rec.jurisdictional).toBe(false);

    const mnt = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      motionForNewTrialFiledAt: '2026-03-20',
      today: '2026-03-21',
    });
    expect(step(mnt, 'record_mnt').due).toBe('2026-07-08');
  });

  it('38.6(a): brief due 30 days after the record is filed, with the 38.6(d) extension mechanism', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-03-25',
      recordFiledAt: '2026-05-11',
      today: '2026-05-12',
    });
    const brief = step(c, 'brief');
    expect(brief.rule).toBe('TRAP 38.6');
    expect(brief.due).toBe('2026-06-10');
    expect(brief.jurisdictional).toBe(false);
    expect(brief.extension?.rule).toBe('TRAP 38.6(d)');
    expect(brief.basis).toContain('2026-05-11');
  });

  it('49.1 and 68.2 from a court-of-appeals judgment date', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-03-25',
      recordFiledAt: '2026-05-11',
      briefFiledAt: '2026-06-01',
      coaJudgmentAt: '2026-11-03',
      today: '2026-11-04',
    });
    expect(step(c, 'rehearing').rule).toBe('TRAP 49.1');
    expect(step(c, 'rehearing').due).toBe('2026-11-18');
    expect(step(c, 'rehearing').jurisdictional).toBe(false);
    expect(step(c, 'pdr').rule).toBe('TRAP 68.2');
    expect(step(c, 'pdr').due).toBe('2026-12-03');
    expect(step(c, 'pdr').extension?.days).toBe(15);
  });

  it('68.2: PDR runs from the overruling of a timely motion for rehearing when one was filed', () => {
    const c = computeTrapClock({
      vehicle: 'pdr_clock',
      coaJudgmentAt: '2026-11-03',
      rehearingFiledAt: '2026-11-10',
      rehearingDeniedAt: '2026-12-01',
      today: '2026-12-02',
    });
    const pdr = step(c, 'pdr_after_rehearing');
    expect(pdr.rule).toBe('TRAP 68.2');
    expect(pdr.due).toBe('2026-12-31');
    expect(c.steps.find((s) => s.id === 'pdr')).toBeUndefined();
  });

  it('68.2(c): the 15-day PDR extension window runs from the PDR deadline once it is missed', () => {
    const c = computeTrapClock({ vehicle: 'pdr_clock', coaJudgmentAt: '2026-11-03', today: '2026-12-04' });
    expect(step(c, 'pdr_ext').due).toBe('2026-12-18');
  });

  it('11.07 chain: State answer, §3(c) designation window, 180-day resolution and 181st-day transmittal', () => {
    const c = computeTrapClock({ vehicle: '11.07', applicationReceivedByStateAt: '2026-02-02', today: '2026-02-03' });
    expect(step(c, 'state_answer').due).toBe('2026-02-17');
    expect(step(c, 'designation').due).toBe('2026-03-09');
    expect(step(c, 'resolution_180').rawDue).toBe('2026-08-01'); // Saturday
    expect(step(c, 'resolution_180').due).toBe('2026-08-03');
    expect(step(c, 'transmittal_181').rawDue).toBe('2026-08-02'); // Sunday
    expect(step(c, 'transmittal_181').due).toBe('2026-08-03');
    expect(c.steps.every((s) => !s.jurisdictional)).toBe(true);
  });

  it('steps come out in chain order and the clock is stamped as-of', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-03-25',
      recordFiledAt: '2026-05-11',
      today: '2026-05-12',
    });
    const ids = c.steps.map((s) => s.id);
    expect(ids.indexOf('noa')).toBeLessThan(ids.indexOf('record'));
    expect(ids.indexOf('record')).toBeLessThan(ids.indexOf('brief'));
    expect(ids.indexOf('brief')).toBeLessThan(ids.indexOf('pdr'));
    expect(c.asOf).toBe('2026-05-12');
    expect(c.disclaimerKey).toBe('deadline.verify_with_attorney');
  });
});

describe('E2 — TRAP 4.1 roll-forward', () => {
  it('a Saturday rolls to Monday', () => {
    expect(rollForward('2026-05-09')).toEqual({ date: '2026-05-11', rolled: true, reason: 'Saturday' });
  });
  it('25 December 2026 (a Friday, a legal holiday) rolls to Monday 28 December', () => {
    expect(isLegalHoliday('2026-12-25')).toBe(true);
    expect(rollForward('2026-12-25').date).toBe('2026-12-28');
    const c = computeTrapClock({ vehicle: 'pdr_clock', coaJudgmentAt: '2026-11-25', today: '2026-11-26' });
    expect(step(c, 'pdr').rawDue).toBe('2026-12-25');
    expect(step(c, 'pdr').due).toBe('2026-12-28');
  });
  it('a plain weekday does not move', () => {
    expect(rollForward('2026-04-09')).toEqual({ date: '2026-04-09', rolled: false });
  });
  it('the holiday table covers 2026–2027 and says so', () => {
    expect(HOLIDAY_TABLE_COVERAGE).toEqual({ from: '2026-01-01', to: '2027-12-31' });
    expect(isLegalHoliday('2027-01-01')).toBe(true);
    expect(isLegalHoliday('2026-03-02')).toBe(true); // Texas Independence Day
    expect(isLegalHoliday('2026-04-09')).toBe(false);
  });
  it('a due date outside the table still rolls weekends and carries a warning', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2028-03-10', today: '2028-03-11' });
    expect(step(c, 'noa').due).toBe('2028-04-10'); // 2028-04-09 is a Sunday
    expect(c.notes.some((n) => /holiday table/.test(n))).toBe(true);
  });
});

describe('E3 — status', () => {
  it('a step with a filing date is done; a jurisdictional step past due with no filing is missed', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-03-10', today: '2026-06-01' });
    expect(step(c, 'noa').status).toBe('missed');
    expect(step(c, 'noa_ext').status).toBe('missed');
    expect(c.missedJurisdictional).toBe(true);
  });

  it('a non-jurisdictional miss does not set missedJurisdictional; an unreached trigger is not_yet', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-04-01',
      today: '2026-06-01',
    });
    expect(step(c, 'noa').status).toBe('done');
    expect(step(c, 'noa').filedAt).toBe('2026-04-01');
    expect(c.steps.find((s) => s.id === 'noa_ext')).toBeUndefined(); // filed on time: no extension step
    expect(step(c, 'record').status).toBe('missed');
    expect(step(c, 'brief').status).toBe('not_yet');
    expect(step(c, 'pdr').status).toBe('not_yet');
    expect(c.missedJurisdictional).toBe(false);
  });

  it('open steps carry nextDue, the earliest open due date', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-04-01',
      today: '2026-04-20',
    });
    expect(step(c, 'record').status).toBe('open');
    expect(c.nextDue).toEqual({ id: 'record', rule: 'TRAP 35.2', due: '2026-05-11', daysLeft: 21 });
  });

  it('a notice filed late but inside the 26.3 window is done-late and the extension step is done', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-04-20',
      today: '2026-05-01',
    });
    expect(step(c, 'noa').status).toBe('done');
    expect(step(c, 'noa').late).toBe(true);
    expect(step(c, 'noa_ext').status).toBe('done');
    expect(c.missedJurisdictional).toBe(false);
  });

  it('a notice filed after the 26.3 window is a jurisdictional miss even though it was filed', () => {
    const c = computeTrapClock({
      vehicle: 'direct_appeal',
      sentenceImposedAt: '2026-03-10',
      noticeOfAppealFiledAt: '2026-05-05',
      today: '2026-05-06',
    });
    expect(step(c, 'noa').late).toBe(true);
    expect(step(c, 'noa_ext').status).toBe('missed');
    expect(c.missedJurisdictional).toBe(true);
  });

  it('every emitted step carries its vector confidence (all proposed today)', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', sentenceImposedAt: '2026-03-10', today: '2026-03-11' });
    expect(c.steps.length).toBeGreaterThan(0);
    expect(c.steps.every((s) => s.confidence === 'proposed')).toBe(true);
    expect(c.unsignedCount).toBe(c.steps.length);
  });

  it('refused and unmodelled vehicles return no steps and say why', () => {
    expect(computeTrapClock({ vehicle: '11.071', today: '2026-03-11' }).steps).toEqual([]);
    expect(computeTrapClock({ vehicle: '11.071', today: '2026-03-11' }).notes.join(' ')).toMatch(/refused/i);
    expect(computeTrapClock({ vehicle: '2254', today: '2026-03-11' }).notes.join(' ')).toMatch(/exhaustionMap/);
  });

  it('judgmentSignedAt stands in when the sentencing date is not recorded', () => {
    const c = computeTrapClock({ vehicle: 'direct_appeal', judgmentSignedAt: '2026-03-10', today: '2026-03-11' });
    expect(step(c, 'noa').due).toBe('2026-04-09');
    expect(step(c, 'noa').basis).toMatch(/judgment signed/i);
  });
});
