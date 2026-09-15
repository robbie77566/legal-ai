import { describe, it, expect } from 'vitest';
import { findSamePassage, isStrongerFinding, normalizeQuote, groundUnion } from '../src/services/analysis.service';

/**
 * Every screen sweeps the WHOLE record, so two screens routinely ground the
 * same passage — a seated biased juror is both an `iac` failure and a
 * `voir_dire` finding. groundUnion collapses duplicates within one screen's
 * samples, but findings were persisted per screen, so those cross-screen twins
 * both reached the family: the same issue, written twice under different
 * labels. These cover the decisions the per-run union makes.
 */
describe('recognising the same passage across screens', () => {
  const kept = [{ quote: normalizeQuote('Juror 14 stated she is the complainant’s cousin'), screen: 'voir_dire' }];

  it('matches an identical quote', () => {
    expect(findSamePassage(kept, 'Juror 14 stated she is the complainant’s cousin')?.screen).toBe('voir_dire');
  });

  it('matches regardless of whitespace and case — screens re-wrap what they quote', () => {
    expect(findSamePassage(kept, '  JUROR 14   stated she is the COMPLAINANT’S cousin  ')).toBeDefined();
  });

  it('matches when one screen quotes a longer span around the same moment', () => {
    expect(findSamePassage(kept, 'The record shows Juror 14 stated she is the complainant’s cousin, and was seated.')).toBeDefined();
  });

  it('matches when one screen quotes a shorter span inside it', () => {
    expect(findSamePassage(kept, 'she is the complainant’s cousin')).toBeDefined();
  });

  it('does not merge a genuinely different passage in the same chunk', () => {
    expect(findSamePassage(kept, 'Counsel made no objection to the outburst')).toBeUndefined();
  });

  it('has nothing to match against on the first screen', () => {
    expect(findSamePassage([], 'anything at all')).toBeUndefined();
  });
});

describe('which copy of a passage wins the row', () => {
  it('prefers the more serious severity, whatever the confidence', () => {
    expect(isStrongerFinding({ severity: 'dispositive', confidence: 0.4 }, { severity: 'supportive', confidence: 0.9 })).toBe(true);
    expect(isStrongerFinding({ severity: 'background', confidence: 0.99 }, { severity: 'supportive', confidence: 0.1 })).toBe(false);
  });

  it('breaks a severity tie on confidence', () => {
    expect(isStrongerFinding({ severity: 'supportive', confidence: 0.8 }, { severity: 'supportive', confidence: 0.5 })).toBe(true);
    expect(isStrongerFinding({ severity: 'supportive', confidence: 0.5 }, { severity: 'supportive', confidence: 0.8 })).toBe(false);
  });

  it('keeps the incumbent on an exact tie, so screen order cannot churn the row', () => {
    expect(isStrongerFinding({ severity: 'supportive', confidence: 0.7 }, { severity: 'supportive', confidence: 0.7 })).toBe(false);
  });
});

describe('within-screen union still behaves', () => {
  const chunks = [{ id: 'ch1', documentId: 'd1', content: 'Juror 14 stated she is the complainant’s cousin and was seated.', metadata: {} }];
  const mk = (over: Record<string, unknown>) => ({
    category: 'juror bias', severity: 'supportive', confidence: 0.6, chunkIndex: 0,
    quote: 'Juror 14 stated she is the complainant’s cousin',
    partA: 'a', partB: 'b', ...over,
  }) as never;

  it('collapses the same passage from two samples and upgrades to the stronger copy', () => {
    const r = groundUnion([[mk({})], [mk({ severity: 'dispositive', confidence: 0.9 })]], chunks as never);
    expect(r.grounded).toHaveLength(1);
    expect(r.grounded[0].severity).toBe('dispositive');
  });

  it('drops a quote that is not in the record — grounding is a hard filter', () => {
    const r = groundUnion([[mk({ quote: 'a sentence that never appears in the transcript' })]], chunks as never);
    expect(r.grounded).toHaveLength(0);
    expect(r.dropped).toBe(1);
  });
});
