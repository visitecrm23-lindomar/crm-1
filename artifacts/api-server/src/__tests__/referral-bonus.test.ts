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
// Hoisted: shared mutable state and mock factories (must precede vi.mock calls)
// ---------------------------------------------------------------------------

const { mockSendEmail, capturedUpdates, restoreUpdateMock } = vi.hoisted(() => {
  const mockSendEmail = vi.fn();
  const capturedUpdates: Array<{ set: Record<string, unknown> }> = [];

  // Build the update chain mock imperatively so we can restore it in beforeEach.
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockSet = vi.fn().mockImplementation((setArg: Record<string, unknown>) => {
    capturedUpdates.push({ set: setArg });
    return { where: mockWhere };
  });
  const mockUpdate = vi.fn().mockImplementation(() => ({ set: mockSet }));

  function restoreUpdateMock() {
    mockWhere.mockResolvedValue([]);
    mockSet.mockImplementation((setArg: Record<string, unknown>) => {
      capturedUpdates.push({ set: setArg });
      return { where: mockWhere };
    });
    mockUpdate.mockImplementation(() => ({ set: mockSet }));
  }

  return {
    mockSendEmail,
    capturedUpdates,
    restoreUpdateMock,
    // Expose individual mocks via the hoisted scope so the vi.mock factory can reference them.
    _mockUpdate: mockUpdate,
  };
});

// ---------------------------------------------------------------------------
// Module mocks — all resolved relative to src/__tests__/ when the module
// system resolves them, so bare-package names work as-is.
// ---------------------------------------------------------------------------

vi.mock("@workspace/email", () => ({
  sendReminderHtmlEmail: mockSendEmail,
}));

// The vi.hoisted return value is in scope here through the destructuring above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _hoisted = (globalThis as any).__vitest_hoisted__;
void _hoisted; // suppress unused warning

vi.mock("@workspace/db", async () => {
  // We can't reference the hoisted _mockUpdate directly due to vitest's
  // module isolation, so we reconstruct the update chain here with a thin
  // wrapper that delegates to capturedUpdates.
  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn().mockImplementation((setArg: Record<string, unknown>) => {
    capturedUpdates.push({ set: setArg });
    return { where: updateWhere };
  });
  const dbUpdate = vi.fn().mockImplementation(() => ({ set: updateSet }));

  // Export helpers so beforeEach can restore them.
  (globalThis as Record<string, unknown>).__mockDbUpdate__ = dbUpdate;
  (globalThis as Record<string, unknown>).__mockUpdateSet__ = updateSet;
  (globalThis as Record<string, unknown>).__mockUpdateWhere__ = updateWhere;

  return {
    db: {
      select: vi.fn(),
      update: dbUpdate,
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    },
    referralsTable: { id: "id", tenantId: "tenant_id", bonusPaid: "bonus_paid" },
    clientsTable: { id: "id", tenantId: "tenant_id" },
    tenantsTable: { id: "id" },
    referralSettingsTable: {},
    referralTrackingTable: {},
  };
});

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

// ADMIN_ROLES must include the actual role string used by ROLES.AGENCY_ADMIN ("agencia")
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
// Import router and shared mock handles AFTER vi.mock declarations
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import { db } from "@workspace/db";
import referralsRouter from "../routes/referrals.js";

// Convenience accessor for the db.select mock (typed)
const mockDbSelect = () => db.select as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Chain builder — wraps a fixed data array in a fully-chainable thenable.
// Supports: .from() .leftJoin() .where() .orderBy() .limit() .offset()
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(data: unknown[]): any {
  const p: Record<string, unknown> & { then: Promise<unknown[]>["then"] } = {
    then: (
      resolve: (v: unknown[]) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(data).then(resolve, reject),
  } as never;

  // All chain methods return themselves or a new chain with the same data.
  p.from = vi.fn().mockImplementation(() => makeChain(data));
  p.where = vi.fn().mockImplementation(() => makeChain(data));
  p.leftJoin = vi.fn().mockImplementation(() => makeChain(data));
  p.orderBy = vi.fn().mockImplementation(() => makeChain(data));
  p.offset = vi.fn().mockImplementation(() => makeChain(data));
  // .limit(n) is the common terminal: return a real promise so `await` works.
  p.limit = vi.fn().mockResolvedValue(data);

  return p;
}

// ---------------------------------------------------------------------------
// Express app builder
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // Attach a no-op pino-compatible logger (route handlers call req.log.error/warn)
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
  role: ROLES.AGENCY_ADMIN,   // "agencia"
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

/** makeReferral + the extra columns that come from the LEFT JOIN with clientsTable/tenantsTable */
function makeJoinedRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeReferral(overrides),
    referrerClientName: "Maria Live",
    referrerClientEmail: "maria@live.com",
    referrerClientWhatsapp: "11988887777",
    referrerClientPhone: "11999990001",
    tenantName: "Agência Teste",
  };
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedUpdates.length = 0;

  // vi.clearAllMocks() wipes implementations — restore the db.update chain.
  const dbUpdate = (globalThis as Record<string, unknown>).__mockDbUpdate__ as ReturnType<typeof vi.fn>;
  const updateSet = (globalThis as Record<string, unknown>).__mockUpdateSet__ as ReturnType<typeof vi.fn>;
  const updateWhere = (globalThis as Record<string, unknown>).__mockUpdateWhere__ as ReturnType<typeof vi.fn>;

  updateWhere.mockResolvedValue([]);
  updateSet.mockImplementation((setArg: Record<string, unknown>) => {
    capturedUpdates.push({ set: setArg });
    return { where: updateWhere };
  });
  dbUpdate.mockImplementation(() => ({ set: updateSet }));

  // Default email mock
  mockSendEmail.mockResolvedValue({ success: true, messageId: "msg-001" });
  restoreUpdateMock();
});

