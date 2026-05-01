import { describe, it, expect } from "vitest";
import { applyDiscounts, computeBalance, normalizeOrderEmail } from "../lib/pricing.js";

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

describe("normalizeOrderEmail — store order lookup email validation", () => {
  it("returns normalized email for a valid email string", () => {
    expect(normalizeOrderEmail("  User@Example.com  ")).toBe("user@example.com");
  });

  it("returns empty string for undefined (query param not provided)", () => {
    expect(normalizeOrderEmail(undefined)).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(normalizeOrderEmail("")).toBe("");
  });

  it("returns empty string for a whitespace-only string", () => {
    expect(normalizeOrderEmail("   ")).toBe("");
  });

  it("returns empty string for a number (non-string type)", () => {
    expect(normalizeOrderEmail(123)).toBe("");
  });

  it("returns empty string for an array (multiple query params)", () => {
    expect(normalizeOrderEmail(["a@b.com", "c@d.com"])).toBe("");
  });
});
