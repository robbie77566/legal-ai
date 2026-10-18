/**
 * B6 (persona_rollout_plan.md §5 B): the price book the migration seeded
 * equals DEFAULT_PRICE_BOOK row for row — audience, sku, cents, effectiveFrom,
 * and the terms the decisions read. Live Postgres; nothing is written.
 */
import { describe, it, expect, afterAll } from 'vitest';
import prisma from '@hg/database';
import { DEFAULT_PRICE_BOOK } from '@hg/case-lifecycle';
import { loadPriceBook, stripePriceIdFor } from '../src/services/quote.service';

afterAll(async () => {
  await prisma.$disconnect();
});

const key = (r: { audience: string; sku: string; effectiveFrom: string | Date }) =>
  `${r.audience}:${r.sku}:${new Date(r.effectiveFrom).toISOString()}`;

describe('B6 — seeded price book equals DEFAULT_PRICE_BOOK', () => {
  it('one stored row per default row, same audience / sku / cents / effectiveFrom / label / purchasable / terms', async () => {
    const stored = await prisma.priceBookRow.findMany();
    const expected = DEFAULT_PRICE_BOOK.rows;
    expect(stored.length).toBe(expected.length);
    const byKey = new Map(stored.map((r) => [key(r), r]));
    for (const row of expected) {
      const s = byKey.get(key(row));
      expect(s, `missing ${key(row)}`).toBeTruthy();
      expect(s).toMatchObject({
        audience: row.audience,
        sku: row.sku,
        cents: row.cents,
        currency: 'usd',
        label: row.label,
        purchasable: row.purchasable ?? true,
        effectiveTo: null,
      });
      expect(s!.effectiveFrom.toISOString()).toBe(new Date(row.effectiveFrom).toISOString());
      expect(s!.terms).toEqual(row.terms ?? null);
      // Stripe ids are env-driven (STRIPE_PRICE_*), never seeded.
      expect(s!.stripePriceId).toBeNull();
    }
  });

  it('loadPriceBook reproduces the pure book: same decisions as the defaults, price ids from the env only', async () => {
    const book = await loadPriceBook();
    const pure = book.rows.map(({ stripePriceEnv: _e, ...r }) => r);
    const defaults = DEFAULT_PRICE_BOOK.rows.map(({ stripePriceEnv: _e, ...r }) => ({ ...r, purchasable: r.purchasable ?? true, effectiveFrom: new Date(r.effectiveFrom).toISOString() }));
    const sort = (a: { audience: string; sku: string }, b: { audience: string; sku: string }) => `${a.audience}:${a.sku}`.localeCompare(`${b.audience}:${b.sku}`);
    expect([...pure].sort(sort)).toEqual([...defaults].sort(sort));
    const short = book.rows.find((r) => r.audience === 'ATTORNEY' && r.sku === 'COUNSEL_SHORT')!;
    expect(short.stripePriceEnv).toBe('STRIPE_PRICE_COUNSEL_SHORT');
    const prev = process.env.STRIPE_PRICE_COUNSEL_SHORT;
    delete process.env.STRIPE_PRICE_COUNSEL_SHORT;
    expect(stripePriceIdFor(book, short)).toBeNull(); // unset → price_data fallback
    process.env.STRIPE_PRICE_COUNSEL_SHORT = 'price_test_short';
    expect(stripePriceIdFor(book, short)).toBe('price_test_short');
    if (prev === undefined) delete process.env.STRIPE_PRICE_COUNSEL_SHORT; else process.env.STRIPE_PRICE_COUNSEL_SHORT = prev;
  });
});
