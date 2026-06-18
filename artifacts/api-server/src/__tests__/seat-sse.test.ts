/**
 * Unit tests for the real-time seat-availability broadcaster:
 *   artifacts/api-server/src/lib/seat-sse.ts
 *
 * emitSeatUpdate is the half of the SSE flow Task #38 did not cover (it tested
 * the HTTP lifecycle — store/trip validation, registration, cleanup). Here we
 * exercise the broadcast itself: every connected customer for a trip must
 * receive the live update, dead connections must be pruned, and emitting to a
 * trip nobody is watching must be a safe no-op. A regression here would let a
 * customer pick a seat someone else just booked.
 *
 * The module has no DB/Clerk dependency and keeps its client registry in
 * module-level state, so we drive the real functions directly with fake
 * Response-like objects and clean up registered clients after every test.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Response } from "express";
import {
  addSeatClient,
  removeSeatClient,
  emitSeatUpdate,
  type SeatUpdatePayload,
} from "../lib/seat-sse.js";

// Track every client we register so module-level state never leaks between
// tests (a stray registration would corrupt the "no clients" assertions).
const registered: Array<{ tripId: string; res: Response }> = [];

function makeClient(write?: () => void): Response {
  return { write: vi.fn(write) } as unknown as Response;
}

function register(tripId: string, res: Response): Response {
  addSeatClient(tripId, res);
  registered.push({ tripId, res });
  return res;
}

afterEach(() => {
  for (const { tripId, res } of registered) removeSeatClient(tripId, res);
  registered.length = 0;
});

const samplePayload = (tripId: string): SeatUpdatePayload => ({
  tripId,
  seats: [
    { number: "1", status: "occupied" },
    { number: "2", status: "available" },
  ],
});

describe("emitSeatUpdate", () => {
  it("writes the SSE-formatted payload to every client registered for the tripId", () => {
    const tripId = "trip-write-all";
    const a = register(tripId, makeClient());
    const b = register(tripId, makeClient());

    const payload = samplePayload(tripId);
    emitSeatUpdate(payload);

    const expected = `data: ${JSON.stringify(payload)}\n\n`;
    expect(a.write).toHaveBeenCalledTimes(1);
    expect(a.write).toHaveBeenCalledWith(expected);
    expect(b.write).toHaveBeenCalledTimes(1);
    expect(b.write).toHaveBeenCalledWith(expected);
  });

  it("only notifies clients registered for the targeted tripId", () => {
    const target = register("trip-target", makeClient());
    const other = register("trip-other", makeClient());

    emitSeatUpdate(samplePayload("trip-target"));

    expect(target.write).toHaveBeenCalledTimes(1);
    expect(other.write).not.toHaveBeenCalled();
  });

  it("prunes a dead client whose write throws and keeps delivering to healthy ones", () => {
    const tripId = "trip-prune";
    const dead = register(
      tripId,
      makeClient(() => {
        throw new Error("EPIPE: broken pipe");
      }),
    );
    const live = register(tripId, makeClient());

    // First emit: dead.write throws → that client is pruned; live still gets it.
    emitSeatUpdate(samplePayload(tripId));
    expect(dead.write).toHaveBeenCalledTimes(1);
    expect(live.write).toHaveBeenCalledTimes(1);

    // Second emit: the pruned client is gone, so only the live client is hit.
    emitSeatUpdate(samplePayload(tripId));
    expect(dead.write).toHaveBeenCalledTimes(1); // not called again
    expect(live.write).toHaveBeenCalledTimes(2);
  });

  it("is a safe no-op when no clients are registered for the tripId", () => {
    expect(() => emitSeatUpdate(samplePayload("trip-empty"))).not.toThrow();
  });

  it("is a safe no-op after the last client for a tripId has been pruned", () => {
    const tripId = "trip-drains";
    const dead = register(
      tripId,
      makeClient(() => {
        throw new Error("write after end");
      }),
    );

    // Pruning the only client deletes the trip's registry entry.
    emitSeatUpdate(samplePayload(tripId));
    expect(dead.write).toHaveBeenCalledTimes(1);

    // No clients remain → emit must not throw and must not touch the dead client.
    expect(() => emitSeatUpdate(samplePayload(tripId))).not.toThrow();
    expect(dead.write).toHaveBeenCalledTimes(1);
  });
});
