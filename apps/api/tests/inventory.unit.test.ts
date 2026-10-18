/**
 * D1 — the conservative filename heuristic (persona_rollout_plan.md §5 D,
 * January slice). A suggestion the family confirms, never a silent label:
 * an explicit reporter / clerk / exhibit word (or "vol") names the kind and
 * a "3 of 7" / "vol 3" gives the position; anything else is UNKNOWN —
 * listed and counted, never dropped. Pure function, no database.
 */
import { describe, it, expect } from 'vitest';
import { suggestVolume, volumeLabel, missingVolumes } from '../src/services/inventory.service';

describe('D1 suggestVolume(filename) — the uploader confirms, the name only suggests', () => {
  const table: Array<[string, { kind: string; index: number | null; count: number | null; label: string | null }]> = [
    ['RR Vol 3 of 7.pdf', { kind: 'REPORTER', index: 3, count: 7, label: 'RR vol. 3 of 7' }],
    ['RR_Vol_3_of_7.PDF', { kind: 'REPORTER', index: 3, count: 7, label: 'RR vol. 3 of 7' }],
    ["Reporter's Record Volume 12.pdf", { kind: 'REPORTER', index: 12, count: null, label: 'RR vol. 12' }],
    ['Reporters Record.pdf', { kind: 'REPORTER', index: null, count: null, label: "Reporter's record" }],
    ['Vol. 2 of 4.pdf', { kind: 'REPORTER', index: 2, count: 4, label: 'RR vol. 2 of 4' }],
    ['Volume 5.pdf', { kind: 'REPORTER', index: 5, count: null, label: 'RR vol. 5' }],
    ['Trial transcript vol 1.pdf', { kind: 'REPORTER', index: 1, count: null, label: 'RR vol. 1' }],
    ["Clerk's Record.pdf", { kind: 'CLERK', index: null, count: null, label: "Clerk's record" }],
    ['Clerks Record Vol 2 of 3.pdf', { kind: 'CLERK', index: 2, count: 3, label: 'CR vol. 2 of 3' }],
    ['CR vol 1.pdf', { kind: 'CLERK', index: 1, count: null, label: 'CR vol. 1' }],
    ['CR.pdf', { kind: 'CLERK', index: null, count: null, label: "Clerk's record" }],
    ["State's Exhibit 12.pdf", { kind: 'EXHIBIT', index: null, count: null, label: 'Exhibits' }],
    ['Defense Ex. 4.pdf', { kind: 'EXHIBIT', index: null, count: null, label: 'Exhibits' }],
    ['Exhibits vol 7 of 7.pdf', { kind: 'EXHIBIT', index: 7, count: 7, label: 'Exhibits vol. 7 of 7' }],
    // An exhibit volume of the reporter's record is metered as exhibits (plan §4).
    ['RR Vol 7 of 7 - Exhibits.pdf', { kind: 'EXHIBIT', index: 7, count: 7, label: 'Exhibits vol. 7 of 7' }],
    ['scan0001.pdf', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    ['IMG_4821.HEIC', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    ['judgment.pdf', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    // A bare "1 of 3" without a kind is a split scan, not a volume.
    ['scan 1 of 3.pdf', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    // A cause number is not the clerk's record: "CR" followed by a long number.
    ['CR-2019-1234 judgment.pdf', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    // "v" alone never names a kind; "ex" inside another word is not an exhibit.
    ['exhibition flyer v2.pdf', { kind: 'UNKNOWN', index: null, count: null, label: null }],
    ['', { kind: 'UNKNOWN', index: null, count: null, label: null }],
  ];
  for (const [filename, expected] of table) {
    it(`${JSON.stringify(filename)} → ${expected.kind}${expected.index ? ` ${expected.index}${expected.count ? `/${expected.count}` : ''}` : ''}`, () => {
      expect(suggestVolume(filename)).toEqual(expected);
    });
  }

  it('a count smaller than the index is nonsense — the index stays, the count goes', () => {
    expect(suggestVolume('RR vol 7 of 3.pdf')).toEqual({ kind: 'REPORTER', index: 7, count: null, label: 'RR vol. 7' });
  });
});

describe('volumeLabel', () => {
  it('names each kind in the record desk shorthand; UNKNOWN has no label', () => {
    expect(volumeLabel('REPORTER', 3, 7)).toBe('RR vol. 3 of 7');
    expect(volumeLabel('REPORTER', 3, null)).toBe('RR vol. 3');
    expect(volumeLabel('CLERK', null, null)).toBe("Clerk's record");
    expect(volumeLabel('EXHIBIT', 2, 2)).toBe('Exhibits vol. 2 of 2');
    expect(volumeLabel('UNKNOWN', 1, 2)).toBeNull();
  });
});

describe('D3 missingVolumes — gaps in the index/count sequence per kind', () => {
  const doc = (kind: string, index: number | null, count: number | null) => ({ kind, index, count });
  it('RR vols 1, 2, 4 of 4 → vol 3 is missing', () => {
    expect(missingVolumes([doc('REPORTER', 1, 4), doc('REPORTER', 2, 4), doc('REPORTER', 4, 4)])).toEqual([
      { kind: 'REPORTER', index: 3, count: 4, label: 'RR vol. 3 of 4' },
    ]);
  });
  it('without a declared count the highest index present sets the range', () => {
    expect(missingVolumes([doc('CLERK', 1, null), doc('CLERK', 3, null)])).toEqual([
      { kind: 'CLERK', index: 2, count: null, label: 'CR vol. 2' },
    ]);
  });
  it('one volume of seven lists the six that have not arrived', () => {
    expect(missingVolumes([doc('REPORTER', 1, 7)]).map((m) => m.index)).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it('unindexed and UNKNOWN files never produce a gap', () => {
    expect(missingVolumes([doc('REPORTER', null, null), doc('UNKNOWN', 2, 5), doc('EXHIBIT', null, 3)])).toEqual([]);
  });
});
