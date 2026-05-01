import { describe, it, expect } from "vitest";
import { applyDiscounts, computeBalance } from "../lib/pricing.js";

describe("applyDiscounts — multi-step discount pipeline", () => {
  it("returns full base value and zero discount when no discounts are applied", () => {
    const result = applyDiscounts(1000, 0, 0, 0);
    expect(result.appliedCoupon).toBe(0);
    expect(result.appliedLoyalty).toBe(0);
    expect(result.appliedReferral).toBe(0);
    expect(result.discountTotal).toBe(0);
    expect(result.finalTotal).toBe(1000);
  });

  it("applies coupon discount alone and leaves loyalty/referral untouched", () => {
    const result = applyDiscounts(500, 75, 0, 0);
    expect(result.appliedCoupon).toBe(75);
    expect(result.appliedLoyalty).toBe(0);
    expect(result.appliedReferral).toBe(0);
    expect(result.finalTotal).toBe(425);
  });

  it("applies loyalty discount alone and leaves coupon/referral untouched", () => {
    const result = applyDiscounts(500, 0, 40, 0);
    expect(result.appliedCoupon).toBe(0);
    expect(result.appliedLoyalty).toBe(40);
    expect(result.appliedReferral).toBe(0);
    expect(result.finalTotal).toBe(460);
  });

  it("applies referral discount alone and leaves coupon/loyalty untouched", () => {
    const result = applyDiscounts(500, 0, 0, 30);
    expect(result.appliedCoupon).toBe(0);
    expect(result.appliedLoyalty).toBe(0);
    expect(result.appliedReferral).toBe(30);
    expect(result.finalTotal).toBe(470);
  });

  it("applies all three discounts in sequence: coupon first, then loyalty, then referral", () => {
    const result = applyDiscounts(1000, 100, 50, 25);
    expect(result.appliedCoupon).toBe(100);
    expect(result.appliedLoyalty).toBe(50);
    expect(result.appliedReferral).toBe(25);
    expect(result.discountTotal).toBe(175);
    expect(result.finalTotal).toBe(825);
  });

  it("caps final total at zero when combined discounts exceed base value", () => {
    const result = applyDiscounts(100, 200, 0, 0);
    expect(result.appliedCoupon).toBe(100);
    expect(result.finalTotal).toBe(0);
    expect(result.discountTotal).toBeLessThanOrEqual(100);
  });

  it("caps each subsequent discount on remaining balance so total never goes negative", () => {
    const result = applyDiscounts(100, 60, 60, 60);
    expect(result.appliedCoupon).toBe(60);
    expect(result.appliedLoyalty).toBe(40);
    expect(result.appliedReferral).toBe(0);
    expect(result.finalTotal).toBe(0);
    expect(result.discountTotal).toBeLessThanOrEqual(100);
  });

  it("loyalty and referral are applied on post-coupon balance, not on original base value", () => {
    const result = applyDiscounts(200, 150, 100, 50);
    expect(result.appliedCoupon).toBe(150);
    expect(result.appliedLoyalty).toBe(50);
    expect(result.appliedReferral).toBe(0);
    expect(result.finalTotal).toBe(0);
  });

  it("handles fractional currency values and rounds to 2 decimal places", () => {
    const result = applyDiscounts(99.99, 10.005, 0, 0);
    expect(result.appliedCoupon).toBe(10.01);
    expect(result.finalTotal).toBe(89.98);
  });
});

describe("computeBalance — balance after partial payment", () => {
  it("balance equals total value when no payment has been made", () => {
    expect(computeBalance(1500, 0)).toBe(1500);
  });

  it("balance is zero when total value is fully paid", () => {
    expect(computeBalance(1500, 1500)).toBe(0);
  });

  it("balance is zero when overpaid (never returns a negative balance)", () => {
    expect(computeBalance(1500, 2000)).toBe(0);
  });

  it("balance reflects the outstanding amount after a partial payment", () => {
    expect(computeBalance(1500, 600)).toBe(900);
  });

  it("rounds the balance to 2 decimal places", () => {
    expect(computeBalance(100.005, 0)).toBe(100.01);
  });
});
