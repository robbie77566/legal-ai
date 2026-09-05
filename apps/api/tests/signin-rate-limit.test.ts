import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@hg/auth';

/**
 * Sign-in lockout (auth-options.ts): five attempts per email per 15 min.
 * The sixth returns the whole minutes left on the lock (never 0), which
 * authorize() throws as "RateLimit:<n>" so the form can say how long.
 */
describe('sign-in rate limit', () => {
  it('allows five attempts, then reports minutes remaining (1..15)', () => {
    const email = `lock_${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) expect(checkRateLimit(email)).toBe(0);
    const wait = checkRateLimit(email);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(15);
    // Still locked on the next try, and the count never lets it through.
    expect(checkRateLimit(email)).toBeGreaterThanOrEqual(1);
  });

  it('is keyed per email — another address is unaffected', () => {
    const a = `a_${Date.now()}@example.com`;
    const b = `b_${Date.now()}@example.com`;
    for (let i = 0; i < 6; i++) checkRateLimit(a);
    expect(checkRateLimit(a)).toBeGreaterThanOrEqual(1);
    expect(checkRateLimit(b)).toBe(0);
  });
});
