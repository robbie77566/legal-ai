import { describe, it, expect } from 'vitest';
import { lintAdvice, lintFinding } from '../src/services/advice-lint';

/**
 * UPL review 2026-10-23, recommendation 11 (U3-c): the literal phrases hit
 * for family text, descriptive sentences pass, and the counsel audience
 * keeps its Strickland and preservation vocabulary.
 */
const phrases = (text: string, audience: 'family' | 'counsel' = 'family') => lintAdvice(text, { audience }).hits.map((h) => h.phrase.toLowerCase());

describe('lintAdvice — family audience (Part A)', () => {
  it('flags every literal phrase of the recommendation', () => {
    const cases: Array<[string, string]> = [
      ['The court should have excluded it.', 'should'],
      ['You must file within a year.', 'must file'],
      ['The next step is to file a writ.', 'file a'],
      ['It looks like you qualify for relief.', 'you qualify'],
      ['You are eligible for a second look.', 'you are eligible'],
      ['This is a viable claim.', 'viable'],
      ['This claim is winnable.', 'winnable'],
      ['The issue is meritorious.', 'meritorious'],
      ['You have 90 days left on the federal clock.', 'you have 90 days'],
      ['Your deadline passed last spring.', 'your deadline'],
      ['A lawyer will win this on appeal.', 'will win'],
      ['Without the exhibit you will lose.', 'will lose'],
      ['The State cannot win on this record.', 'cannot win'],
      ['The transcript shows grounds for relief.', 'grounds for relief'],
      ['You should contact a lawyer this week.', 'you should contact'],
    ];
    for (const [text, expected] of cases) {
      const r = lintAdvice(text, { audience: 'family' });
      expect(r.ok, text).toBe(false);
      expect(phrases(text), text).toContain(expected);
    }
  });

  it('reports the character offset of each hit', () => {
    const text = 'The record shows an objection. You should contact a lawyer.';
    const r = lintAdvice(text, { audience: 'family' });
    expect(r.hits).toEqual([{ phrase: 'You should contact', index: text.indexOf('You should') }]);
  });

  it('flags second-person imperatives at the start of a sentence', () => {
    for (const text of ['File a writ before the window closes.', 'The hearing was short. Contact a lawyer now.', 'Do not wait on this.', 'Hire counsel who handles writs.']) {
      expect(lintAdvice(text, { audience: 'family' }).ok, text).toBe(false);
    }
  });

  it('lets descriptive sentences through', () => {
    const descriptive = [
      'The record shows bite-mark comparison testimony was admitted over an objection at page 214.',
      'The judgment lists a $10,000 fine alongside a life sentence.',
      'The jury heard from the analyst who did not perform the test.',
      'Counsel did not object when the extraneous offense came in.',
      'The State disclosed the lab notes after trial, according to the hearing transcript.',
      'A lawyer can tell you what this means for the case.',
      'Appeal was taken in 2020 and the court of appeals affirmed.',
      'Use of a surrogate analyst is described at page 88.',
    ];
    for (const text of descriptive) {
      const r = lintAdvice(text, { audience: 'family' });
      expect(r, text).toEqual({ ok: true, hits: [] });
    }
  });

  it('is case-insensitive and does not double-report overlapping phrases', () => {
    const r = lintAdvice('YOU SHOULD CONTACT a lawyer.', { audience: 'family' });
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].phrase).toBe('YOU SHOULD CONTACT');
  });
});

describe('lintAdvice — counsel audience (Part B)', () => {
  it('allows Strickland, preservation and harm-standard language', () => {
    const counsel = [
      'Deficient performance: counsel should have objected under Rule 403; prejudice turns on the weight the State put on the testimony in closing.',
      'Preserved under TRAP 33.1 — specific objection, ruling on the record at RR3 p. 214. Harm standard: 44.2(a), constitutional.',
      'Unpreserved; reachable only through counsel\'s performance. The vehicle is Art. 11.07; a direct-appeal point on this record would be background.',
      'A reasonable attorney would have moved to suppress; the record offers no strategic reason for the omission.',
    ];
    for (const text of counsel) expect(lintAdvice(text, { audience: 'counsel' }), text).toEqual({ ok: true, hits: [] });
  });

  it('flags advice aimed past the lawyer and outcome predictions', () => {
    expect(phrases('The defendant should file an 11.07 application at once.', 'counsel')).toContain('the defendant should');
    expect(phrases('You should raise this on direct appeal.', 'counsel')).toContain('you should');
    expect(phrases('This claim will prevail under Chapman.', 'counsel')).toContain('will prevail');
    expect(phrases('A motion on this ground will be granted.', 'counsel')).toContain('will be granted');
  });
});

describe('lintFinding — what the Finding row stores', () => {
  it('null when both parts are clean; adviceLintHit only for a Part A hit', () => {
    expect(lintFinding('The record shows an objection.', 'Preserved under TRAP 33.1.')).toBeNull();
    const a = lintFinding('You should file a writ.', 'Preserved under TRAP 33.1.');
    expect(a?.adviceLintHit).toBe(true);
    expect(a?.partA.map((h) => h.phrase)).toEqual(['should', 'file a']);
    expect(a?.partB).toEqual([]);
    const b = lintFinding('The record shows an objection.', 'The defendant should file now.');
    expect(b?.adviceLintHit).toBe(false);
    expect(b?.partB.map((h) => h.phrase)).toEqual(['The defendant should']);
  });
});
