import pino from "pino";
/**
 * Endpoint-level tests for the referral-reversal alert dismissal flow:
 *   POST /api/alerts/referral-reversal-skipped/:reservationId/resolve
 * plus the gap-detection query behind GET /api/alerts.
 *
 * Mirrors the supertest + vi.mock pattern in endpoints.test.ts: real Express
 * route handlers run while the DB, Clerk, and tenant auth are isolated.
 *
 * drizzle-orm is intentionally left REAL here so the gap-detection SQL produced
 * by lib/referral-reversal-gaps.ts can be rendered with PgDialect and asserted
 * (it embeds only string params, never the mocked {} table columns), while the
 * mocked `db` swallows every query the route builds.
 */

import { ROLES } from "@workspace/permissions";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// vi.hoisted: shared mock builders must exist before any vi.mock factory runs
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockLimit,
  mockExecute,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  updateSetCalls,
} = vi.hoisted(() => {
  const updateSetCalls: Record<string, unknown>[] = [];

  const mockLimit = vi.fn(() => Promise.resolve([] as unknown[]));
  // `.where()` results are either awaited directly (GET /alerts aggregate
  // queries iterate / index them) or chained with `.limit()` (resolve lookup).
  // Return an array that ALSO exposes `.limit`, satisfying both shapes.
  const mockWhere = vi.fn(() => {
    const arr = [] as unknown[] & { limit: typeof mockLimit };
    arr.limit = mockLimit;
    return arr;
  });
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  const mockExecute = vi.fn(() => Promise.resolve({ rows: [] as unknown[] }));

  const mockUpdateWhere = vi.fn(() => Promise.resolve([]));
  const mockUpdateSet = vi.fn((payload: Record<string, unknown>) => {
    updateSetCalls.push(payload);
    return { where: mockUpdateWhere };
  });
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockLimit,
    mockExecute,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    updateSetCalls,
  };
});

// ---------------------------------------------------------------------------
// Module mocks (resolved relative to THIS test file: src/__tests__/)
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    execute: mockExecute,
  },
  paymentsTable: {},
  tripsTable: {},
  dealsTable: {},
  clientsTable: {},
  emailLogsTable: {},
  reservationsTable: {},
  referralsTable: {},
}));

vi.mock("../lib/tenant.js", () => ({
  requireAuth: vi.fn(),
  // Mirror the real export from lib/tenant.ts so role gating is faithful.
  AGENCY_STAFF_ROLES: [
    ROLES.AGENCY_ADMIN,
    ROLES.AGENCY_MANAGER,
    ROLES.SALES,
    ROLES.SUPPORT,
  ],
}));

// ---------------------------------------------------------------------------
// Import router and middleware AFTER all mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import alertsRouter from "../routes/alerts.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// Minimal Express app builder
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  req.log = pino({ level: "silent" }) as unknown as typeof req.log;
  next();
}

function buildAlertsApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", alertsRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const STAFF_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Staff User",
  email: "staff@example.com",
};

const CLIENT_USER = {
  id: "user-cli",
  tenantId: "tenant-001",
  role: ROLES.CLIENT,
  name: "Client User",
  email: "client@example.com",
};

const requireAuthMock = vi.mocked(requireAuth);

// ---------------------------------------------------------------------------
// Tests: POST /api/alerts/referral-reversal-skipped/:reservationId/resolve
// ---------------------------------------------------------------------------

