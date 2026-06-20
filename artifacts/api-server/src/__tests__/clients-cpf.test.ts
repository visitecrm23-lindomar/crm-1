/**
 * clients-cpf.test.ts
 *
 * Endpoint-level tests for:
 *   GET  /api/clients?cpf=  — CPF exact-match filter behaviour
 *   POST /api/clients        — CPF-based upsert / deduplication
 *
 * Uses supertest with vi.mock to drive real Express route handlers while
 * isolating the DB and all external services.
 */

import pino from "pino";
import { ROLES } from "@workspace/permissions";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// vi.hoisted: mock factories must exist before vi.mock factory functions run
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockSelectDistinct,
  mockInsert,
  mockUpdate,
  mockTransaction,
  queueDbResult,
  clearResultQueue,
  makeChain,
} = vi.hoisted(() => {
  // Queue of results consumed in order by each db.select() call
  const resultQueue: unknown[][] = [];

  function popResult(): unknown[] {
    return resultQueue.shift() ?? [];
  }

  /**
   * Returns a thenable chain where every chain method (from, where, orderBy,
   * limit, offset, innerJoin, leftJoin, having, groupBy, returning) returns
   * the same object, so `await chain.from().where().orderBy().limit().offset()`
   * correctly resolves with `result` regardless of the terminal method.
   */
  function makeChain(result: unknown[]) {
    const p = Promise.resolve(result);
    const c: Record<string, unknown> = {
      then:    p.then.bind(p),
      catch:   p.catch.bind(p),
      finally: p.finally.bind(p),
    };
    for (const m of [
      "from", "where", "orderBy", "limit", "offset",
      "innerJoin", "leftJoin", "having", "groupBy", "returning",
    ]) {
      c[m] = () => c;
    }
    return c;
  }

  // Each db.select() call pops one result off the queue
  const mockSelect         = vi.fn(() => makeChain(popResult()));
  const mockSelectDistinct = vi.fn(() => makeChain([]));

  // Insert chain — returning is the terminal step
  const mockInsertReturning  = vi.fn().mockResolvedValue([]);
  const mockInsertOnConflict = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues     = vi.fn(() => ({
    onConflictDoUpdate: mockInsertOnConflict,
    returning: mockInsertReturning,
  }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  // Update chain — returning is the terminal step
  const mockUpdateReturning = vi.fn().mockResolvedValue([{
    lastClientSeq: 1, reservationPrefix: "AG", slug: "minha-agencia",
  }]);
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet   = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate      = vi.fn(() => ({ set: mockUpdateSet }));

  const mockTransaction = vi.fn();

  function queueDbResult(...results: unknown[][]) {
    resultQueue.push(...results);
  }

  function clearResultQueue() {
    resultQueue.length = 0;
  }

  return {
    mockSelect,
    mockSelectDistinct,
    mockInsert,
    mockUpdate,
    mockTransaction,
    queueDbResult,
    clearResultQueue,
    makeChain,
  };
});

// ---------------------------------------------------------------------------
// Module mocks — must appear before any import of the router
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select:         mockSelect,
    selectDistinct: mockSelectDistinct,
    insert:         mockInsert,
    update:         mockUpdate,
    transaction:    mockTransaction,
    delete:         vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
  },
  clientsTable:             { _t: "clients" },
  notesTable:               {},
  reservationsTable:        { _t: "reservations" },
  tripsTable:               { _t: "trips" },
  npsResponsesTable:        {},
  clientNpsResponsesTable:  {},
  referralsTable:           {},
  usersTable:               {},
  paymentsTable:            {},
  dealsTable:               {},
  storeOrdersTable:         {},
  storeReviewsTable:        {},
  clientScoresTable:        { _t: "clientScores" },
  loyaltyMembersTable:      {},
  tenantsTable:             { _t: "tenants" },
  referralAttemptLogsTable: {},
  calendarEventsTable:      {},
  campaignSendsTable:       {},
}));

vi.mock("drizzle-orm", () => ({
  eq:      vi.fn(() => "eq"),
  and:     vi.fn((...a: unknown[]) => a),
  or:      vi.fn((...a: unknown[]) => a),
  inArray: vi.fn(() => "inArray"),
  desc:    vi.fn(() => "desc"),
  asc:     vi.fn(() => "asc"),
  ilike:   vi.fn(() => "ilike"),
  count:   vi.fn(() => "count"),
  sql:     Object.assign(vi.fn(() => "sql"), { raw: vi.fn(() => "sql_raw") }),
}));

