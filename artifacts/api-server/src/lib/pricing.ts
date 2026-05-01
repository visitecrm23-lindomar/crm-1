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

export function computeBalance(totalValue: number, paidValue: number): number {
  return Math.round((totalValue - paidValue) * 100) / 100;
}

export function normalizeOrderEmail(raw: unknown): string {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().toLowerCase();
  }
  return "";
}
