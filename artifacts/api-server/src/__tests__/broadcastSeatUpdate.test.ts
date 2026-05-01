import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEmitSeatUpdate, mockWhere, mockFrom, mockSelect } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockEmitSeatUpdate = vi.fn();
  return { mockEmitSeatUpdate, mockWhere, mockFrom, mockSelect };
});

vi.mock("@workspace/db", () => ({
  db: { select: mockSelect },
  reservationsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("../lib/seat-sse.js", () => ({
  emitSeatUpdate: mockEmitSeatUpdate,
}));

import { broadcastSeatUpdate } from "../lib/realtime.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
});

describe("broadcastSeatUpdate", () => {
  it("calls emitSeatUpdate with empty seats when no reservations exist", async () => {
    mockWhere.mockResolvedValue([]);

    await broadcastSeatUpdate("trip-1", "tenant-1");

    expect(mockEmitSeatUpdate).toHaveBeenCalledOnce();
    const payload = mockEmitSeatUpdate.mock.calls[0][0];
    expect(payload.tripId).toBe("trip-1");
    expect(payload.seats).toHaveLength(0);
  });

  it("marks confirmed reservation seats as confirmed", async () => {
    mockWhere.mockResolvedValue([
      { seats: ["1A", "2B"], status: "confirmed" },
    ]);

    await broadcastSeatUpdate("trip-2", "tenant-1");

    const payload = mockEmitSeatUpdate.mock.calls[0][0];
    expect(payload.seats).toContainEqual({ number: "1A", status: "confirmed" });
    expect(payload.seats).toContainEqual({ number: "2B", status: "confirmed" });
  });

  it("marks pending reservation seats as reserved", async () => {
    mockWhere.mockResolvedValue([
      { seats: ["3C", "4D"], status: "pending" },
    ]);

    await broadcastSeatUpdate("trip-3", "tenant-1");

    const payload = mockEmitSeatUpdate.mock.calls[0][0];
    expect(payload.seats).toContainEqual({ number: "3C", status: "reserved" });
    expect(payload.seats).toContainEqual({ number: "4D", status: "reserved" });
  });

  it("merges seats from multiple reservations into a single map", async () => {
    mockWhere.mockResolvedValue([
      { seats: ["1A"], status: "confirmed" },
      { seats: ["2B", "3C"], status: "pending" },
    ]);

    await broadcastSeatUpdate("trip-4", "tenant-1");

    const payload = mockEmitSeatUpdate.mock.calls[0][0];
    expect(payload.seats).toHaveLength(3);
    expect(payload.seats).toContainEqual({ number: "1A", status: "confirmed" });
    expect(payload.seats).toContainEqual({ number: "2B", status: "reserved" });
    expect(payload.seats).toContainEqual({ number: "3C", status: "reserved" });
  });

  it("confirmed status wins over pending when a seat appears in both reservations", async () => {
    mockWhere.mockResolvedValue([
      { seats: ["5E"], status: "pending" },
      { seats: ["5E"], status: "confirmed" },
    ]);

    await broadcastSeatUpdate("trip-5", "tenant-1");

    const payload = mockEmitSeatUpdate.mock.calls[0][0];
    const seat5E = payload.seats.find((s: { number: string }) => s.number === "5E");
    expect(seat5E?.status).toBe("confirmed");
  });
});
