/**
 * Endpoint-level tests for the duplicate client detection and merge flow:
 *   GET  /api/clients/duplicates
 *   POST /api/clients/:id/merge
 *
 * Uses supertest with vi.mock to drive real Express route handlers while
 * isolating the DB and all external services.
 */

import pino from "pino";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// vi.hoisted: shared mock builders must exist before any vi.mock factory runs
// ---------------------------------------------------------------------------

const {
  mockHaving,
  mockGroupBy,
  mockOrderBy,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
  mockTransaction,
  mockUpdate,
  mockInsert,
  mockInsertValues,
  capturedInsertValues,
} = vi.hoisted(() => {
  const capturedInsertValues: Record<string, unknown>[] = [];

  // Terminal mocks (awaitable query results)
  const mockHaving = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();

  // Intermediate chain
  const mockGroupBy = vi.fn(() => ({ having: mockHaving }));
  const mockWhere = vi.fn(() => ({
    limit: mockLimit,
    groupBy: mockGroupBy,
    orderBy: mockOrderBy,
  }));
  const mockFrom = vi.fn(() => ({
    where: mockWhere,
    limit: mockLimit,
    orderBy: mockOrderBy,
  }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  const mockTransaction = vi.fn();

  // db.update(...).set(...).where(...) — returns a resolved promise
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  // db.insert(...).values(...) — captures values for assertion
  const mockInsertValues = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
    capturedInsertValues.push(vals);
    return Promise.resolve([]);
  });
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  return {
    mockHaving,
    mockGroupBy,
    mockOrderBy,
    mockLimit,
    mockWhere,
    mockFrom,
    mockSelect,
    mockTransaction,
    mockUpdate,
    mockInsert,
    mockInsertValues,
    capturedInsertValues,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    transaction: mockTransaction,
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
  referralAttemptLogsTable: {},
  calendarEventsTable: {},
  campaignSendsTable: {},
  clientNpsResponsesTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...a: unknown[]) => a),
  or: vi.fn((...a: unknown[]) => a),
  inArray: vi.fn(() => "inArray"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
  ilike: vi.fn(() => "ilike"),
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
  ADMIN_ROLES: ["admin"],
  MANAGEMENT_ROLES: ["admin", "manager"],
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "note-gen-id"),
  generateReferralCode: vi.fn(() => "REF-001"),
  generateVoucherCode: vi.fn(() => "VCHR-001"),
}));

vi.mock("../lib/referral-code.js", () => ({
  generateAndAssignReferralCode: vi.fn().mockResolvedValue("REF-001"),
}));

vi.mock("../queues/email-helpers.js", () => ({
  dispatchReferralWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  dispatchReferralCodeSuspendedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/cpf.js", () => ({
  validateCPF: vi.fn(() => true),
  cleanCPF: vi.fn((v: string) => v),
}));

vi.mock("../lib/planLimits.js", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../lib/client-scores.js", () => ({
  calculateScoresForClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/redis.js", () => ({
  getRedisConnection: vi.fn(() => null),
}));

vi.mock("../lib/ai-client.js", () => ({
  getAIClientForTenant: vi.fn(() => null),
}));

