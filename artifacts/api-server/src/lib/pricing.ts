export function applyDiscounts(
  baseValue: number,
  couponAmount: number,
  loyaltyAmount: number,
  referralAmount: number,
): {
  appliedCoupon: number;
  appliedLoyalty: number;
  appliedReferral: number;
  discountTotal: number;
  finalTotal: number;
} {
  let remaining = baseValue;

  const appliedCoupon = Math.round(Math.min(couponAmount, remaining) * 100) / 100;
  remaining = Math.round((remaining - appliedCoupon) * 100) / 100;

  const appliedLoyalty = Math.round(Math.min(loyaltyAmount, remaining) * 100) / 100;
  remaining = Math.round((remaining - appliedLoyalty) * 100) / 100;

  const appliedReferral = Math.round(Math.min(referralAmount, remaining) * 100) / 100;

  const discountTotal = Math.round((appliedCoupon + appliedLoyalty + appliedReferral) * 100) / 100;
  const finalTotal = Math.max(0, Math.round((baseValue - discountTotal) * 100) / 100);

  return { appliedCoupon, appliedLoyalty, appliedReferral, discountTotal, finalTotal };
}

/**
 * Returns the number of loyalty points actually consumed given the discount
 * that was applied. Points are capped so customers never lose more points
 * than the discount they received.
 *
 * @param loyaltyPoints    - Points the customer requested to redeem
 * @param appliedLoyaltyAmount - Actual monetary discount applied (may be < requested)
 * @param realPerPoint     - Monetary value of one loyalty point (>0)
 */
export function computeEffectiveLoyaltyPoints(
  loyaltyPoints: number,
  appliedLoyaltyAmount: number,
  realPerPoint: number,
): number {
  if (realPerPoint <= 0) return 0;
  return Math.min(loyaltyPoints, Math.ceil(appliedLoyaltyAmount / realPerPoint));
}

export function computeBalance(totalValue: number, paidValue: number): number {
  return Math.max(0, Math.round((totalValue - paidValue) * 100) / 100);
}

export function normalizeOrderEmail(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().toLowerCase();
  }
  return "";
}
