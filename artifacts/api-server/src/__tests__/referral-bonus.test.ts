/**
 * Tests for referral bonus payment and JOIN-enriched GET /referrals.
 *
 * Covers:
 *  POST /api/referrals/:id/pay-bonus
 *    - marks bonusPaid=true and sets bonusPaidAt
 *    - returns 422 when bonusPaid is already true (idempotency guard)
 *    - returns 422 when status !== "completed"
 *    - calls sendReminderHtmlEmail with live JOIN email when present
 *    - skips email silently when referrerEmail is null
 *    - still pays bonus even when email dispatch fails
 *    - returns 403 for non-admin users
 *    - returns 404 when referral not found
 *    - response strips internal JOIN fields and merges live data
 *
 *  GET /api/referrals
 *    - referrerWhatsapp comes from clientsTable JOIN
 *    - referrerEmail overridden by live clientsTable.email
 *    - falls back to stored fields when JOIN misses (null referrerClient*)
 *    - returns pagination metadata
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { ROLES } from "@workspace/permissions";

// ---------------------------------------------------------------------------
// Hoisted: shared mock state — must exist before vi.mock factories run.
// Only genuinely shared objects live here (send-email spy, captured updates,
// and the db.update chain whose references must be stable across modules).
// ---------------------------------------------------------------------------

const { mockSendEmail, capturedUpdates, updateMocks } = vi.hoisted(() => {
  const capturedUpdates: Array<{ set: Record<string, unknown> }> = [];

  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn().mockImplementation((setArg: Record<string, unknown>) => {
    capturedUpdates.push({ set: setArg });
    return { where: updateWhere };
  });
  const update = vi.fn().mockImplementation(() => ({ set: updateSet }));

  return {
    mockSendEmail: vi.fn(),
    capturedUpdates,
    updateMocks: { update, set: updateSet, where: updateWhere },
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/email", () => ({
  sendReminderHtmlEmail: mockSendEmail,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    update: updateMocks.update,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
  },
  referralsTable: { id: "id", tenantId: "tenant_id", bonusPaid: "bonus_paid" },
  clientsTable: { id: "id", tenantId: "tenant_id" },
  tenantsTable: { id: "id" },
  referralSettingsTable: {},
  referralTrackingTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...a: unknown[]) => a),
  or: vi.fn((...a: unknown[]) => a),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
  ilike: vi.fn(() => "ilike"),
  count: vi.fn(() => "count"),
  sql: Object.assign(vi.fn(() => "sql"), { raw: vi.fn() }),
  getTableColumns: vi.fn(() => ({})),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: vi.fn(),
  getAuth: vi.fn(() => ({ userId: "user-test" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ADMIN_ROLES must contain the actual string values used by ROLES.AGENCY_ADMIN ("agencia")
vi.mock("../lib/tenant.js", () => ({
  requireAuth: vi.fn(),
  ADMIN_ROLES: [ROLES.AGENCY_ADMIN, ROLES.SUPER_ADMIN],
  MANAGEMENT_ROLES: [ROLES.AGENCY_ADMIN, ROLES.SUPER_ADMIN],
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
}));

// ---------------------------------------------------------------------------
// Import router and mock handles AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import { db } from "@workspace/db";
import referralsRouter from "../routes/referrals.js";

// ---------------------------------------------------------------------------
// Chain builder — wraps a fixed data array in a fully-chainable thenable.
//
// Every method returns a fresh makeChain(data) so any sequence of calls
// (including .limit(n).offset(n)) stays chainable and correctly awaitable.
// The object is also thenable so `await chain.from().where()` works without
// a terminal call.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(data: unknown[]): any {
  const chain: Record<string, unknown> = {
    then: (
      resolve: (v: unknown[]) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(data).then(resolve, reject),
  };
  chain.from = vi.fn().mockImplementation(() => makeChain(data));
  chain.where = vi.fn().mockImplementation(() => makeChain(data));
  chain.leftJoin = vi.fn().mockImplementation(() => makeChain(data));
  chain.orderBy = vi.fn().mockImplementation(() => makeChain(data));
  chain.limit = vi.fn().mockImplementation(() => makeChain(data));
  chain.offset = vi.fn().mockImplementation(() => makeChain(data));
  return chain;
}

// ---------------------------------------------------------------------------
// Express app builder
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    (
      req: express.Request & { log?: Record<string, unknown> },
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      const noop = (..._args: unknown[]) => {};
      req.log = {
        trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
      } as never;
      next();
    },
  );
  app.use("/api", referralsRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const FAKE_ADMIN = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Admin Teste",
  email: "admin@agencia.com",
};

const FAKE_VIEWER = {
  id: "user-002",
  tenantId: "tenant-001",
  role: "viewer",
  name: "Viewer",
  email: "viewer@agencia.com",
};

function makeReferral(overrides: Record<string, unknown> = {}) {
  return {
    id: "ref-001",
    tenantId: "tenant-001",
    referrerId: "client-001",
    referredId: "client-002",
    referredEmail: "indicado@example.com",
    referredName: "José Indicado",
    referrerName: "Maria Stored",
    referrerEmail: "maria@stored.com",
    referrerPhone: "11999990000",
    code: "MARIA2026",
    status: "completed",
    bonusPaid: false,
    bonusPaidAt: null,
    bonusAmount: "50.00",
    discountValue: "5",
    discountAmount: "25.00",
    discountApplied: true,
    discountType: "percentage",
    visitsCount: 3,
    lastVisit: null,
    convertedAt: new Date("2026-01-15"),
    expiresAt: new Date("2026-12-31"),
    isActive: true,
    notes: null,
    utmSource: null, utmMedium: null, utmCampaign: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-15"),
    ...overrides,
  };
}

/**
 * Row returned by the initial fetch in pay-bonus (joins clientsTable +
 * tenantsTable). Overrides are applied last to allow per-test customisation
 * of any field, including the JOIN columns.
 */
function makeJoinedRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeReferral(),
    referrerClientName: "Maria Live",
    referrerClientEmail: "maria@live.com",
    referrerClientWhatsapp: "11988887777",
    referrerClientPhone: "11999990001",
    tenantName: "Agência Teste",
    ...overrides,
  };
}

/**
 * Row returned by the re-fetch after the bonus update. The route's re-fetch
 * only joins clientsTable (not tenantsTable), so tenantName is absent.
 */
function makeRefetchRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeReferral(),
    referrerClientName: "Maria Live",
    referrerClientEmail: "maria@live.com",
    referrerClientWhatsapp: "11988887777",
    referrerClientPhone: "11999990001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedUpdates.length = 0;

  // vi.clearAllMocks() clears implementations — restore the update chain.
  updateMocks.where.mockResolvedValue([]);
  updateMocks.set.mockImplementation((setArg: Record<string, unknown>) => {
    capturedUpdates.push({ set: setArg });
    return { where: updateMocks.where };
  });
  updateMocks.update.mockImplementation(() => ({ set: updateMocks.set }));

  mockSendEmail.mockResolvedValue({ success: true, messageId: "msg-001" });
});

// ===========================================================================
// POST /api/referrals/:id/pay-bonus
// ===========================================================================

describe("POST /api/referrals/:id/pay-bonus", () => {
  it("marks bonusPaid=true and records bonusPaidAt for a completed, unpaid referral", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const mockSelect = db.select as ReturnType<typeof vi.fn>;
    mockSelect
      .mockImplementationOnce(() => makeChain([makeJoinedRow()]))
      .mockImplementationOnce(() => makeChain([makeRefetchRow({ bonusPaid: true, bonusPaidAt: new Date() })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set).toMatchObject({ bonusPaid: true });
    expect(capturedUpdates[0].set.bonusPaidAt).toBeInstanceOf(Date);
    expect(capturedUpdates[0].set.updatedAt).toBeInstanceOf(Date);
  });

  it("returns 422 when bonus has already been paid (double-payment guard)", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow({ bonusPaid: true, bonusPaidAt: new Date() })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/já foi pago/i);
    expect(capturedUpdates).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 422 when referral status is not 'completed'", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow({ status: "pending", bonusPaid: false })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/convertidas/i);
    expect(capturedUpdates).toHaveLength(0);
  });

  it("calls sendReminderHtmlEmail using the live JOIN email (clientsTable) as recipient", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow()]))
      .mockImplementationOnce(() => makeChain([makeRefetchRow({ bonusPaid: true })]));

    await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const args = mockSendEmail.mock.calls[0][0] as Record<string, string>;
    // Must use the LIVE email from clientsTable, not the stored snapshot
    expect(args.to).toBe("maria@live.com");
    expect(args.fromName).toBe("Agência Teste");
    expect(args.html).toContain("50,00");
  });

  it("skips email when both live and stored referrerEmail are null", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow({ referrerEmail: null, referrerClientEmail: null })]))
      .mockImplementationOnce(() => makeChain([makeRefetchRow({ bonusPaid: true, referrerEmail: null, referrerClientEmail: null })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set.bonusPaid).toBe(true);
  });

  it("still marks bonus as paid even when email dispatch throws", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP connection refused"));

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow()]))
      .mockImplementationOnce(() => makeChain([makeRefetchRow({ bonusPaid: true })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set.bonusPaid).toBe(true);
  });

  it("returns 404 when the referral does not exist", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([]));

    const res = await request(buildApp()).post("/api/referrals/nonexistent/pay-bonus").send();

    expect(res.status).toBe(404);
    expect(capturedUpdates).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when caller role is not in ADMIN_ROLES", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_VIEWER);

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(403);
    expect(capturedUpdates).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("response merges live JOIN data and strips internal JOIN columns", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([makeJoinedRow()]))
      .mockImplementationOnce(() => makeChain([makeRefetchRow({ bonusPaid: true })]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    // Live data from clientsTable JOIN must override stored snapshot
    expect(res.body.referrerName).toBe("Maria Live");
    expect(res.body.referrerEmail).toBe("maria@live.com");
    expect(res.body.referrerWhatsapp).toBe("11988887777");
    // Internal JOIN helpers must NOT be leaked in the response
    expect(res.body).not.toHaveProperty("referrerClientName");
    expect(res.body).not.toHaveProperty("referrerClientEmail");
    expect(res.body).not.toHaveProperty("referrerClientWhatsapp");
    expect(res.body).not.toHaveProperty("referrerClientPhone");
    expect(res.body).not.toHaveProperty("tenantName");
  });
});

