import { describe, it, expect } from 'vitest';
import { ledgerDir, listLedgers, loadLedger } from '../src/services/eval-gate.service';
import { scoreRun } from '../src/services/eval.service';

/** The eval gate from the ops console (2026-09-27): the committed attorney
 *  ledgers are found from wherever the api runs, and scored by the same
 *  scorer scripts/eval-run.ts uses. */
describe('eval gate — ledgers', () => {
  it('finds the repo ledger directory from the api package', () => {
    expect(ledgerDir()).toMatch(/docs[\\/]evaluation[\\/]ledgers$/);
  });

  it('lists the committed ledgers with their canary counts', () => {
    const names = listLedgers().map((l) => l.name);
    expect(names).toContain('gary');
    expect(names).toContain('brian');
    const gary = listLedgers().find((l) => l.name === 'gary')!;
    expect(gary.caseTitle).toBe('San Jacinto CR13893');
    expect(gary.mustFind).toBeGreaterThanOrEqual(5);
  });

  it('refuses names that could walk the filesystem', () => {
    expect(loadLedger('../render')).toBeNull();
    expect(loadLedger('gary.json')).toBeNull();
    expect(loadLedger('')).toBeNull();
    expect(loadLedger('nope')).toBeNull();
  });

  it('the Gary ledger scores a run the way the CLI does: every canary or red', () => {
    const ledger = loadLedger('gary')!;
    const found = ledger.mustFind.map((m, i) => ({
      id: `f_${i}`, category: m.allOf[0], severity: 'dispositive', confidence: 0.9,
      partAText: '', partBText: [...m.allOf, ...(m.anyOf ?? [])].join(' '), pages: m.pageWindow ? [m.pageWindow.min] : [],
      preserved: 'yes',
    }));
    const green = scoreRun(ledger, found);
    expect(green.missed).toEqual([]);
    expect(green.recall).toBe(1);
    const red = scoreRun(ledger, found.slice(1));
    expect(red.missed).toHaveLength(1);
    expect(red.recall).toBeLessThan(1);
  });
});
