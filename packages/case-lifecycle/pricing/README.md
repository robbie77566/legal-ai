# Pricing (pure logic)

The pricing model of `docs/implementation/persona_rollout_plan.md` §4 as pure
TypeScript: no database, no Stripe, no environment. Every record here is plain
and serialisable so the persistence slice (`PriceBook`, `Credit`,
`AllowanceLedger`, `Invoice`, the `QUOTED` case state) only has to store and
load it. The family path is untouched: `DEFAULT_PRICE_BOOK` carries today's
29900 / 4900 / 9900 and `familyOverage` reproduces the intake overage gate
without being wired in.

| File | Concern |
| --- | --- |
| `buckets.ts` | `classifyRecord` — bucket from reporter's-record pages only (SHORT < 100, STANDARD 100–500, EXTENDED 501–1,500, LONG > 1,500); clerk's and exhibit pages metered, never bucketed. `familyOverage` — $49 per 2,500 pages above 5,000. |
| `price-book.ts` | `PriceBookRow { audience, sku, cents, currency, stripePriceEnv?, effectiveFrom, effectiveTo?, label, purchasable?, terms? }`, `DEFAULT_PRICE_BOOK`, `resolvePrice` (row in effect at `at`; latest `effectiveFrom` wins), `priceForBucket` (LONG → `QUOTE_REQUIRED from 49900` for professionals; FAMILY → flat REVIEW). |
| `credits.ts` | `issuePackCredits` — five credits of one rung at 10% off, expiring +12 months. `consumeCredit` — exact rung first, then the next rung up, soonest-expiring first; expired credits are never spent; the sixth record is `PACK_EXHAUSTED`. |
| `allowances.ts` | `pilotAllowance` (15 records / 90 days), `publicInterestAllowance` (25 / year), `officeAllowance` (50 / 120 / 250 a year), `decrementAllowance` (refuses `NOT_STARTED`, `PERIOD_ENDED`, `EXHAUSTED`), `renewAllowance` (annual plans only). |
| `promotions.ts` | `firstReviewFree` (≤500 pages, verified bar, first ever, under the monthly cap), `partnerCodeDiscount` (15% off the first paid review), `applyPromo` (free first beats partner code). |
| `quote.ts` | `quoteForRecord` — the one decision the api calls at the QUOTED state. |

## Decision table — `quoteForRecord`

Steps run in this order; a refused step falls through and its reason rides on
the final result (`allowanceRefused`, `creditRefused`, `freeFirstRefused`).

| # | Condition | Decision |
| --- | --- | --- |
| 0 | `bucket = LONG` and audience is ATTORNEY / OFFICE / CLINIC | `QUOTE_REQUIRED { from: 49900 }` — before anything else; a FAMILY LONG record continues (flat price, overage rule) |
| 1 | `allowance` given and `decrementAllowance` succeeds | `ALLOWANCE { remaining, ledger }` |
| 2 | `credits` given and a live credit of the rung or higher exists | `CREDIT { creditId, credits }` |
| 3 | no price row for the audience and SKU | `REFUSED { reason: NO_PRICE }` (offices and clinics past their allowance; the next step is a plan, not a card) |
| 4 | ATTORNEY and `firstReviewFree` eligible | `FREE { reason: FIRST_REVIEW_FREE }` |
| 5 | ATTORNEY and partner code on the first paid review | `PAY { cents = rung − 15%, discountCents, promoCode }` |
| 6 | otherwise | `PAY { cents = rung price }` (FAMILY: always the REVIEW row) |

Rung prices (cents): SHORT 14900, STANDARD 24900, EXTENDED 34900, LONG quote
from 49900. Packs: 67050 / 112050 / 157050. Office: 900000 / 1800000 / 3000000
a year. Family: 29900 review, 4900 overage block, 9900 re-run.

Tests: `packages/case-lifecycle/tests/pricing.*.test.ts`
(`corepack pnpm exec vitest run packages/case-lifecycle`).

Persistence (workstream B): `apps/api/src/services/quote.service.ts` loads the stored book (`PriceBookRow`, seeded from `DEFAULT_PRICE_BOOK` by migration `20261019000033_price_book`), the tenant's `Credit` rows and the organisation's `AllowanceEntry` count, calls `quoteForRecord` at the `QUOTED` case state and persists only what it decided; routes are `/counsel/matters/:caseId/quote*`, `/counsel/packs`, `/counsel/credits`, `/counsel/allowance` (staff_console.md §11).
