# Promo Codes — Design, JTBD, and Engineering Spec

**Prepared:** 2026-09-01 · **Status:** implemented with this document · **Driving use case:** free early-adopter codes so real families test with new cases before launch.

## 1. UX research — how modern products do promo entry (and the traps)

Patterns from high-converting checkout research (Baymard-style findings, common across Stripe-era SaaS/e-commerce):

1. **Collapsed by default.** An open "Promo code" box makes buyers *without* a code feel overcharged and sends them off-site hunting for codes (measured abandonment driver). The standard: a quiet text link — *"Have a promo code?"* — that expands to an input.
2. **Validate before payment, server-side, instantly.** The user must see the discount applied to the total *before* any payment step; errors are generic ("That code isn't valid") — never revealing whether a code exists, is expired, or is used up (prevents enumeration and awkwardness).
3. **Applied state is explicit and reversible**: a chip showing `EARLYBIRD — $299 off`, new total, and a remove ×.
4. **Free (100%) skips payment entirely.** Asking for a card on a $0 total is the single worst free-trial pattern; the button becomes *"Start your review — free with your code."* (This also sidesteps Stripe's payment-mode minimum-charge constraints — see §4.)
5. **Codes are case-insensitive**, trimmed, and short enough to type on a phone.

## 2. Jobs to be done (PM pass)

| Persona | Job | Served by |
|---|---|---|
| **Family buyer (paying)** | "If I have a code, apply it confidently and see exactly what I'll pay before I pay it." | Collapsed field on the buy page → instant validation → new total → discounted Stripe Checkout |
| **Early adopter (free code)** | "Redeem the code and get the real product with zero payment friction." | Free path: ack → code → case created directly, straight to the interview — no card, no Stripe |
| **Founder/admin** | "Mint codes with a chosen text and discount; cap and expire them so a leaked code can't burn unbounded COGS (a free case still costs ~$5–10 to produce); kill a code instantly; see uptake." | `/ops/promos`: create (code, amount off, max redemptions, expiry), deactivate toggle, redemption counts |
| **Finance/audit** | "The ledger tells the truth: what was actually paid, and which code discounted it." | `Payment.amountCents` = actual; `Payment.promoCode` recorded; free path writes a $0 SUCCEEDED payment with a `promo_…` id |
| **Support (future)** | "Tell a customer why their code failed." | Admin list shows active/expired/limit state; validation reasons in logs, generic to users |
| **Abuse prevention** | "One shared free code must not become infinite free cases." | Atomic redemption cap; per-user-per-code single redemption; instant deactivate |

**PM review outcomes folded in:** scope v1 to the `$299 review` purchase only (overage/re-run excluded — different jobs, tiny amounts); no percentage codes in v1 (amount-off only — matches the founder's mental model "how much off the 299" and avoids rounding disputes); analytics event `snl.promo_applied` so uptake is measurable per code.

## 3. Flow (UX plan, post-review)

**Buy page (existing ack step):** price summary shows `$299` → *"Have a promo code?"* link → input + Apply → on success: chip `CODE — $X off`, total updates (`$0` renders as **Free**), CTA text adapts. Code travels in the checkout request.

**Paid-with-discount:** Stripe Checkout opens with the discounted amount as the line price (metadata carries the code for the ledger); webhook fulfillment records `promoCode` and redeems atomically.

**Free:** no Stripe. The server validates + atomically redeems, then feeds a synthetic `$0` session through the **same `fulfillCheckoutSession`** the webhook uses — identical case creation, draft promotion, ack binding, idempotency — and the browser goes straight to the interview.

**Admin (`/ops/promos`, Industrial Authority styling):** table (code · off · redeemed/max · expires · active) + create form + activate/deactivate. ADMIN-gated by the existing `/ops` guard.

## 4. Engineering interrogation (holes found before code)

1. **Stripe-native promotion codes rejected deliberately**: payment-mode Checkout doesn't cleanly support 100%-off (minimum-charge constraints), and *free* is the driving use case. Own table + discounted line price + synthetic-session free path handles both uniformly. Trade-off accepted: codes don't appear in Stripe's coupon reporting; our ledger is authoritative.
2. **Race on the redemption cap**: two simultaneous redemptions of the last slot → atomic `updateMany WHERE redeemedCount < maxRedemptions` increment; 0 rows updated = limit reached, code rejected.
3. **Per-user re-redemption**: a user re-using the same free code → checked against existing `Payment` rows for (user, promoCode).
4. **Free path must not skip the safety rails**: it runs *after* the disclosure-ack gate in the same flow order, binds the eligibility draft, and refuses staff roles — because it reuses the fulfillment function where those live.
5. **Validation leakage**: one generic failure message; details only in server logs and the admin list.
6. **Normalization**: codes stored and compared uppercase/trimmed; creation rejects non `[A-Z0-9-]` and duplicates.
7. **Refund surface**: free purchases have nothing to refund (OPS refund honestly 503s on them — no Stripe id); discounted purchases refund their actual charged amount via the existing Stripe path.
8. **COGS honesty**: free cases still spend real Textract/Claude dollars — the cap defaults are deliberately small and the admin page shows redemption counts next to that reality.

## 5. Data model

`PromoCode { id, code UNIQUE, amountOffCents (1..29900), maxRedemptions?, redeemedCount, expiresAt?, active, createdBy, createdAt }` — global (not tenant-scoped; codes are the operator's), no RLS needed but owner-written only. `Payment.promoCode String?` records attribution.

## 6. Test plan (implemented)

Service: valid/unknown/inactive/expired/over-limit codes; atomic cap under parallel redemption; per-user repeat rejection. Integration: free-path checkout creates the case + $0 SUCCEEDED payment + redemption increment + straight-to-interview response; discounted session carries reduced `unit_amount` + metadata; ops CRUD + role gate. Web: promo field expand/apply/error/applied-chip states.
