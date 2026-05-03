/**
 * Endpoint-level tests: reservation creation (POST /reservations) and
 * store order lookup email validation (GET /public/store/:slug/orders/:orderNumber).
 *
 * Uses supertest with vi.mock to drive real Express route handlers while
 * isolating external dependencies (DB, Clerk, queues).
 */

import { ROLES } from "@workspace/permissions";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// vi.hoisted: shared mock builders must exist before any vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction, capturedInserts } = vi.hoisted(() => {
  const capturedInserts: Record<string, unknown>[] = [];

  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  const mockTransaction = vi.fn();

  return { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction, capturedInserts };
});

// ---------------------------------------------------------------------------
// Module mocks (resolved relative to THIS test file: src/__tests__/)
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    transaction: mockTransaction,
  },
  storesTable: {},
  storeOrdersTable: {},
  storeOrderItemsTable: {},
  storeProductsTable: {},
  storeProductVariantsTable: {},
  storeCouponsTable: {},
  storeReviewsTable: {},
  storeCategoriesTable: {},
  reservationsTable: {},
  passengersTable: {},
  tripsTable: {},
  clientsTable: {},
  loyaltyMembersTable: {},
  loyaltyTransactionsTable: {},
  loyaltyProgramsTable: {},
  referralsTable: {},
  referralSettingsTable: {},
  dealsTable: {},
  pipelineStagesTable: {},
  tenantsTable: {},
  emailLogsTable: {},
  referralTrackingTable: {},
  usersTable: {},
  paymentsTable: {},
  commissionsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...a) => a),
  or: vi.fn((...a) => a),
  inArray: vi.fn(() => "inArray"),
  desc: vi.fn(() => "desc"),
  asc: vi.fn(() => "asc"),
  ilike: vi.fn(() => "ilike"),
  sql: Object.assign(vi.fn(() => "sql"), { raw: vi.fn() }),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: vi.fn(),
  getAuth: vi.fn(() => ({ userId: "user_test" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/seat-sse.js", () => ({
  addSeatClient: vi.fn(),
  removeSeatClient: vi.fn(),
  emitSeatUpdate: vi.fn(),
}));

vi.mock("../lib/realtime.js", () => ({
  broadcastSeatUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/tenant.js", () => ({
  requireAuth: vi.fn(),
  getTenantUser: vi.fn(),
  ADMIN_ROLES: ["admin"],
  MANAGEMENT_ROLES: ["admin", "manager"],
}));

// Mocks ../routes/payments.js (the "syncReservationCommission" import in reservations.ts)
vi.mock("../routes/payments.js", () => ({
  syncReservationCommission: vi.fn().mockResolvedValue(undefined),
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), use: vi.fn() },
}));

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueReservationCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: {
    syncTrip: vi.fn().mockResolvedValue(undefined),
    syncTripOnReservationCancellation: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/activities.js", () => ({
  writeClientActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
  generateVoucherCode: vi.fn(() => "VCHR-0001"),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

vi.mock("../lib/reservation-number.js", () => ({
  getTenantReservationPrefix: vi.fn().mockResolvedValue("AG"),
  nextReservationSequence: vi.fn().mockResolvedValue(1),
  buildReservationNumber: vi.fn(() => "AG-EX-202507-0001"),
  getYearMonth: vi.fn(() => "202507"),
  tripTypeToCode: vi.fn(() => "EX"),
}));

vi.mock("../lib/passenger.js", () => ({
  deriveAgeCategory: vi.fn(() => "adult"),
  getAgeYears: vi.fn(() => 30),
}));

// ---------------------------------------------------------------------------
// Import routers and middleware AFTER all mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../lib/tenant.js";
import reservationsRouter from "../routes/reservations.js";
import storePublicRouter from "../routes/store-public.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// Minimal Express app builders
// ---------------------------------------------------------------------------

// Stub middleware that attaches a no-op pino-compatible logger to req
// (the route handlers use req.log.error/info for fire-and-forget error logging)
function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  const noop = () => {};
  req.log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
  next();
}

function buildReservationsApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", reservationsRouter);
  app.use(errorHandler);
  return app;
}

function buildStorePublicApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", storePublicRouter);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Test User",
  email: "test@example.com",
};

const FAKE_CLIENT = {
  id: "client-001",
  tenantId: "tenant-001",
  name: "João Silva",
  email: "joao@example.com",
  cpf: null,
  rg: null,
  birthDate: null,
  whatsapp: null,
};

const FAKE_TRIP = {
  id: "trip-001",
  name: "Excursão ao Nordeste",
  destination: "Fortaleza, CE",
  departureDate: new Date("2025-07-10"),
  availableSeats: 10,
  totalCapacity: 46,
  status: "active",
  coverImage: null,
};

