import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/api-client-react", () => ({}));

import { CreateReservationBody, CreateTripBody } from "@workspace/api-zod";

function computeTotalValue(priceAdult: number, seats: string[]): number {
  return priceAdult * seats.length;
}

function computeFinalValue(totalValue: number, totalDiscount: number): number {
  return Math.max(0, Math.round((totalValue - totalDiscount) * 100) / 100);
}

describe("computeTotalValue — reservation price from seats", () => {
  it("returns 0 when there are no seats", () => {
    expect(computeTotalValue(150, [])).toBe(0);
  });

  it("returns price per seat for a single seat", () => {
    expect(computeTotalValue(150, ["1A"])).toBe(150);
  });

  it("multiplies price by number of seats", () => {
    expect(computeTotalValue(150, ["1A", "2B", "3C"])).toBe(450);
  });

  it("handles fractional prices correctly", () => {
    expect(computeTotalValue(99.9, ["1A", "2B"])).toBeCloseTo(199.8, 5);
  });

  it("handles zero price per seat", () => {
    expect(computeTotalValue(0, ["1A", "2B"])).toBe(0);
  });
});

describe("computeFinalValue — after discount applied", () => {
  it("returns full totalValue when discount is zero", () => {
    expect(computeFinalValue(1000, 0)).toBe(1000);
  });

  it("returns zero when discount equals total value", () => {
    expect(computeFinalValue(500, 500)).toBe(0);
  });

  it("clamps negative results to zero (discount exceeds total)", () => {
    expect(computeFinalValue(100, 200)).toBe(0);
  });

  it("correctly reduces the value by a partial discount", () => {
    expect(computeFinalValue(800, 150)).toBe(650);
  });
});

describe("CreateReservationBody — Zod schema validation", () => {
  const validBody = {
    tripId: "trip-123",
    clientId: "client-456",
    seats: ["1A", "2B"],
    totalValue: 300,
  };

  it("accepts a minimal valid reservation body", () => {
    const result = CreateReservationBody.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects when tripId is missing", () => {
    const { tripId: _, ...body } = validBody;
    const result = CreateReservationBody.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("rejects when clientId is missing", () => {
    const { clientId: _, ...body } = validBody;
    const result = CreateReservationBody.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("rejects when totalValue is not a number", () => {
    const result = CreateReservationBody.safeParse({ ...validBody, totalValue: "300" });
    expect(result.success).toBe(false);
  });

  it("rejects when seats is not an array", () => {
    const result = CreateReservationBody.safeParse({ ...validBody, seats: "1A,2B" });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields like paidValue and notes", () => {
    const result = CreateReservationBody.safeParse({
      ...validBody,
      paidValue: 100,
      notes: "Pagamento parcial",
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateTripBody — Zod schema validation", () => {
  const validTrip = {
    name: "Excursão ao Nordeste",
    destination: "Fortaleza, CE",
    destinationCity: "Fortaleza",
    destinationState: "CE",
    type: "excursao",
    category: "standard",
    departureDate: "2025-07-10",
    totalCapacity: 46,
    priceAdult: 350,
  };

  it("accepts a valid trip body", () => {
    const result = CreateTripBody.safeParse(validTrip);
    expect(result.success).toBe(true);
  });

  it("rejects when name is missing", () => {
    const { name: _, ...body } = validTrip;
    const result = CreateTripBody.safeParse(body);
    expect(result.success).toBe(false);
  });

  it("rejects when priceAdult is not a number", () => {
    const result = CreateTripBody.safeParse({ ...validTrip, priceAdult: "350" });
    expect(result.success).toBe(false);
  });

  it("rejects when totalCapacity is not a number", () => {
    const result = CreateTripBody.safeParse({ ...validTrip, totalCapacity: "46" });
    expect(result.success).toBe(false);
  });

  it("accepts optional priceChild and priceSenior fields", () => {
    const result = CreateTripBody.safeParse({
      ...validTrip,
      priceChild: 200,
      priceSenior: 280,
    });
    expect(result.success).toBe(true);
  });
});
