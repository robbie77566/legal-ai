/** Eval scorer — deterministic, no DB, no model (CI-safe launch gate). */
import { describe, it, expect } from 'vitest';
import { scoreRun, type EvalLedger, type ScorableFinding } from '../src/services/eval.service';

const finding = (over: Partial<ScorableFinding>): ScorableFinding => ({
  id: 'cmfinding000000000willet',
  category: 'iac',
  severity: 'supportive',
  confidence: 0.6,
  partAText: 'plain english',
  partBText: 'Venire No. 5 Willetts: spouse is Harper’s corporal; seated and polled.',
  pages: [30, 140],
  ...over,
});

const ledger = (over: Partial<EvalLedger>): EvalLedger => ({
  case: 'test',
  caseTitle: 'Test',
  provenance: 'test',
  mustFind: [{ id: 'willetts', note: 'seated juror', allOf: ['willetts'], minSeverity: 'supportive' }],
  verdicts: [],
  ...over,
});

describe('scoreRun', () => {
  it('finds a must-find via term match and reports full recall', () => {
    const card = scoreRun(ledger({}), [finding({})]);
    expect(card.recall).toBe(1);
    expect(card.found[0].id).toBe('willetts');
    expect(card.precision).toBeNull();
  });

  it('misses when terms are absent, severity is too low, or page window excludes', () => {
    expect(scoreRun(ledger({}), [finding({ partBText: 'nothing relevant' })]).recall).toBe(0);
    expect(scoreRun(ledger({}), [finding({ severity: 'background' })]).recall).toBe(0);
    const pw = ledger({ mustFind: [{ id: 'w', note: '', allOf: ['willetts'], pageWindow: { min: 200, max: 210 } }] });
    expect(scoreRun(pw, [finding({})]).recall).toBe(0);
  });

  it('anyOf requires at least one alternative term', () => {
    const l = ledger({ mustFind: [{ id: 'w', note: '', allOf: ['willetts'], anyOf: ['corporal', 'sergeant'] }] });
    expect(scoreRun(l, [finding({})]).recall).toBe(1);
    expect(scoreRun(l, [finding({ partBText: 'Willetts mentioned alone' })]).recall).toBe(0);
  });

  it('computes precision and severity agreement from attorney verdicts', () => {
    const l = ledger({
      verdicts: [
        { findingRef: 'aaaaaa', verdict: 'agree' },
        { findingRef: 'bbbbbb', verdict: 'partly', severityOverride: 'background' },
        { findingRef: 'cccccc', verdict: 'disagree' },
      ],
    });
    const card = scoreRun(l, [finding({})]);
    expect(card.precision).toBeCloseTo(2 / 3);
    expect(card.severityAgreement).toBeCloseTo(1 / 2);
    expect(card.verdictCounts).toEqual({ agree: 1, partly: 1, disagree: 1 });
  });

  it('empty mustFind scores recall 1 (verdict-only ledgers stay green)', () => {
    expect(scoreRun(ledger({ mustFind: [] }), []).recall).toBe(1);
  });
});

describe('estimateModelUsd (costs.service)', () => {
  it('applies env rates with cache multipliers', async () => {
    process.env.MODEL_USD_PER_MTOK_IN = '10';
    process.env.MODEL_USD_PER_MTOK_OUT = '40';
    process.env.MODEL_CACHE_READ_MULT = '0.1';
    process.env.MODEL_CACHE_WRITE_MULT = '1.25';
    const { estimateModelUsd } = await import('../src/services/costs.service');
    const usd = estimateModelUsd({
      tokensIn: 1_000_000, tokensOut: 500_000,
      cacheReadTokens: 2_000_000, cacheWriteTokens: 1_000_000,
    });
    // 10 + 20 + 2*10*0.1 + 1*10*1.25 = 10 + 20 + 2 + 12.5
    expect(usd).toBeCloseTo(44.5);
    delete process.env.MODEL_USD_PER_MTOK_IN;
    delete process.env.MODEL_USD_PER_MTOK_OUT;
    delete process.env.MODEL_CACHE_READ_MULT;
    delete process.env.MODEL_CACHE_WRITE_MULT;
  });
});

describe('readability lint', () => {
  it('scores simple text under the 8th-grade target and dense legalese over it', async () => {
    const { lintPartA } = await import('../src/services/readability');
    const simple = lintPartA('The judge said no. The lawyer did not ask again. That may matter for your case.');
    expect(simple.overTarget).toBe(false);
    const dense = lintPartA(
      'Notwithstanding the aforementioned constitutional determination, the multiplicitous prosecutorial characterization contravened jurisprudential requirements necessitating individualized rehabilitative examination.'
    );
    expect(dense.grade).toBeGreaterThan(8);
    expect(dense.overTarget).toBe(true);
  });
});
