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

export async function checkPromo(rawCode: string, userId: string): Promise<PromoCheck> {
  const code = normalizeCode(rawCode);
  if (!CODE_SHAPE.test(code)) return { valid: false, reason: 'shape' };
  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo) return { valid: false, reason: 'unknown' };
  if (!promo.active) return { valid: false, reason: 'inactive' };
  if (promo.expiresAt && promo.expiresAt < new Date()) return { valid: false, reason: 'expired' };
  if (promo.maxRedemptions != null && promo.redeemedCount >= promo.maxRedemptions)
    return { valid: false, reason: 'limit' };
  const priorUse = await prisma.payment.findFirst({ where: { userId, promoCode: code } });
  if (priorUse) return { valid: false, reason: 'already_used_by_user' };
  return { valid: true, amountOffCents: promo.amountOffCents };
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
