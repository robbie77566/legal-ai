import { describe, it, expect, afterEach } from 'vitest';
import { concurrencyFromEnv } from '../src/lib/concurrency';

describe('worker concurrency from env', () => {
  const KEY = 'TEST_WORKER_CONCURRENCY';
  afterEach(() => { delete process.env[KEY]; });

  it('uses the fallback when unset or blank', () => {
    expect(concurrencyFromEnv(KEY, 2)).toBe(2);
    process.env[KEY] = '  ';
    expect(concurrencyFromEnv(KEY, 2)).toBe(2);
  });

  it('honors a sane integer (a small instance turns it down to 1)', () => {
    process.env[KEY] = '1';
    expect(concurrencyFromEnv(KEY, 2)).toBe(1);
    process.env[KEY] = '4';
    expect(concurrencyFromEnv(KEY, 2)).toBe(4);
  });

  it('ignores nonsense rather than crashing the worker', () => {
    for (const bad of ['0', '-1', '2.5', 'two', '99']) {
      process.env[KEY] = bad;
      expect(concurrencyFromEnv(KEY, 2)).toBe(2);
    }
  });
});