describe("POST /api/alerts/referral-reversal-skipped/:reservationId/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSetCalls.length = 0;

    requireAuthMock.mockResolvedValue(STAFF_USER as never);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockImplementation(() => {
      const arr = [] as unknown[] & { limit: typeof mockLimit };
      arr.limit = mockLimit;
      return arr;
    });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockUpdateWhere.mockResolvedValue([]);
    mockUpdateSet.mockImplementation((payload: Record<string, unknown>) => {
      updateSetCalls.push(payload);
      return { where: mockUpdateWhere };
    });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("stamps reversalWarningAcknowledgedAt on matching COMPLETED referrals (success path)", async () => {
    const app = buildAlertsApp();
    // Reservation lookup → found, carries a referral code.
    mockLimit.mockResolvedValueOnce([
      { id: "res-001", discountReferralCode: "REF-ABC" },
    ]);

    const res = await request(app).post(
      "/api/alerts/referral-reversal-skipped/res-001/resolve",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // The referrals UPDATE ran and stamped a timestamp.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(updateSetCalls).toHaveLength(1);
    const payload = updateSetCalls[0];
    expect(payload).toHaveProperty("reversalWarningAcknowledgedAt");
    expect(payload["reversalWarningAcknowledgedAt"]).toBeInstanceOf(Date);
  });

  it("returns 404 when the reservation is not found in the caller's tenant", async () => {
    const app = buildAlertsApp();
    mockLimit.mockResolvedValueOnce([]); // reservation lookup → not found

    const res = await request(app).post(
      "/api/alerts/referral-reversal-skipped/res-missing/resolve",
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
    // No acknowledgment write when the reservation is absent.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when the reservation has no referral code", async () => {
    const app = buildAlertsApp();
    mockLimit.mockResolvedValueOnce([
      { id: "res-002", discountReferralCode: null },
    ]);

    const res = await request(app).post(
      "/api/alerts/referral-reversal-skipped/res-002/resolve",
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-staff (client) role", async () => {
    const app = buildAlertsApp();
    requireAuthMock.mockResolvedValue(CLIENT_USER as never);

    const res = await request(app).post(
      "/api/alerts/referral-reversal-skipped/res-001/resolve",
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN_ROLE" });
    // Role check happens before any DB access.
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/alerts/email-retry-exhausted/:reservationId/resolve
// ---------------------------------------------------------------------------

describe("POST /api/alerts/email-retry-exhausted/:reservationId/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSetCalls.length = 0;

    requireAuthMock.mockResolvedValue(STAFF_USER as never);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockImplementation(() => {
      const arr = [] as unknown[] & { limit: typeof mockLimit };
      arr.limit = mockLimit;
      return arr;
    });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockUpdateWhere.mockResolvedValue([]);
    mockUpdateSet.mockImplementation((payload: Record<string, unknown>) => {
      updateSetCalls.push(payload);
      return { where: mockUpdateWhere };
    });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("stamps retriesResolvedAt on the tenant's exhausted email_logs rows (success path)", async () => {
    const app = buildAlertsApp();
    // Reservation lookup → found in tenant.
    mockLimit.mockResolvedValueOnce([{ id: "res-001" }]);

    const res = await request(app).post(
      "/api/alerts/email-retry-exhausted/res-001/resolve",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // The email_logs UPDATE ran and stamped a resolution timestamp.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(updateSetCalls).toHaveLength(1);
    const payload = updateSetCalls[0];
    expect(payload).toHaveProperty("retriesResolvedAt");
    expect(payload["retriesResolvedAt"]).toBeInstanceOf(Date);
  });

  it("returns 404 when the reservation is not found in the caller's tenant", async () => {
    const app = buildAlertsApp();
    mockLimit.mockResolvedValueOnce([]); // reservation lookup → not found

    const res = await request(app).post(
      "/api/alerts/email-retry-exhausted/res-missing/resolve",
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
    // No resolution write when the reservation is absent.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-staff (client) role", async () => {
    const app = buildAlertsApp();
    requireAuthMock.mockResolvedValue(CLIENT_USER as never);

    const res = await request(app).post(
      "/api/alerts/email-retry-exhausted/res-001/resolve",
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN_ROLE" });
    // Role check happens before any DB access.
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/alerts gap-detection query excludes acknowledged referrals
// ---------------------------------------------------------------------------

describe("GET /api/alerts — referral-reversal gap detection", () => {
  const dialect = new PgDialect();

  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthMock.mockResolvedValue(STAFF_USER as never);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockImplementation(() => {
      const arr = [] as unknown[] & { limit: typeof mockLimit };
      arr.limit = mockLimit;
      return arr;
    });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockExecute.mockResolvedValue({ rows: [] });
  });

  it("filters the gap query on reversal_warning_acknowledged_at IS NULL (acknowledged rows excluded)", async () => {
    const app = buildAlertsApp();

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    // The gap detection runs via db.execute (the list + count raw SQL queries).
    expect(mockExecute).toHaveBeenCalled();

    const renderedQueries = mockExecute.mock.calls.map(
      (call) => dialect.sqlToQuery(call[0] as never).sql,
    );

    // Every gap query must scope out already-acknowledged referrals so
    // dismissed alerts never resurface.
    const ackFilterRegex = /reversal_warning_acknowledged_at\s+is\s+null/i;
    const queriesWithAckFilter = renderedQueries.filter((q) =>
      ackFilterRegex.test(q),
    );
    expect(queriesWithAckFilter.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces the referral-reversal-skipped alert only when unacknowledged gaps exist", async () => {
    const app = buildAlertsApp();

    // First execute call = findReferralReversalGaps (list), second = count.
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            reservation_id: "res-001",
            reservation_number: "AG-EX-202507-0001",
            referral_code: "REF-ABC",
            referrer_name: "Maria",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    const alert = (res.body.alerts as Array<{ id: string; count: number }>).find(
      (a) => a.id === "referral-reversal-skipped",
    );
    expect(alert).toBeDefined();
    expect(alert?.count).toBe(1);
  });

  it("omits the referral-reversal-skipped alert when there are no gaps", async () => {
    const app = buildAlertsApp();
    // Default mockExecute → { rows: [] } for both list and count → count 0.

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    const alert = (res.body.alerts as Array<{ id: string }>).find(
      (a) => a.id === "referral-reversal-skipped",
    );
    expect(alert).toBeUndefined();
  });
});