// ===========================================================================
// POST /api/referrals/:id/pay-bonus
// ===========================================================================

describe("POST /api/referrals/:id/pay-bonus", () => {
  it("marks bonusPaid=true and records bonusPaidAt for a completed, unpaid referral", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const row = makeJoinedRow();
    const updated = makeJoinedRow({ bonusPaid: true, bonusPaidAt: new Date() });

    mockDbSelect()
      .mockImplementationOnce(() => makeChain([row]))      // fetch before update
      .mockImplementationOnce(() => makeChain([updated])); // re-fetch after update

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set).toMatchObject({ bonusPaid: true });
    expect(capturedUpdates[0].set.bonusPaidAt).toBeInstanceOf(Date);
    expect(capturedUpdates[0].set.updatedAt).toBeInstanceOf(Date);
  });

  it("returns 422 when bonus has already been paid (double-payment guard)", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const alreadyPaid = makeJoinedRow({ bonusPaid: true, bonusPaidAt: new Date() });
    mockDbSelect().mockImplementationOnce(() => makeChain([alreadyPaid]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/já foi pago/i);
    expect(capturedUpdates).toHaveLength(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 422 when referral status is not 'completed'", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const pending = makeJoinedRow({ status: "pending", bonusPaid: false });
    mockDbSelect().mockImplementationOnce(() => makeChain([pending]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/convertidas/i);
    expect(capturedUpdates).toHaveLength(0);
  });

  it("calls sendReminderHtmlEmail using the live JOIN email (clientsTable) as recipient", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const row = makeJoinedRow(); // live email: "maria@live.com", stored: "maria@stored.com"
    const updated = makeJoinedRow({ bonusPaid: true });
    mockDbSelect()
      .mockImplementationOnce(() => makeChain([row]))
      .mockImplementationOnce(() => makeChain([updated]));

    await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const args = mockSendEmail.mock.calls[0][0] as Record<string, string>;
    // Must use the LIVE email from clientsTable, not the stored snapshot
    expect(args.to).toBe("maria@live.com");
    expect(args.fromName).toBe("Agência Teste");
    // HTML must include the bonus amount
    expect(args.html).toContain("50,00");
  });

  it("skips email when both live and stored referrerEmail are null", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    const row = makeJoinedRow({ referrerEmail: null, referrerClientEmail: null });
    const updated = makeJoinedRow({ bonusPaid: true, referrerEmail: null, referrerClientEmail: null });
    mockDbSelect()
      .mockImplementationOnce(() => makeChain([row]))
      .mockImplementationOnce(() => makeChain([updated]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
    // DB update must still happen
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set.bonusPaid).toBe(true);
  });

  it("still marks bonus as paid even when email dispatch throws", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);
    mockSendEmail.mockRejectedValueOnce(new Error("SMTP connection refused"));

    const row = makeJoinedRow();
    const updated = makeJoinedRow({ bonusPaid: true });
    mockDbSelect()
      .mockImplementationOnce(() => makeChain([row]))
      .mockImplementationOnce(() => makeChain([updated]));

    const res = await request(buildApp()).post("/api/referrals/ref-001/pay-bonus").send();

    expect(res.status).toBe(200);
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].set.bonusPaid).toBe(true);
  });

  it("returns 404 when the referral does not exist", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    mockDbSelect().mockImplementationOnce(() => makeChain([])); // empty result

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

    const row = makeJoinedRow();
    const updated = makeJoinedRow({ bonusPaid: true });
    mockDbSelect()
      .mockImplementationOnce(() => makeChain([row]))
      .mockImplementationOnce(() => makeChain([updated]));

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
// GET /api/referrals — JOIN enrichment
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

    mockDbSelect()
      .mockImplementationOnce(() => makeChain([{ total: "1" }])) // count
      .mockImplementationOnce(() => makeChain([enrichedRow]));    // data

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const items: Record<string, unknown>[] = res.body.data ?? res.body;
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

    mockDbSelect()
      .mockImplementationOnce(() => makeChain([{ total: "1" }]))
      .mockImplementationOnce(() => makeChain([enrichedRow]));

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const item = (res.body.data ?? res.body)[0] as Record<string, unknown>;
    // Live data from JOIN must override the stored snapshot
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

    mockDbSelect()
      .mockImplementationOnce(() => makeChain([{ total: "1" }]))
      .mockImplementationOnce(() => makeChain([noJoinRow]));

    const res = await request(buildApp()).get("/api/referrals").send();

    expect(res.status).toBe(200);
    const item = (res.body.data ?? res.body)[0] as Record<string, unknown>;
    expect(item.referrerName).toBe("Fallback Armazenado");
    expect(item.referrerEmail).toBe("stored@fallback.com");
    expect(item.referrerPhone).toBe("11911112222");
    expect(item.referrerWhatsapp).toBeNull();
  });

  it("returns correct pagination metadata from the count query", async () => {
    (requireAuth as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_ADMIN);

    mockDbSelect()
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
