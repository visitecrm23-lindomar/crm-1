import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  tenantsTable: {},
  reservationsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("../lib/seat-sse.js", () => ({
  emitSeatUpdate: vi.fn(),
}));

import {
  tripTypeToCode,
  derivePrefix,
  getYearMonth,
  buildReservationNumber,
} from "../lib/reservation-number.js";

import {
  deriveAgeCategory,
  getAgeYears,
} from "../lib/passenger.js";

describe("tripTypeToCode", () => {
  it("maps excursao to EXC", () => {
    expect(tripTypeToCode("excursao")).toBe("EXC");
  });

  it("maps excursion to EXC (English variant)", () => {
    expect(tripTypeToCode("excursion")).toBe("EXC");
  });

  it("maps package to PCT", () => {
    expect(tripTypeToCode("package")).toBe("PCT");
  });

  it("maps day_trip to BTV", () => {
    expect(tripTypeToCode("day_trip")).toBe("BTV");
  });

  it("maps bate_volta to BTV", () => {
    expect(tripTypeToCode("bate_volta")).toBe("BTV");
  });

  it("returns RES for null", () => {
    expect(tripTypeToCode(null)).toBe("RES");
  });

  it("returns RES for unknown type", () => {
    expect(tripTypeToCode("safari")).toBe("RES");
  });
});

describe("derivePrefix", () => {
  it("takes first 3 letters of slug uppercased", () => {
    expect(derivePrefix("visite")).toBe("VIS");
  });

  it("strips non-alpha characters from slug", () => {
    expect(derivePrefix("agencia-sol")).toBe("AGE");
  });

  it("falls back to AGE when source is empty", () => {
    expect(derivePrefix("")).toBe("AGE");
  });
});

describe("getYearMonth", () => {
  it("returns YYYYMM for a given date", () => {
    expect(getYearMonth(new Date("2025-06-15"))).toBe("202506");
  });

  it("pads single-digit months with zero", () => {
    expect(getYearMonth(new Date("2024-01-01"))).toBe("202401");
  });
});

describe("buildReservationNumber", () => {
  it("assembles the expected format with zero-padded sequence", () => {
    expect(buildReservationNumber("VIS", "EXC", "202505", 1)).toBe(
      "VIS-EXC-202505-00001",
    );
  });

  it("handles sequence numbers above 99999 without truncation", () => {
    expect(buildReservationNumber("AGE", "RES", "202512", 100000)).toBe(
      "AGE-RES-202512-100000",
    );
  });
});

describe("deriveAgeCategory", () => {
  it("returns adult for null birthDate", () => {
    expect(deriveAgeCategory(null)).toBe("adult");
  });

  it("returns child for a 5-year-old", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 5);
    expect(deriveAgeCategory(birthDate)).toBe("child");
  });

  it("returns adult for a 30-year-old", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 30);
    expect(deriveAgeCategory(birthDate)).toBe("adult");
  });

  it("returns senior for a 65-year-old", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 65);
    expect(deriveAgeCategory(birthDate)).toBe("senior");
  });

  it("returns child for an 11-year-old (boundary)", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 11);
    expect(deriveAgeCategory(birthDate)).toBe("child");
  });

  it("returns senior for a 60-year-old (boundary)", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 60);
    expect(deriveAgeCategory(birthDate)).toBe("senior");
  });
});

describe("getAgeYears", () => {
  it("returns 30 for null birthDate", () => {
    expect(getAgeYears(null)).toBe(30);
  });

  it("returns an approximate age for a 25-year-old", () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 25);
    const age = getAgeYears(birthDate);
    expect(age).toBeGreaterThanOrEqual(24);
    expect(age).toBeLessThanOrEqual(25);
  });
});