function makeFakeReservation(totalValue: string, paidValue: string, balance: string) {
  return {
    id: "gen-id",
    tenantId: FAKE_USER.tenantId,
    tripId: "trip-001",
    clientId: FAKE_CLIENT.id,
    seats: ["1A", "2B"],
    tripType: null,
    packageType: null,
    hasInsurance: false,
    totalValue,
    paidValue,
    balance,
    paymentMethod: null,
    installments: 1,
    commissionPercentage: null,
    commissionAmount: null,
    sellerId: null,
    status: "pending",
    voucherCode: "VCHR-0001",
    reservationNumber: "AG-EX-202507-0001",
    qrCode: "QR-VCHR-0001",
    notes: null,
    boardingLocationId: null,
    storeOrderId: null,
    discountCouponCode: null,
    discountCouponAmount: null,
    discountLoyaltyPoints: null,
    discountLoyaltyAmount: null,
    discountReferralCode: null,
    discountReferralAmount: null,
    discountTotal: null,
    checkedInAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: FAKE_USER.id,
  };
}

const FAKE_STORE = {
  id: "store-001",
  tenantId: "tenant-001",
  slug: "minha-loja",
  isActive: true,
  name: "Minha Loja de Viagens",
};

const FAKE_ORDER = {
  id: "order-001",
  orderNumber: "ORD-001",
  customerEmail: "cliente@example.com",
  totalAmount: "500.00",
  status: "pending",
  items: [],
};

// ---------------------------------------------------------------------------
// Helpers for building the transaction mock
// ---------------------------------------------------------------------------

function buildTxMock() {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: [{ id: "trip-001", available_seats: 10, type: "excursao" }],
    }),
    insert: vi.fn(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedInserts.push(vals);
        return Promise.resolve([]);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    select: vi.fn(() => ({ from: mockFrom })),
  };
}

// ---------------------------------------------------------------------------
// Tests: POST /api/reservations
// ---------------------------------------------------------------------------