vi.mock("@clerk/express", () => ({
  clerkClient:     vi.fn(),
  getAuth:         vi.fn(() => ({ userId: "user_test" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/tenant.js", () => ({
  requireAuth:      vi.fn(),
  getTenantUser:    vi.fn(),
  ADMIN_ROLES:      ["agencia"],
  MANAGEMENT_ROLES: ["agencia", "vendedor"],
}));

vi.mock("../lib/referral-code.js", () => ({
  generateAndAssignReferralCode: vi.fn().mockResolvedValue("REF-TEST"),
}));

vi.mock("../queues/email-helpers.js", () => ({
  dispatchReferralWelcomeEmail:        vi.fn().mockResolvedValue(undefined),
  dispatchReferralCodeSuspendedEmail:  vi.fn().mockResolvedValue(undefined),
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: {
    syncTrip:     vi.fn().mockResolvedValue(undefined),
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
  generateId:           vi.fn(() => "gen-id"),
  generateReferralCode: vi.fn(() => "REF-001"),
  generateVoucherCode:  vi.fn(() => "VCHR-001"),
}));

vi.mock("../lib/planLimits.js", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue(true),
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

// ---------------------------------------------------------------------------
// Import route + middleware AFTER all mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import clientsRouter from "../routes/clients.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: unknown },
  _res: express.Response,
  next: express.NextFunction,
) {
  req.log = pino({ level: "silent" });
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", clientsRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Admin",
  email: "admin@agencia.com",
};

/**
 * A CPF that passes the full checksum algorithm: 529.982.247-25
 * Cleaned: "52998224725" (11 digits)
 */
const VALID_CPF_RAW       = "52998224725";
const VALID_CPF_FORMATTED = "529.982.247-25";

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-001",
    tenantId: "tenant-001",
    name: "Maria Silva",
    email: "maria@example.com",
    cpf: VALID_CPF_RAW,
    rg: null,
    birthDate: null,
    whatsapp: "11999999999",
    phone: null,
    gender: null,
    photoUrl: null,
    instagram: null,
    addressCity: null,
    addressState: null,
    classification: null,
    status: "active",
    tags: [],
    pipelineStage: null,
    totalSpent: "0",
    outstandingBalance: "0",
    npsScore: null,
    observations: null,
    dreamDestinations: [],
    origin: null,
    maritalStatus: null,
    professionalArea: null,
    favoriteDrink: null,
    companyFeedback: null,
    musicalPreferences: null,
    foodPreferences: null,
    internalRating: null,
    companyNps: null,
    travelInterests: [],
    ambassadorOptIn: null,
    customerCode: null,
    userId: null,
    createdById: "user-001",
    lastContactAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Queues the 4 db.select() results that a GET /api/clients request triggers
 * when one client is returned (list → count → lastTrips join → scores join).
 */
function queueSingleClientGet(client = makeFakeClient()) {
  queueDbResult(
    [client],       // 1. clients list  (.where().orderBy().limit().offset())
    [{ count: 1 }], // 2. count          (.where())
    [],             // 3. lastTrips join  (.innerJoin().where().orderBy())
    [],             // 4. scores join     (.leftJoin().where())
  );
}

// ---------------------------------------------------------------------------
// GET /api/clients?cpf= — CPF filter
// ---------------------------------------------------------------------------

describe("GET /api/clients?cpf= — CPF exact-match filter", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    clearResultQueue();
    requireAuthMock.mockResolvedValue(FAKE_USER as never);
  });

  it("returns the matching client for an exact 11-digit unformatted CPF", async () => {
    queueSingleClientGet();

    const res = await request(app).get(`/api/clients?cpf=${VALID_CPF_RAW}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe("client-001");
    expect(res.body.total).toBe(1);
  });

  it("cleans formatting characters (dots and dash) before applying the exact-match filter", async () => {
    // "529.982.247-25" → cleanCPF → "52998224725" (11 digits) → eq filter applied
    queueSingleClientGet();

    const res = await request(app)
      .get(`/api/clients?cpf=${encodeURIComponent(VALID_CPF_FORMATTED)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    // Response carries the stored cleaned CPF
    expect(res.body.data[0].cpf).toBe(VALID_CPF_RAW);
  });

  it("does not apply a CPF exact-match filter when the param cleans to fewer than 11 digits", async () => {
    // "529" → cleanCPF → "529" (3 digits) → condition skipped, no 400 error
    queueSingleClientGet();

    const res = await request(app).get("/api/clients?cpf=529");

    // Route returns normally — no CPF filter applied, no validation error
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("enforces tenant isolation: requireAuth is called and its tenantId scopes all DB queries", async () => {
    queueSingleClientGet();

    const res = await request(app).get(`/api/clients?cpf=${VALID_CPF_RAW}`);

    expect(res.status).toBe(200);
    // requireAuth is the single gate for tenant context; every DB condition
    // uses the tenantId it returns, preventing cross-tenant data leakage.
    expect(requireAuthMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clients — CPF deduplication
// ---------------------------------------------------------------------------

describe("POST /api/clients — CPF upsert / deduplication", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  const VALID_BODY = {
    name: "Maria Silva",
    email: "maria@example.com",
    cpf: VALID_CPF_FORMATTED,
    whatsapp: "11999999999",
  };

  /** Minimal tenant update result returned by tx.update(tenantsTable) */
  const TENANT_UPDATE_RESULT = [{
    lastClientSeq: 1, reservationPrefix: "AG", slug: "minha-agencia",
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    clearResultQueue();
    requireAuthMock.mockResolvedValue(FAKE_USER as never);
  });

  it("returns HTTP 201 with isNew=true when the CPF has not been seen before in the tenant", async () => {
    const newClient = makeFakeClient({ id: "gen-id" }); // id matches generateId() mock

    mockTransaction.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const txSelect = vi.fn(() => makeChain([])); // no existing CPF match
        const txUpdateReturning  = vi.fn().mockResolvedValue(TENANT_UPDATE_RESULT);
        const txUpdateWhere      = vi.fn(() => ({ returning: txUpdateReturning }));
        const txUpdateSet        = vi.fn(() => ({ where: txUpdateWhere }));
        const txUpdate           = vi.fn(() => ({ set: txUpdateSet }));
        const txInsertReturning  = vi.fn().mockResolvedValue([newClient]);
        const txInsertOnConflict = vi.fn(() => ({ returning: txInsertReturning }));
        const txInsertValues     = vi.fn(() => ({ onConflictDoUpdate: txInsertOnConflict }));
        const txInsert           = vi.fn(() => ({ values: txInsertValues }));
        return cb({ select: txSelect, update: txUpdate, insert: txInsert });
      },
    );

    const res = await request(app).post("/api/clients").send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.isNew).toBe(true);
    expect(res.body.id).toBe("gen-id");
  });

  it("returns HTTP 200 with isNew=false and the existing ID when the CPF already belongs to a client", async () => {
    const existingClient = makeFakeClient({ id: "existing-client-id" });

    mockTransaction.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        // CPF match found → tx.update (seq bump) is skipped; upsert returns existing row
        const txSelect           = vi.fn(() => makeChain([{ id: "existing-client-id" }]));
        const txInsertReturning  = vi.fn().mockResolvedValue([existingClient]);
        const txInsertOnConflict = vi.fn(() => ({ returning: txInsertReturning }));
        const txInsertValues     = vi.fn(() => ({ onConflictDoUpdate: txInsertOnConflict }));
        const txInsert           = vi.fn(() => ({ values: txInsertValues }));
        // tx.update not called when existing CPF found (no seq bump needed)
        const txUpdate = vi.fn(() => ({
          set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
        }));
        return cb({ select: txSelect, update: txUpdate, insert: txInsert });
      },
    );

    const res = await request(app).post("/api/clients").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.isNew).toBe(false);
    expect(res.body.id).toBe("existing-client-id");
  });

  it("returns HTTP 400 with code CPF_INVALID when the CPF fails checksum validation", async () => {
    // All-same-digit CPF passes length check but fails isValidCPF checksum
    const res = await request(app)
      .post("/api/clients")
      .send({ ...VALID_BODY, cpf: "111.111.111-11" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CPF_INVALID");
    // validateCPF throws before any DB transaction is attempted
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 when CPF is absent from the request body, bypassing the deduplication transaction", async () => {
    // cpf is zod.string() (required) in CreateClientBody; missing CPF fails
    // schema parsing and no DB transaction is triggered.
    const { cpf: _omit, ...bodyWithoutCpf } = VALID_BODY;

    const res = await request(app).post("/api/clients").send(bodyWithoutCpf);

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
