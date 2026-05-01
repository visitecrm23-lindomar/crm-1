import { describe, it, expect } from "vitest";

function applyDiscounts(
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

function computeBalance(totalValue: number, paidValue: number): number {
  return Math.round((totalValue - paidValue) * 100) / 100;
}

function validateOrderEmail(emailQuery: unknown): string {
  if (typeof emailQuery === "string" && emailQuery.trim().length > 0) {
    return emailQuery.trim().toLowerCase();
  }
  return "";
}

describe("applyDiscounts — reservation price calculation", () => {
  it("returns full base value when no discounts are applied", () => {
    const result = applyDiscounts(1000, 0, 0, 0);
    expect(result.finalTotal).toBe(1000);
    expect(result.discountTotal).toBe(0);
  });

  it("applies a coupon discount correctly", () => {
    const result = applyDiscounts(500, 50, 0, 0);
    expect(result.appliedCoupon).toBe(50);
    expect(result.finalTotal).toBe(450);
  });

  it("applies loyalty points correctly", () => {
    const result = applyDiscounts(500, 0, 30, 0);
    expect(result.appliedLoyalty).toBe(30);
    expect(result.finalTotal).toBe(470);
  });

  it("applies referral discount correctly", () => {
    const result = applyDiscounts(500, 0, 0, 25);
    expect(result.appliedReferral).toBe(25);
    expect(result.finalTotal).toBe(475);
  });

  it("applies all three discounts sequentially: coupon → loyalty → referral", () => {
    const result = applyDiscounts(1000, 100, 50, 25);
    expect(result.appliedCoupon).toBe(100);
    expect(result.appliedLoyalty).toBe(50);
    expect(result.appliedReferral).toBe(25);
    expect(result.discountTotal).toBe(175);
    expect(result.finalTotal).toBe(825);
  });

  it("caps each discount so combined discounts never exceed base value", () => {
    const result = applyDiscounts(100, 60, 60, 60);
    expect(result.finalTotal).toBe(0);
    expect(result.discountTotal).toBeLessThanOrEqual(100);
  });

  it("a coupon larger than base value is capped at base value", () => {
    const result = applyDiscounts(200, 500, 0, 0);
    expect(result.appliedCoupon).toBe(200);
    expect(result.finalTotal).toBe(0);
  });

  it("subsequent discounts are applied on remaining balance, not original", () => {
    const result = applyDiscounts(100, 60, 50, 0);
    expect(result.appliedCoupon).toBe(60);
    expect(result.appliedLoyalty).toBe(40);
    expect(result.finalTotal).toBe(0);
  });
});

describe("computeBalance — payment balance", () => {
  it("balance equals full value when nothing is paid", () => {
    expect(computeBalance(1500, 0)).toBe(1500);
  });

  it("balance is zero when fully paid", () => {
    expect(computeBalance(1500, 1500)).toBe(0);
  });

  it("balance reflects partial payment", () => {
    expect(computeBalance(1500, 500)).toBe(1000);
  });

  it("rounds to 2 decimal places", () => {
    expect(computeBalance(100.009, 0)).toBe(100.01);
  });
});

describe("validateOrderEmail — store order lookup email validation", () => {
  it("returns normalized email for a valid email string", () => {
    expect(validateOrderEmail("  User@Example.com  ")).toBe("user@example.com");
  });

  it("returns empty string for undefined (query param not provided)", () => {
    expect(validateOrderEmail(undefined)).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(validateOrderEmail("")).toBe("");
  });

  it("returns empty string for a whitespace-only string", () => {
    expect(validateOrderEmail("   ")).toBe("");
  });

  it("returns empty string for a number (non-string type)", () => {
    expect(validateOrderEmail(123)).toBe("");
  });

  it("returns empty string for an array (multiple query params)", () => {
    expect(validateOrderEmail(["a@b.com", "c@d.com"])).toBe("");
  });
});
