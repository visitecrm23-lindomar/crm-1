/**
 * Tests: PATCH /clients/:id/referral-code — referral code suspension email dispatch
 *
 * Verifies that dispatchReferralCodeSuspendedEmail is called with the correct
 * arguments when status is set to "blocked" or "cancelled", and is NOT called
 * when status is set back to "active".
 */

import pino from "pino";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { ROLES } from "@workspace/permissions";

// ---------------------------------------------------------------------------
// vi.hoisted: shared mock primitives created before any vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockSelectLimit, mockSelectOrderBy, mockUpdateReturning, dispatchReferralCodeSuspendedEmailMock } =
  vi.hoisted(() => {
    const mockSelectLimit = vi.fn();
    const mockSelectOrderBy = vi.fn();
    const mockUpdateReturning = vi.fn();
    const dispatchReferralCodeSuspendedEmailMock = vi.fn();
    return { mockSelectLimit, mockSelectOrderBy, mockUpdateReturning, dispatchReferralCodeSuspendedEmailMock };
  });

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockSelectLimit, orderBy: mockSelectOrderBy })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockUpdateReturning,
        })),
      })),
    })),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    transaction: vi.fn(),
  },
  clientsTable: {},
  notesTable: {},
  reservationsTable: {},
  tripsTable: {},
  npsResponsesTable: {},
  referralsTable: {},
  usersTable: {},
  paymentsTable: {},
  dealsTable: {},
  storeOrdersTable: {},
  storeReviewsTable: {},
  clientScoresTable: {},
  loyaltyMembersTable: {},
  tenantsTable: {},
  pipelineStagesTable: {},
  storesTable: {},
  referralAttemptLogsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...a) => a),
  or: vi.fn((...a) => a),
  ilike: vi.fn(() => "ilike"),
  inArray: vi.fn(() => "inArray"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
  sql: Object.assign(vi.fn(() => "sql"), { raw: vi.fn() }),
  count: vi.fn(() => "count"),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: vi.fn(),
  getAuth: vi.fn(() => ({ userId: "user_test" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/tenant.js", () => ({
  requireAuth: vi.fn(),
  getTenantUser: vi.fn(),
  ADMIN_ROLES: ["agencia"],
  MANAGEMENT_ROLES: ["agencia", "vendedor"],
}));

vi.mock("../queues/email-helpers.js", () => ({
  dispatchReferralCodeSuspendedEmail: dispatchReferralCodeSuspendedEmailMock,
  dispatchReferralWelcomeEmail: vi.fn().mockResolvedValue(true),
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueReservationCancellationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueNewBookingNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: {
    syncTrip: vi.fn().mockResolvedValue(undefined),
    syncBirthday: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/google-calendar/schedule-sync.js", () => ({
  scheduleCalendarSyncBirthday: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activities.js", () => ({
  writeClientActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

vi.mock("../lib/referral-code.js", () => ({
  generateAndAssignReferralCode: vi.fn().mockResolvedValue("REF-0001"),
}));

vi.mock("../lib/planLimits.js", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/client-scores.js", () => ({
  calculateScoresForClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/redis.js", () => ({
  getRedisConnection: vi.fn(() => null),
}));

vi.mock("../lib/ai-client.js", () => ({
  getAIClientForTenant: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/cpf.js", () => ({
  validateCPF: vi.fn(() => true),
  cleanCPF: vi.fn((v: string) => v),
}));


vi.mock("../lib/seat-sse.js", () => ({
  tryAddSeatClient: vi.fn(() => true),
  addSeatClient: vi.fn(),
  removeSeatClient: vi.fn(),
  emitSeatUpdate: vi.fn(),
}));

vi.mock("../lib/realtime.js", () => ({
  broadcastSeatUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import router AFTER all mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import clientsRouter from "../routes/clients.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildClientsApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { log?: unknown }, _res: express.Response, next: express.NextFunction) => {
    req.log = pino({ level: "silent" });
    next();
  });
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Admin User",
  email: "admin@agency.com",
};

const FAKE_CLIENT = {
  id: "client-001",
  tenantId: "tenant-001",
  name: "Maria Souza",
  email: "maria@example.com",
  referralCode: "MARIA2026",
  referralCodeStatus: "active",
  cpf: null,
  userId: null,
  createdById: null,
};

// ---------------------------------------------------------------------------
// Tests: PATCH /api/clients/:id/referral-code — suspension email dispatch
// ---------------------------------------------------------------------------

describe("PATCH /api/clients/:id/referral-code — suspension email dispatch", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthMock.mockResolvedValue(FAKE_USER as never);

    mockSelectLimit.mockResolvedValue([FAKE_CLIENT]);
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "blocked" },
    ]);
    dispatchReferralCodeSuspendedEmailMock.mockResolvedValue(true);
  });

  it('dispatches suspension email with clientId, tenantId, and status "blocked"', async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "blocked" },
    ]);

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "blocked" });

    expect(res.status).toBe(200);
    expect(dispatchReferralCodeSuspendedEmailMock).toHaveBeenCalledTimes(1);
    expect(dispatchReferralCodeSuspendedEmailMock).toHaveBeenCalledWith({
      clientId: FAKE_CLIENT.id,
      tenantId: FAKE_USER.tenantId,
      status: "blocked",
    });
  });

  it('dispatches suspension email with clientId, tenantId, and status "cancelled"', async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "cancelled" },
    ]);

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(dispatchReferralCodeSuspendedEmailMock).toHaveBeenCalledTimes(1);
    expect(dispatchReferralCodeSuspendedEmailMock).toHaveBeenCalledWith({
      clientId: FAKE_CLIENT.id,
      tenantId: FAKE_USER.tenantId,
      status: "cancelled",
    });
  });

  it('does NOT dispatch suspension email when status is set to "active"', async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "active" },
    ]);

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "active" });

    expect(res.status).toBe(200);
    expect(dispatchReferralCodeSuspendedEmailMock).not.toHaveBeenCalled();
  });

  it("includes emailSent in the response when status triggers email dispatch", async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "blocked" },
    ]);
    dispatchReferralCodeSuspendedEmailMock.mockResolvedValue(true);

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "blocked" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ emailSent: true });
  });

  it("does NOT include emailSent in the response when status is active", async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "active" },
    ]);

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "active" });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("emailSent");
  });

  it("returns 404 when client is not found", async () => {
    mockSelectLimit.mockResolvedValue([]); // client not found

    const res = await request(buildClientsApp())
      .patch(`/api/clients/nonexistent/referral-code`)
      .send({ status: "blocked" });

    expect(res.status).toBe(404);
    expect(dispatchReferralCodeSuspendedEmailMock).not.toHaveBeenCalled();
  });

  it("returns 400 when status is an invalid value", async () => {
    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "suspended" }); // not a valid enum value

    expect(res.status).toBe(400);
    expect(dispatchReferralCodeSuspendedEmailMock).not.toHaveBeenCalled();
  });

  it("still returns 200 and emailSent: false when the email dispatch throws", async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: FAKE_CLIENT.id, referralCodeStatus: "blocked" },
    ]);
    dispatchReferralCodeSuspendedEmailMock.mockRejectedValue(new Error("Resend API error"));

    const res = await request(buildClientsApp())
      .patch(`/api/clients/${FAKE_CLIENT.id}/referral-code`)
      .send({ status: "blocked" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ emailSent: false });
    expect(dispatchReferralCodeSuspendedEmailMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/clients/:clientId/referral — suspended attempt timestamp in response
// ---------------------------------------------------------------------------

describe("GET /api/clients/:clientId/referral — response shape", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(FAKE_USER as never);
    // referrals query: .orderBy() resolves to []
    // attemptLogs query: .orderBy().limit(20) also resolves to []
    mockSelectOrderBy.mockReturnValue(
      Object.assign(Promise.resolve([]), { limit: vi.fn().mockResolvedValue([]) }),
    );
  });

  it("includes referralSuspendedAttemptAt in the response", async () => {
    const suspendedAt = new Date("2026-06-01T12:00:00.000Z");
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_CLIENT, referralSuspendedAttemptAt: suspendedAt },
    ]);

    const res = await request(buildClientsApp())
      .get(`/api/clients/${FAKE_CLIENT.id}/referral`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("referralSuspendedAttemptAt");
    expect(res.body.referralSuspendedAttemptAt).toBe(suspendedAt.toISOString());
  });

  it("returns referralSuspendedAttemptAt: null when no suspended attempt was recorded", async () => {
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_CLIENT, referralSuspendedAttemptAt: null },
    ]);

    const res = await request(buildClientsApp())
      .get(`/api/clients/${FAKE_CLIENT.id}/referral`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("referralSuspendedAttemptAt", null);
  });

  it("includes referralSuspendedAttemptCount in the response", async () => {
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_CLIENT, referralSuspendedAttemptCount: 3 },
    ]);

    const res = await request(buildClientsApp())
      .get(`/api/clients/${FAKE_CLIENT.id}/referral`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("referralSuspendedAttemptCount", 3);
  });

  it("defaults referralSuspendedAttemptCount to 0 when unset", async () => {
    mockSelectLimit.mockResolvedValue([
      { ...FAKE_CLIENT, referralSuspendedAttemptCount: null },
    ]);

    const res = await request(buildClientsApp())
      .get(`/api/clients/${FAKE_CLIENT.id}/referral`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("referralSuspendedAttemptCount", 0);
  });
});