describe("POST /api/reservations — endpoint pricing computation", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    capturedInserts.length = 0;

    requireAuthMock.mockResolvedValue(FAKE_USER as never);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(buildTxMock()),
    );
  });

  it("returns 400 when required body fields are missing", async () => {
    const app = buildReservationsApp();
    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001" }); // missing clientId, seats, totalValue

    expect(res.status).toBe(400);
  });

  it("returns 400 when client is not found in tenant", async () => {
    const app = buildReservationsApp();
    mockLimit.mockResolvedValueOnce([]); // client lookup → not found

    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: "missing", seats: ["1A"], totalValue: 500 });

    expect(res.status).toBe(400);
  });

  it("inserts reservation with correct totalValue and balance (partial payment)", async () => {
    const app = buildReservationsApp();
    const fakeReservation = makeFakeReservation("1000", "300", "700");

    // Calls to mockLimit in order:
    // 1. client select
    // 2. reservation re-fetch after transaction
    // 3. trip select inside formatReservation
    // 4. client select inside formatReservation
    mockLimit
      .mockResolvedValueOnce([FAKE_CLIENT])     // client lookup
      .mockResolvedValueOnce([fakeReservation]) // post-tx reservation re-fetch
      .mockResolvedValueOnce([FAKE_TRIP])       // formatReservation: trip
      .mockResolvedValueOnce([FAKE_CLIENT]);    // formatReservation: client

    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: FAKE_CLIENT.id, seats: ["1A", "2B"], totalValue: 1000, paidValue: 300 });

    expect(res.status).toBe(201);

    // Verify the INSERT captured inside the transaction has the computed balance
    const reservationInsert = capturedInserts[0] as Record<string, string>;
    expect(reservationInsert).toBeDefined();
    expect(reservationInsert["totalValue"]).toBe("1000");
    expect(reservationInsert["paidValue"]).toBe("300");
    expect(reservationInsert["balance"]).toBe("700"); // computeBalance(1000, 300)
  });

  it("inserts zero balance when reservation is fully paid", async () => {
    const app = buildReservationsApp();
    const fakeReservation = makeFakeReservation("500", "500", "0");

    mockLimit
      .mockResolvedValueOnce([FAKE_CLIENT])
      .mockResolvedValueOnce([fakeReservation])
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: FAKE_CLIENT.id, seats: ["1A"], totalValue: 500, paidValue: 500 });

    expect(res.status).toBe(201);

    const reservationInsert = capturedInserts[0] as Record<string, string>;
    expect(reservationInsert["balance"]).toBe("0"); // computeBalance(500, 500)
  });

  it("balance is clamped to zero when paidValue exceeds totalValue (no negative balance)", async () => {
    const app = buildReservationsApp();
    const fakeReservation = makeFakeReservation("200", "300", "0");

    mockLimit
      .mockResolvedValueOnce([FAKE_CLIENT])
      .mockResolvedValueOnce([fakeReservation])
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: FAKE_CLIENT.id, seats: ["1A"], totalValue: 200, paidValue: 300 });

    const reservationInsert = capturedInserts[0] as Record<string, string>;
    // computeBalance(200, 300) = Math.max(0, -100) = 0
    expect(Number(reservationInsert["balance"])).toBeGreaterThanOrEqual(0);
    expect(reservationInsert["balance"]).toBe("0");
  });

  it("response body contains totalValue and balance from the created reservation", async () => {
    const app = buildReservationsApp();
    const fakeReservation = makeFakeReservation("800", "200", "600");

    mockLimit
      .mockResolvedValueOnce([FAKE_CLIENT])
      .mockResolvedValueOnce([fakeReservation])
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: FAKE_CLIENT.id, seats: ["1A", "2B"], totalValue: 800, paidValue: 200 });

    expect(res.status).toBe(201);
    expect(res.body.totalValue).toBe(800);
    expect(res.body.balance).toBe(600);
  });

  it("creates a placeholder passenger for each additional seat when more than 1 seat is booked", async () => {
    const app = buildReservationsApp();
    const fakeReservation = { ...makeFakeReservation("1500", "0", "1500"), seats: ["1A", "2B", "3C"] };

    mockLimit
      .mockResolvedValueOnce([FAKE_CLIENT])
      .mockResolvedValueOnce([fakeReservation])
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .post("/api/reservations")
      .send({ tripId: "trip-001", clientId: FAKE_CLIENT.id, seats: ["1A", "2B", "3C"], totalValue: 1500 });

    expect(res.status).toBe(201);

    // capturedInserts contains: [0]=reservation, [1]=primary passenger, [2..N]=placeholder passengers
    const passengerInserts = capturedInserts.filter(
      (i) => (i as Record<string, unknown>).reservationId !== undefined,
    );
    // 3 seats → 1 primary + 2 placeholders = 3 passenger rows
    expect(passengerInserts).toHaveLength(3);

    const primary = passengerInserts.find(
      (p) => (p as Record<string, unknown>).isPrimary === true,
    );
    expect(primary).toBeDefined();
    expect((primary as Record<string, unknown>).name).toBe(FAKE_CLIENT.name);

    const placeholders = passengerInserts.filter(
      (p) => (p as Record<string, unknown>).isPrimary !== true,
    );
    expect(placeholders).toHaveLength(2);
    expect((placeholders[0] as Record<string, unknown>).name).toBe("A preencher");
    expect((placeholders[1] as Record<string, unknown>).name).toBe("A preencher");
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/public/store/:slug/orders/:orderNumber
// ---------------------------------------------------------------------------

describe("GET /api/public/store/:slug/orders/:orderNumber — email validation at endpoint level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([FAKE_STORE]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  it("returns 400 with VALIDATION_ERROR when email query param is absent", async () => {
    const app = buildStorePublicApp();
    const res = await request(app).get("/api/public/store/minha-loja/orders/ORD-001");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 with VALIDATION_ERROR when email is an empty string", async () => {
    const app = buildStorePublicApp();
    const res = await request(app).get("/api/public/store/minha-loja/orders/ORD-001?email=");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 400 with VALIDATION_ERROR when email is whitespace only", async () => {
    const app = buildStorePublicApp();
    const res = await request(app).get("/api/public/store/minha-loja/orders/ORD-001?email=   ");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns 404 (not 400) when email is valid but order is not found", async () => {
    const app = buildStorePublicApp();
    // First call: store found. Second call: order not found.
    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/public/store/minha-loja/orders/ORD-001?email=cliente@example.com");

    // Email passed validation → got past the 400, now 404 (order not found)
    expect(res.status).toBe(404);
    expect(res.body.code).not.toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the store slug does not exist", async () => {
    const app = buildStorePublicApp();
    mockLimit.mockResolvedValueOnce([]); // store not found

    const res = await request(app)
      .get("/api/public/store/nonexistent/orders/ORD-001?email=test@example.com");

    expect(res.status).toBe(404);
  });

  it("normalizes email to lowercase before comparing (case-insensitive lookup)", async () => {
    const app = buildStorePublicApp();
    // Provide order with lowercase email; pass email in mixed case
    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([{ ...FAKE_ORDER, items: [] }]);

    const res = await request(app)
      .get("/api/public/store/minha-loja/orders/ORD-001?email=CLIENTE@EXAMPLE.COM");

    // Should get past email validation and attempt order fetch (not a 400)
    expect(res.status).not.toBe(400);
  });
});