// ===========================================================================
// GET /api/referrals — clientsTable JOIN enrichment
// ===========================================================================

describe("GET /api/referrals — clientsTable JOIN enrichment", () => {
  it("referrerWhatsapp in response comes from clientsTable via JOIN (not a stored column)", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const enrichedRow = {
      ...makeReferral(),
      referrerClientName: "Maria Live",
      referrerClientEmail: "maria@live.com",
      referrerClientWhatsapp: "11977776666",
      referrerClientPhone: "11988880000",
    };

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([{ total: "1" }]))
      .mockImplementationOnce(() => makeChain([enrichedRow]));

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const items = (res.body.data ?? res.body) as Record<string, unknown>[];
    expect(Array.isArray(items)).toBe(true);
    const item = items[0];

    expect(item.referrerWhatsapp).toBe("11977776666");
    expect(item).not.toHaveProperty("referrerClientWhatsapp");
    expect(item).not.toHaveProperty("referrerClientName");
    expect(item).not.toHaveProperty("referrerClientEmail");
    expect(item).not.toHaveProperty("referrerClientPhone");
  });

  it("referrerEmail and referrerName are overridden by live clientsTable values when JOIN matches", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const enrichedRow = {
      ...makeReferral({ referrerEmail: "stale@old.com", referrerName: "Nome Antigo" }),
      referrerClientName: "Nome Novo",
      referrerClientEmail: "novo@live.com",
      referrerClientWhatsapp: null,
      referrerClientPhone: null,
    };

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([{ total: "1" }]))
      .mockImplementationOnce(() => makeChain([enrichedRow]));

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const item = ((res.body.data ?? res.body) as Record<string, unknown>[])[0];
    expect(item.referrerEmail).toBe("novo@live.com");
    expect(item.referrerName).toBe("Nome Novo");
  });

  it("falls back to stored snapshot fields when the JOIN misses (null client columns)", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const noJoinRow = {
      ...makeReferral({
        referrerName: "Fallback Armazenado",
        referrerEmail: "stored@fallback.com",
        referrerPhone: "11911112222",
      }),
      referrerClientName: null,
      referrerClientEmail: null,
      referrerClientWhatsapp: null,
      referrerClientPhone: null,
    };

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([{ total: "1" }]))
      .mockImplementationOnce(() => makeChain([noJoinRow]));

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const item = ((res.body.data ?? res.body) as Record<string, unknown>[])[0];
    expect(item.referrerName).toBe("Fallback Armazenado");
    expect(item.referrerEmail).toBe("stored@fallback.com");
    expect(item.referrerPhone).toBe("11911112222");
    expect(item.referrerWhatsapp).toBeNull();
  });

  it("returns correct pagination metadata from the count query", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    (db.select as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => makeChain([{ total: "42" }]))
      .mockImplementationOnce(() => makeChain([]));

    const res = await request(buildApp()).get("/api/referrals?page=2&limit=10").send();

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      limit: 10,
      total: 42,
      totalPages: 5,
    });
  });
});
