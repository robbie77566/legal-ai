import prisma from '@hg/database';

/**
 * Promo codes (promo_codes.md). Validation is generic-outward, specific in
 * logs; redemption of the cap is ATOMIC (updateMany guarded on the count —
 * two racers for the last slot cannot both win); free codes additionally
 * enforce once-per-user via the payment ledger.
 */

export const normalizeCode = (raw: string) => raw.trim().toUpperCase();
export const CODE_SHAPE = /^[A-Z0-9-]{3,24}$/;

export interface PromoCheck {
  valid: boolean;
  amountOffCents?: number;
  reason?: string; // internal only — never sent to customers verbatim
}

/**
 * Everything about a code that is true regardless of who is asking: shape,
 * existence, active, not expired, redemption slots left.
 *
 * Split out from `checkPromo` because the buy page offers the code field
 * BEFORE the account step (promo_codes.md §3), and the spec's driving use
 * case — free codes for families who do not have an account yet — could
 * never pass a check that required a userId. A signed-out visitor gets this
 * much; the per-account rule below is applied the moment we know who they
 * are, and again, authoritatively, at checkout.
 */
export async function checkPromoCode(rawCode: string): Promise<PromoCheck> {
  const code = normalizeCode(rawCode);
  if (!CODE_SHAPE.test(code)) return { valid: false, reason: 'shape' };
  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) return { valid: false, reason: 'unknown' };
  if (!promo.active) return { valid: false, reason: 'inactive' };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  if (promo.maxRedemptions != null && promo.redeemedCount >= promo.maxRedemptions)
    return { valid: false, reason: 'limit' };
  return { valid: true, amountOffCents: promo.amountOffCents };
}

/** The code check plus the one rule that needs identity: once per account. */
export async function checkPromo(rawCode: string, userId: string): Promise<PromoCheck> {
  const base = await checkPromoCode(rawCode);
  if (!base.valid) return base;
  const code = normalizeCode(rawCode);
  const priorUse = await prisma.payment.findFirst({ where: { userId, promoCode: code } });
  if (priorUse) return { valid: false, reason: 'already_used_by_user' };
  return base;
}

/** Atomically consume one redemption slot. Returns false when the cap is hit. */
export async function redeemPromo(rawCode: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  const res = await prisma.promoCode.updateMany({
    where: {
      code,
      active: true,
      OR: [{ maxRedemptions: null }, { redeemedCount: { lt: prisma.promoCode.fields.maxRedemptions } }],
    },
    data: { redeemedCount: { increment: 1 } },
  });
  return res.count === 1;
}