vi.mock("../lib/activities.js", () => ({
  writeClientActivity: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import router and error handler AFTER all mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import clientsRouter from "../routes/clients.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  req.log = pino({ level: "silent" }) as unknown as typeof req.log;
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

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ADMIN_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: "admin",
  name: "Admin User",
  email: "admin@example.com",
};

const NON_ADMIN_USER = {
  id: "user-002",
  tenantId: "tenant-001",
  role: "vendedor",
  name: "Vendedor",
  email: "seller@example.com",
};

function makeFakeClient(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "client-001",
    tenantId: "tenant-001",
    name: "Maria Silva",
    email: "maria@example.com",
    whatsapp: "+5511999999999",
    phone: null,
    cpf: "11111111100",
    rg: null,
    birthDate: null,
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
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    lastContactAt: null,
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
    referralCode: null,
    referralSource: null,
    loyaltyPoints: null,
    sellerUserId: null,
    ...overrides,
  };
}

const PRIMARY = makeFakeClient({ id: "client-001", name: "Maria Silva" });
const SECONDARY = makeFakeClient({ id: "client-002", name: "Maria Silva Duplicada", cpf: "11111111100" });
const SECONDARY_MERGED = makeFakeClient({ id: "client-002", status: "merged" });

// ---------------------------------------------------------------------------
// tx mock builder (includes delete, update, insert)
// ---------------------------------------------------------------------------

function buildTxMock() {
  const txWhere = vi.fn().mockResolvedValue([]);
  const txUpdateSet = vi.fn(() => ({ where: txWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txDeleteWhere = vi.fn().mockResolvedValue([]);
  const txDelete = vi.fn(() => ({ where: txDeleteWhere }));
  const txInsertValues = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
    capturedInsertValues.push(vals);
    return Promise.resolve([]);
  });
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  return { update: txUpdate, delete: txDelete, insert: txInsert };
}

// ---------------------------------------------------------------------------
// Tests: GET /api/clients/duplicates
// ---------------------------------------------------------------------------

describe("GET /api/clients/duplicates — duplicate detection", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    capturedInsertValues.length = 0;
    // Rebuild mock chain after clearAllMocks
    mockWhere.mockReturnValue({ limit: mockLimit, groupBy: mockGroupBy, orderBy: mockOrderBy });
    mockGroupBy.mockReturnValue({ having: mockHaving });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit, orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: mockFrom });
    requireAuthMock.mockResolvedValue(ADMIN_USER as never);
  });

  it("returns 403 when the caller is not an admin", async () => {
    const app = buildApp();
    requireAuthMock.mockResolvedValue(NON_ADMIN_USER as never);
    const res = await request(app).get("/api/clients/duplicates");
    expect(res.status).toBe(403);
  });

  it("returns empty pairs when no duplicates exist", async () => {
    const app = buildApp();
    // CPF group query → no groups
    mockHaving.mockResolvedValueOnce([]);
    // name+WA group query → no groups
    mockHaving.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/clients/duplicates");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pairs: [], total: 0 });
  });

  it("returns a CPF duplicate pair when two clients share the same CPF", async () => {
    const app = buildApp();
    const client1 = makeFakeClient({ id: "c-001", cpf: "11111111100" });
    const client2 = makeFakeClient({ id: "c-002", cpf: "11111111100", name: "Maria S. Duplicada" });

    // CPF group query → one CPF group
    mockHaving.mockResolvedValueOnce([{ cpf: "11111111100" }]);
    // Fetch the duplicate clients by CPF
    mockOrderBy.mockResolvedValueOnce([client1, client2]);
    // name+WA group query → no groups
    mockHaving.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/clients/duplicates");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.pairs).toHaveLength(1);
    expect(res.body.pairs[0].reason).toBe("cpf");
    expect(res.body.pairs[0].clients).toHaveLength(2);
    expect(res.body.pairs[0].clients[0].id).toBe("c-001");
    expect(res.body.pairs[0].clients[1].id).toBe("c-002");
  });

  it("returns a name+whatsapp duplicate pair when clients share the same name and whatsapp", async () => {
    const app = buildApp();
    const client3 = makeFakeClient({ id: "c-003", cpf: null, name: "João Costa", whatsapp: "+5511888888888" });
    const client4 = makeFakeClient({ id: "c-004", cpf: null, name: "João Costa", whatsapp: "+5511888888888" });

    // CPF group query → no groups
    mockHaving.mockResolvedValueOnce([]);
    // name+WA group query → one group
    mockHaving.mockResolvedValueOnce([{ normName: "joão costa", whatsapp: "+5511888888888" }]);
    // Fetch the duplicate clients by name+WA
    mockOrderBy.mockResolvedValueOnce([client3, client4]);

    const res = await request(app).get("/api/clients/duplicates");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.pairs[0].reason).toBe("name_whatsapp");
    expect(res.body.pairs[0].clients[0].id).toBe("c-003");
    expect(res.body.pairs[0].clients[1].id).toBe("c-004");
  });

  it("excludes CPF-matched clients from the name+whatsapp group to prevent double-counting", async () => {
    const app = buildApp();
    // Two clients share a CPF AND the same name/whatsapp
    const client1 = makeFakeClient({ id: "c-001", cpf: "11111111100", name: "Maria Silva", whatsapp: "+5511999" });
    const client2 = makeFakeClient({ id: "c-002", cpf: "11111111100", name: "Maria Silva", whatsapp: "+5511999" });

    // CPF group → one group
    mockHaving.mockResolvedValueOnce([{ cpf: "11111111100" }]);
    // CPF fetch → both clients
    mockOrderBy.mockResolvedValueOnce([client1, client2]);
    // name+WA group → same group
    mockHaving.mockResolvedValueOnce([{ normName: "maria silva", whatsapp: "+5511999" }]);
    // name+WA fetch → same clients (already in CPF set)
    mockOrderBy.mockResolvedValueOnce([client1, client2]);

    const res = await request(app).get("/api/clients/duplicates");

    expect(res.status).toBe(200);
    // Should only appear once (CPF group), not duplicated in name+WA group
    expect(res.body.total).toBe(1);
    expect(res.body.pairs[0].reason).toBe("cpf");
  });

  it("returns multiple CPF groups when multiple CPFs are duplicated", async () => {
    const app = buildApp();
    const ca1 = makeFakeClient({ id: "ca1", cpf: "11111111100" });
    const ca2 = makeFakeClient({ id: "ca2", cpf: "11111111100" });
    const cb1 = makeFakeClient({ id: "cb1", cpf: "22222222200" });
    const cb2 = makeFakeClient({ id: "cb2", cpf: "22222222200" });

    // Two CPF groups
    mockHaving.mockResolvedValueOnce([{ cpf: "11111111100" }, { cpf: "22222222200" }]);
    // Fetch returns all 4 (grouped by CPF in route logic via byCpf map)
    mockOrderBy.mockResolvedValueOnce([ca1, ca2, cb1, cb2]);
    // name+WA group → none
    mockHaving.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/clients/duplicates");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.pairs).toHaveLength(2);
    expect(res.body.pairs.every((p: { reason: string }) => p.reason === "cpf")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/clients/:id/merge
// ---------------------------------------------------------------------------

describe("POST /api/clients/:id/merge — transactional merge", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    capturedInsertValues.length = 0;
    mockWhere.mockReturnValue({ limit: mockLimit, groupBy: mockGroupBy, orderBy: mockOrderBy });
    mockGroupBy.mockReturnValue({ having: mockHaving });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit, orderBy: mockOrderBy });
    mockSelect.mockReturnValue({ from: mockFrom });
    requireAuthMock.mockResolvedValue(ADMIN_USER as never);
  });

  it("returns 403 when the caller is not an admin", async () => {
    const app = buildApp();
    requireAuthMock.mockResolvedValue(NON_ADMIN_USER as never);
    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "client-002" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when secondaryId is missing from the request body", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when primaryId and secondaryId are the same", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "client-001" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the primary client is not found in the tenant", async () => {
    const app = buildApp();
    // Promise.all: primary → not found; secondary → found
    mockLimit
      .mockResolvedValueOnce([])         // primary not found
      .mockResolvedValueOnce([SECONDARY]); // secondary found (Promise.all order)

    const res = await request(app)
      .post("/api/clients/nonexistent/merge")
      .send({ secondaryId: "client-002" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 404 when the secondary client is not found in the tenant", async () => {
    const app = buildApp();
    mockLimit
      .mockResolvedValueOnce([PRIMARY])  // primary found
      .mockResolvedValueOnce([]);         // secondary not found

    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "nonexistent-secondary" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns 400 when the secondary client has already been merged", async () => {
    const app = buildApp();
    mockLimit
      .mockResolvedValueOnce([PRIMARY])
      .mockResolvedValueOnce([SECONDARY_MERGED]);

    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "client-002" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("executes the merge transaction and returns 200 with the updated primary on the happy path", async () => {
    const app = buildApp();
    const tx = buildTxMock();
    mockTransaction.mockImplementation((cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([PRIMARY])   // primary lookup
      .mockResolvedValueOnce([SECONDARY]) // secondary lookup
      .mockResolvedValueOnce([PRIMARY]);   // final re-fetch of primary

    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "client-002" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.client).toBeDefined();
    expect(res.body.client.id).toBe("client-001");

    // Transaction was called
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Deletes were called (clientScores and campaignSends for secondary)
    expect(tx.delete).toHaveBeenCalledTimes(2);

    // Updates were called (reassign FK tables to primary)
    expect(tx.update).toHaveBeenCalled();
  });

  it("inserts an audit note on the primary client during the merge transaction", async () => {
    const app = buildApp();
    const tx = buildTxMock();
    mockTransaction.mockImplementation((cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([PRIMARY])
      .mockResolvedValueOnce([SECONDARY])
      .mockResolvedValueOnce([PRIMARY]);

    await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "client-002" });

    // An audit note must have been inserted via tx.insert(notesTable).values(...)
    expect(tx.insert).toHaveBeenCalled();
    const noteInsert = capturedInsertValues.find(
      (v) => (v as Record<string, unknown>).type === "merge",
    );
    expect(noteInsert).toBeDefined();
    expect((noteInsert as Record<string, unknown>).clientId).toBe("client-001");
    expect((noteInsert as Record<string, unknown>).isPrivate).toBe(true);
    expect(typeof (noteInsert as Record<string, unknown>).content).toBe("string");
  });

  it("rejects a secondaryId belonging to a different tenant (returns 404 because tenant filter returns nothing)", async () => {
    const app = buildApp();
    // The DB query filters by tenantId — simulate cross-tenant secondary returning empty
    mockLimit
      .mockResolvedValueOnce([PRIMARY])
      .mockResolvedValueOnce([]); // cross-tenant secondary → not found in this tenant

    const res = await request(app)
      .post("/api/clients/client-001/merge")
      .send({ secondaryId: "other-tenant-client" });

    expect(res.status).toBe(404);
    // Transaction must NOT have been started
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
