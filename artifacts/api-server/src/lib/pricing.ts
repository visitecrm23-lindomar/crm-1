/**
 * Single authoritative monetary rounding function.
 * All monetary computations in the API must go through this function
 * to avoid inconsistencies between parseFloat/toFixed approaches.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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

  const appliedCoupon = roundMoney(Math.min(couponAmount, remaining));
  remaining = roundMoney(remaining - appliedCoupon);

  const appliedLoyalty = roundMoney(Math.min(loyaltyAmount, remaining));
  remaining = roundMoney(remaining - appliedLoyalty);

  const appliedReferral = roundMoney(Math.min(referralAmount, remaining));

  const discountTotal = roundMoney(appliedCoupon + appliedLoyalty + appliedReferral);
  const finalTotal = Math.max(0, roundMoney(baseValue - discountTotal));

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
  return Math.max(0, roundMoney(totalValue - paidValue));
}

export function normalizeOrderEmail(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().toLowerCase();
  }
  return "";
}
