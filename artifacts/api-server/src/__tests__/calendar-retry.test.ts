/**
 * Tests for calendar-service transient error re-throw behaviour (#81).
 *
 * Verifies that GoogleCalendarService re-throws 429/5xx errors so that
 * withCalendarRetry (and ultimately BullMQ) can retry them with exponential
 * backoff, while permanent failures (invalid_grant, 400) are swallowed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mock googleapis before importing the service ───────────────────────────

const { mockEventsInsert, mockEventsPatch, mockEventsDelete, mockDbUpdate } = vi.hoisted(() => {
  const mockDbUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) }));
  return {
    mockEventsInsert: vi.fn(),
    mockEventsPatch: vi.fn(),
    mockEventsDelete: vi.fn(),
    mockDbUpdate,
  };
});

const mockCalendar = {
  events: {
    insert: mockEventsInsert,
    patch: mockEventsPatch,
    delete: mockEventsDelete,
  },
};

vi.mock("googleapis", () => ({
  google: {
    calendar: vi.fn(() => mockCalendar),
    auth: { OAuth2: vi.fn(() => ({ setCredentials: vi.fn(), refreshAccessToken: vi.fn() })) },
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    update: mockDbUpdate,
  },
  usersTable: {},
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  GoogleCalendarService,
  withCalendarRetry,
  isTransientCalendarError,
  isInvalidGrantError,
  isEventNotFoundError,
} from "../lib/google-calendar/calendar-service";

function makeService() {
  return new GoogleCalendarService("fake-token", "user-001");
}

function transientError(status: number): Error {
  const err = new Error(`HTTP ${status}`);
  (err as unknown as { response: { status: number } }).response = { status };
  return err;
}

function permanentError(errorCode: string): Error {
  const err = new Error(errorCode);
  (err as unknown as { response: { status: number; data: { error: string } } }).response = {
    status: 401,
    data: { error: errorCode },
  };
  return err;
}

// ── isTransientCalendarError ─────────────────────────────────────────────────

describe("isTransientCalendarError", () => {
  it.each([429, 500, 502, 503, 504])("returns true for status %d", (status) => {
    expect(isTransientCalendarError(transientError(status))).toBe(true);
  });

  it("returns false for 400", () => {
    expect(isTransientCalendarError(transientError(400))).toBe(false);
  });

  it("returns false for invalid_grant error", () => {
    expect(isTransientCalendarError(permanentError("invalid_grant"))).toBe(false);
  });

  it("returns true for rate limit message", () => {
    expect(isTransientCalendarError(new Error("Rate limit exceeded"))).toBe(true);
  });
});

// ── withCalendarRetry ────────────────────────────────────────────────────────

describe("withCalendarRetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withCalendarRetry(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientError(429))
      .mockResolvedValue("ok");
    await expect(withCalendarRetry(fn, 3)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries on transient error", async () => {
    const err = transientError(503);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withCalendarRetry(fn, 3)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry permanent errors (throws immediately)", async () => {
    const err = permanentError("invalid_grant");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withCalendarRetry(fn, 3)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── GoogleCalendarService.createEvent ────────────────────────────────────────

describe("GoogleCalendarService.createEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns event id on success", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "evt-123" } });
    const svc = makeService();
    await expect(svc.createEvent({ summary: "Test", startDateTime: new Date() })).resolves.toEqual({ id: "evt-123" });
  });

  it("re-throws transient 429 error (so withCalendarRetry can retry)", async () => {
    mockEventsInsert.mockRejectedValue(transientError(429));
    const svc = makeService();
    await expect(svc.createEvent({ summary: "Test", startDateTime: new Date() })).rejects.toMatchObject({
      message: "HTTP 429",
    });
  });

  it("re-throws transient 503 error", async () => {
    mockEventsInsert.mockRejectedValue(transientError(503));
    const svc = makeService();
    await expect(svc.createEvent({ summary: "Test", startDateTime: new Date() })).rejects.toMatchObject({
      message: "HTTP 503",
    });
  });

  it("swallows permanent error and returns null", async () => {
    mockEventsInsert.mockRejectedValue(permanentError("invalid_grant"));
    const svc = makeService();
    await expect(svc.createEvent({ summary: "Test", startDateTime: new Date() })).resolves.toBeNull();
  });
});

// ── GoogleCalendarService.updateEvent ────────────────────────────────────────

describe("GoogleCalendarService.updateEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true on success", async () => {
    mockEventsPatch.mockResolvedValue({});
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", { summary: "Updated" })).resolves.toBe(true);
  });

  it("re-throws transient 429 error", async () => {
    mockEventsPatch.mockRejectedValue(transientError(429));
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", {})).rejects.toMatchObject({ message: "HTTP 429" });
  });

  it("re-throws transient 500 error", async () => {
    mockEventsPatch.mockRejectedValue(transientError(500));
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", {})).rejects.toMatchObject({ message: "HTTP 500" });
  });

  it("swallows permanent error and returns false", async () => {
    mockEventsPatch.mockRejectedValue(permanentError("invalid_grant"));
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", {})).resolves.toBe(false);
  });

  it("returns 'not-found' when Google event was deleted externally (404)", async () => {
    mockEventsPatch.mockRejectedValue(transientError(404));
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", {})).resolves.toBe("not-found");
  });
});

// ── isEventNotFoundError ──────────────────────────────────────────────────────

describe("isEventNotFoundError", () => {
  it("returns true for 404 status", () => {
    expect(isEventNotFoundError(transientError(404))).toBe(true);
  });

  it("returns false for 401 status", () => {
    expect(isEventNotFoundError(transientError(401))).toBe(false);
  });

  it("returns false for 429 status", () => {
    expect(isEventNotFoundError(transientError(429))).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isEventNotFoundError("not an error")).toBe(false);
    expect(isEventNotFoundError(null)).toBe(false);
  });
});

// ── GoogleCalendarService.deleteEvent ────────────────────────────────────────

describe("GoogleCalendarService.deleteEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true on success", async () => {
    mockEventsDelete.mockResolvedValue({});
    const svc = makeService();
    await expect(svc.deleteEvent("evt-123")).resolves.toBe(true);
  });

  it("re-throws transient 429 error", async () => {
    mockEventsDelete.mockRejectedValue(transientError(429));
    const svc = makeService();
    await expect(svc.deleteEvent("evt-123")).rejects.toMatchObject({ message: "HTTP 429" });
  });

  it("swallows permanent error and returns false", async () => {
    mockEventsDelete.mockRejectedValue(permanentError("invalid_grant"));
    const svc = makeService();
    await expect(svc.deleteEvent("evt-123")).resolves.toBe(false);
  });
});

// ── auth error → marks connection invalid, no retry ──────────────────────────

describe("GoogleCalendarService — auth error marks invalid without retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createEvent: calls db.update to mark invalid on 401 invalid_grant", async () => {
    mockEventsInsert.mockRejectedValue(permanentError("invalid_grant"));
    const svc = makeService();
    const result = await svc.createEvent({ summary: "Test", startDateTime: new Date() });
    expect(result).toBeNull();
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockEventsInsert).toHaveBeenCalledTimes(1);
  });

  it("createEvent: does NOT call db.update on 429 transient error — should re-throw", async () => {
    mockEventsInsert.mockRejectedValue(transientError(429));
    const svc = makeService();
    await expect(svc.createEvent({ summary: "Test", startDateTime: new Date() })).rejects.toMatchObject({
      message: "HTTP 429",
    });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("updateEvent: calls db.update to mark invalid on 401 invalid_grant", async () => {
    mockEventsPatch.mockRejectedValue(permanentError("invalid_grant"));
    const svc = makeService();
    const result = await svc.updateEvent("evt-123", { summary: "Updated" });
    expect(result).toBe(false);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockEventsPatch).toHaveBeenCalledTimes(1);
  });

  it("updateEvent: does NOT call db.update on 500 transient error — should re-throw", async () => {
    mockEventsPatch.mockRejectedValue(transientError(500));
    const svc = makeService();
    await expect(svc.updateEvent("evt-123", {})).rejects.toMatchObject({ message: "HTTP 500" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

// ── withCalendarRetry — structured logging ────────────────────────────────────

describe("withCalendarRetry — structured logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a warning on transient retry and info on success", async () => {
    const { logger } = await import("../lib/logger");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientError(429))
      .mockResolvedValue("ok");

    await expect(withCalendarRetry(fn, 3)).resolves.toBe("ok");

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, maxAttempts: 3 }),
      expect.stringContaining("retrying after backoff"),
    );
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2, maxAttempts: 3 }),
      expect.stringContaining("retry succeeded"),
    );
  });

  it("does NOT log a warning when first attempt succeeds", async () => {
    const { logger } = await import("../lib/logger");
    const fn = vi.fn().mockResolvedValue("ok");
    await withCalendarRetry(fn, 3);
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });
});
