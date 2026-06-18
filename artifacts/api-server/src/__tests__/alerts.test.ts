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

// Partial mock: keep the REAL Drizzle table definitions (so query-builder SQL
// can be rendered with real column names via PgDialect — see the
// email-retry-exhausted detection block) while overriding only the live `db`
// handle with the mock chain. importOriginal pulls in the real schema; the real
// `db`/`pool` it also exports are never queried because we replace `db` here.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: mockSelect,
      update: mockUpdate,
      execute: mockExecute,
    },
  };
});

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

// ---------------------------------------------------------------------------
// Tests: GET /api/alerts — email-retry-exhausted detection
//
// This closes the loop the dismissal endpoint (POST .../email-retry-exhausted/
// :reservationId/resolve) only half-covers. That endpoint stamps
// retriesResolvedAt; the aggregator's query #8 must then EXCLUDE those rows via
// isNull(retriesResolvedAt), or a dismissed alert would keep re-appearing in the
// bell. A second, route-level resolution path treats a successful manual
// (non-auto) resend after the exhaustion timestamp as resolved too.
//
// @workspace/db is partially mocked (real Drizzle tables, mocked `db`), so
// query #8's WHERE renders with real column names via PgDialect — mirroring the
// SQL-assertion technique used by the referral-reversal gap tests above. The
// emailLogs queries are discriminated by their SELECT projection keys (query #8
// alone projects `retriesExhaustedAt`; the manual-resend lookup projects exactly
// `reservationId` + `createdAt`), so the tests never depend on Promise.all order.
// ---------------------------------------------------------------------------

describe("GET /api/alerts — email-retry-exhausted detection", () => {
  const dialect = new PgDialect();

  let exhaustedLogsRows: Array<Record<string, unknown>>;
  let manualResendRows: Array<Record<string, unknown>>;
  let selectKind: "exhausted-logs" | "manual-resends" | "other";
  let capturedExhaustedWhere: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    exhaustedLogsRows = [];
    manualResendRows = [];
    selectKind = "other";
    capturedExhaustedWhere = undefined;

    requireAuthMock.mockResolvedValue(STAFF_USER as never);

    mockLimit.mockResolvedValue([]);

    mockSelect.mockImplementation((cols?: Record<string, unknown>) => {
      const keys = cols && typeof cols === "object" ? Object.keys(cols) : [];
      if (keys.includes("retriesExhaustedAt")) {
        selectKind = "exhausted-logs";
      } else if (
        keys.length === 2 &&
        keys.includes("reservationId") &&
        keys.includes("createdAt")
      ) {
        selectKind = "manual-resends";
      } else {
        selectKind = "other";
      }
      return { from: mockFrom };
    });

    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });

    mockWhere.mockImplementation((condition?: unknown) => {
      const kind = selectKind;
      selectKind = "other";
      let rows: Array<Record<string, unknown>> = [];
      if (kind === "exhausted-logs") {
        capturedExhaustedWhere = condition;
        rows = exhaustedLogsRows;
      } else if (kind === "manual-resends") {
        rows = manualResendRows;
      }
      const arr = [...rows] as unknown as unknown[] & { limit: typeof mockLimit };
      arr.limit = mockLimit;
      return arr;
    });

    mockExecute.mockResolvedValue({ rows: [] });
  });

  it("filters query #8 on retries_resolved_at IS NULL so dismissed alerts stay dismissed", async () => {
    const app = buildAlertsApp();

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    // The aggregator must have built the exhausted-emails query.
    expect(capturedExhaustedWhere).toBeDefined();

    const sqlText = dialect.sqlToQuery(capturedExhaustedWhere as never).sql;

    // Dismissals stamp retries_resolved_at; the query must scope those out so a
    // resolved row can never reach the alert builder.
    expect(sqlText).toMatch(/retries_resolved_at"?\s+is\s+null/i);
    // And it only considers rows whose auto-retries were actually exhausted.
    expect(sqlText).toMatch(/retries_exhausted_at"?\s+is\s+not\s+null/i);
  });

  it("surfaces the email-retry-exhausted alert for an unresolved exhausted row with no manual resend", async () => {
    const app = buildAlertsApp();

    const exhaustedAt = new Date("2025-06-01T10:00:00.000Z");
    exhaustedLogsRows = [
      {
        reservationId: "res-001",
        retriesExhaustedAt: exhaustedAt,
        status: "failed",
        isAutoRetry: true,
        createdAt: new Date("2025-06-01T09:00:00.000Z"),
      },
    ];
    manualResendRows = []; // no successful manual resend followed the exhaustion

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    const alert = (
      res.body.alerts as Array<{
        id: string;
        count: number;
        reservationIds?: string[];
      }>
    ).find((a) => a.id === "email-retry-exhausted");

    expect(alert).toBeDefined();
    expect(alert?.count).toBe(1);
    expect(alert?.reservationIds).toEqual(["res-001"]);
  });

  it("omits the alert when a successful manual resend followed the exhaustion", async () => {
    const app = buildAlertsApp();

    const exhaustedAt = new Date("2025-06-01T10:00:00.000Z");
    exhaustedLogsRows = [
      {
        reservationId: "res-001",
        retriesExhaustedAt: exhaustedAt,
        status: "failed",
        isAutoRetry: true,
        createdAt: new Date("2025-06-01T09:00:00.000Z"),
      },
    ];
    // A manual (non-auto) resend that succeeded AFTER the exhaustion timestamp
    // marks the reservation resolved, so the alert must not surface.
    manualResendRows = [
      {
        reservationId: "res-001",
        createdAt: new Date("2025-06-01T11:00:00.000Z"),
      },
    ];

    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);

    const alert = (res.body.alerts as Array<{ id: string }>).find(
      (a) => a.id === "email-retry-exhausted",
    );
    expect(alert).toBeUndefined();
  });
});
