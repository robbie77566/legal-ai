import { describe, it, expect } from 'vitest';
import { isSameVisit, VISIT_GAP_MS } from '../src/services/visits.service';

const t0 = new Date('2026-09-15T12:00:00Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);

describe('visit boundaries', () => {
  it('a beat inside the gap continues the visit', () => {
    expect(isSameVisit(t0, plus(0))).toBe(true);
    expect(isSameVisit(t0, plus(60_000))).toBe(true);
    expect(isSameVisit(t0, plus(VISIT_GAP_MS - 1))).toBe(true);
  });
  it('a gap of exactly the limit, or more, starts a new visit', () => {
    expect(isSameVisit(t0, plus(VISIT_GAP_MS))).toBe(false);
    expect(isSameVisit(t0, plus(VISIT_GAP_MS * 10))).toBe(false);
  });
  it('a beat that arrives out of order (clock skew) does not open a phantom visit', () => {
    expect(isSameVisit(t0, plus(-5_000))).toBe(true);
  });
  it('the gap is thirty minutes', () => {
    expect(VISIT_GAP_MS).toBe(30 * 60 * 1000);
  });
});
