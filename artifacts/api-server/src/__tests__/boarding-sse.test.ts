/**
 * Unit tests for the boarding-control live broadcaster:
 *   artifacts/api-server/src/lib/boarding-sse.ts
 *
 * The boarding-control screen (manifest / check-in) holds an SSE connection
 * open and reloads its data whenever it receives a `{ type: "refresh" }` event.
 * Task #47 covered the *frontend* reaction to those events; this covers the
 * *producer*: every connected staff client for a trip must receive the refresh,
 * dead connections must be pruned, and emitting to a trip nobody is watching
 * must be a safe no-op. A regression here would let staff silently stop seeing
 * live boarding updates after a check-in — with no error surfaced anywhere.
 *
 * The module has no DB/Clerk dependency and keeps its client registry in
 * module-level state, so we drive the real functions directly with fake
 * Response-like objects and clean up registered clients after every test.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Response } from "express";
import {
  addBoardingClient,
  removeBoardingClient,
  emitBoardingUpdate,
} from "../lib/boarding-sse.js";

// Track every client we register so module-level state never leaks between
// tests (a stray registration would corrupt the "no clients" assertions).
const registered: Array<{ tripId: string; res: Response }> = [];

function makeClient(write?: () => void): Response {
  return { write: vi.fn(write) } as unknown as Response;
}

function register(tripId: string, res: Response): Response {
  addBoardingClient(tripId, res);
  registered.push({ tripId, res });
  return res;
}

afterEach(() => {
  for (const { tripId, res } of registered) removeBoardingClient(tripId, res);
  registered.length = 0;
});

const expectedFrame = (tripId: string) =>
  `data: ${JSON.stringify({ type: "refresh", tripId })}\n\n`;

describe("emitBoardingUpdate", () => {
  it("writes a `{ type: 'refresh' }` frame to every client registered for the tripId", () => {
    const tripId = "trip-write-all";
    const a = register(tripId, makeClient());
    const b = register(tripId, makeClient());

    emitBoardingUpdate(tripId);

    const expected = expectedFrame(tripId);
    expect(a.write).toHaveBeenCalledTimes(1);
    expect(a.write).toHaveBeenCalledWith(expected);
    expect(b.write).toHaveBeenCalledTimes(1);
    expect(b.write).toHaveBeenCalledWith(expected);
  });

  it("emits the refresh type the frontend boarding screen listens for", () => {
    const tripId = "trip-shape";
    const client = register(tripId, makeClient());

    emitBoardingUpdate(tripId);

    const frame = (client.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const payload = JSON.parse(frame.replace(/^data: /, "").trim());
    expect(payload).toEqual({ type: "refresh", tripId });
  });

  it("only notifies clients registered for the targeted tripId", () => {
    const target = register("trip-target", makeClient());
    const other = register("trip-other", makeClient());

    emitBoardingUpdate("trip-target");

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
    emitBoardingUpdate(tripId);
    expect(dead.write).toHaveBeenCalledTimes(1);
    expect(live.write).toHaveBeenCalledTimes(1);

    // Second emit: the pruned client is gone, so only the live client is hit.
    emitBoardingUpdate(tripId);
    expect(dead.write).toHaveBeenCalledTimes(1); // not called again
    expect(live.write).toHaveBeenCalledTimes(2);
  });

  it("is a safe no-op when no clients are registered for the tripId", () => {
    expect(() => emitBoardingUpdate("trip-empty")).not.toThrow();
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
    emitBoardingUpdate(tripId);
    expect(dead.write).toHaveBeenCalledTimes(1);

    // No clients remain → emit must not throw and must not touch the dead client.
    expect(() => emitBoardingUpdate(tripId)).not.toThrow();
    expect(dead.write).toHaveBeenCalledTimes(1);
  });

  it("stops delivering to a client after it is explicitly removed (disconnect cleanup)", () => {
    const tripId = "trip-remove";
    const client = register(tripId, makeClient());

    emitBoardingUpdate(tripId);
    expect(client.write).toHaveBeenCalledTimes(1);

    removeBoardingClient(tripId, client);
    registered.length = 0; // already removed; avoid double-remove in afterEach

    emitBoardingUpdate(tripId);
    expect(client.write).toHaveBeenCalledTimes(1); // not called again
  });
});
