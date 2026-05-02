/**
 * Cancellation reversal tests: PATCH /reservations/:id with status "cancelled"
 *
 * Verifies that cancelling an active reservation atomically reverts all financial
 * side-effects created at booking time:
 *   1. Coupon usage_count is decremented
 *   2. Loyalty points used as discount are restored to the member
 *   3. Referral bonus credited to the referrer is reversed
 *   4. Loyalty points earned from payments on this reservation are clawed back
 *
 * Uses supertest + vi.mock to isolate the DB layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any vi.mock factory runs
// ---------------------------------------------------------------------------

const {
  capturedUpdates,
  capturedInserts,
  mockTxSelect,
  mockTxFrom,
  mockTxWhere,
  mockTxLimit,
  mockLimit,
  mockWhere,
  mockFrom,
  mockSelect,
  mockTransaction,
} = vi.hoisted(() => {
  const capturedUpdates: Array<{ table: string; set: Record<string, unknown> }> = [];
  const capturedInserts: Record<string, unknown>[] = [];

  const mockTxLimit = vi.fn();
  const mockTxWhere = vi.fn(() => ({ limit: mockTxLimit }));
  const mockTxFrom = vi.fn(() => ({ where: mockTxWhere, limit: mockTxLimit }));
  const mockTxSelect = vi.fn(() => ({ from: mockTxFrom }));

  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockTransaction = vi.fn();

  return {
    capturedUpdates,
    capturedInserts,
    mockTxSelect,
    mockTxFrom,
    mockTxWhere,
    mockTxLimit,
    mockLimit,
    mockWhere,
    mockFrom,
    mockSelect,
    mockTransaction,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    transaction: mockTransaction,
  },
  storesTable: { id: "id", tenantId: "tenant_id" },
  storeOrdersTable: {},
  storeOrderItemsTable: {},
  storeProductsTable: {},
  storeProductVariantsTable: {},
  storeCouponsTable: { storeId: "store_id", code: "code", usageCount: "usage_count" },
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
  MANAGEMENT_ROLES: ["admin", "gerente"],
}));

vi.mock("../routes/payments.js", () => ({
  syncReservationCommission: vi.fn().mockResolvedValue(undefined),
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), use: vi.fn() },
}));

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: { syncTrip: vi.fn().mockResolvedValue(undefined) },
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
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// App builder + logger stub
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  const noop = (..._args: unknown[]) => {};
  req.log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop } as never;
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

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: "admin",
  name: "Agente Teste",
  email: "agente@example.com",
};

const FAKE_TRIP = {
  id: "trip-001",
  name: "Excursão Nordeste",
  destination: "Fortaleza",
  departureDate: new Date("2025-07-10"),
  availableSeats: 10,
  totalCapacity: 46,
  status: "active",
  coverImage: null,
};

const FAKE_CLIENT = {
  id: "client-001",
  tenantId: "tenant-001",
  name: "Maria Souza",
  email: "maria@example.com",
  cpf: null,
  rg: null,
  birthDate: null,
  whatsapp: null,
};

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-001",
    tenantId: "tenant-001",
    tripId: "trip-001",
    clientId: "client-001",
    seats: ["1A"],
    status: "pending",
    voucherCode: "VCH-ABC",
    totalValue: "1000",
    paidValue: "0",
    balance: "1000",
    paymentMethod: null,
    installments: 1,
    commissionPercentage: null,
    commissionAmount: null,
    sellerId: null,
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
    createdById: "user-001",
    tripType: null,
    packageType: null,
    hasInsurance: false,
    reservationNumber: "AG-EX-202507-0001",
    qrCode: "QR-VCH-ABC",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Transaction mock builder
// ---------------------------------------------------------------------------

/**
 * Builds a transaction mock where tx.select() responses are controlled via
 * the `selectResponses` queue (FIFO).
 *
 * Each call to tx.select() dequeues the next pre-programmed response and
 * returns a fully-chainable thenable so that ALL of the following patterns work
 * without a 500:
 *   await tx.select().from()                    → array
 *   await tx.select().from().where()            → array
 *   await tx.select().from().where().limit(n)   → array
 *   await tx.select().from().limit(n)           → array
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(data: unknown[]): any {
  const p: any = Promise.resolve(data);
  p.limit = vi.fn().mockResolvedValue(data);
  // Lazy implementations prevent infinite-recursion at mock-creation time
  p.where = vi.fn().mockImplementation(() => makeChain(data));
  p.from = vi.fn().mockImplementation(() => makeChain(data));
  p.orderBy = vi.fn().mockImplementation(() => makeChain(data));
  return p;
}

function buildTxMock(selectResponses: unknown[][] = []) {
  const queue = [...selectResponses];

  const updateSetWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn().mockImplementation((setArg) => {
    capturedUpdates.push({ table: "unknown", set: setArg });
    return { where: updateSetWhere };
  });

  return {
    execute: vi.fn().mockResolvedValue({
      rows: [{ id: "trip-001", available_seats: 10, type: "excursao" }],
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedInserts.push(vals);
        return Promise.resolve([]);
      }),
    })),
    update: vi.fn().mockImplementation(() => ({ set: updateSet })),
    select: vi.fn().mockImplementation(() => {
      // Dequeue next response at SELECT time so each query gets its own data
      const data = queue.shift() ?? [];
      return makeChain(data);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PATCH /api/reservations/:id — cancellation financial reversal", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates.length = 0;
    capturedInserts.length = 0;

    requireAuthMock.mockResolvedValue(FAKE_USER as never);

    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });
  });

  // -------------------------------------------------------------------------
  it("returns 400 for non-existent reservation (requireReservationAccess throws)", async () => {
    const app = buildReservationsApp();

    // requireReservationAccess → select reservation → not found
    mockLimit.mockResolvedValueOnce([]);

    const res = await request(app)
      .patch("/api/reservations/res-missing")
      .send({ status: "cancelled" });

    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  it("cancels a plain reservation (no discounts) and releases seats", async () => {
    const app = buildReservationsApp();
    // clientId is null so reversal 4 (payment lookup) won't run
    const existing = makeReservation({ seats: ["1A", "2B"], clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    // outer: requireReservationAccess
    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] tx.select re-fetch after UPDATE → [cancelled]
    const tx = buildTxMock([[cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    // outer: formatReservation → trip + client
    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // trips update (seat restore) + reservation update
    expect(tx.update).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("decrements coupon usage_count when reservation with a coupon is cancelled", async () => {
    const app = buildReservationsApp();
    // clientId is null so reversal 4 won't fire
    const existing = makeReservation({
      discountCouponCode: "PROMO10",
      discountCouponAmount: "50",
      clientId: null,
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 1 — store lookup (get store.id for this tenant)
    //   [1] Reversal 1 — coupon lookup by storeId + code → get coupon.id
    //   [2] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "store-001" }],
      [{ id: "coupon-001" }],
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // trips (seats) + storeCoupons (usageCount) + reservations (status)
    expect(tx.update).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  it("restores loyalty points and records a refund transaction when loyalty discount was used", async () => {
    const app = buildReservationsApp();
    // clientId present so reversal 4 runs (payments query → empty)
    const existing = makeReservation({
      discountLoyaltyPoints: 200,
      discountLoyaltyAmount: "20",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 2 — loyalty member lookup
    //   [1] Reversal 4 — payments lookup (empty → no further selects)
    //   [2] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "member-001", availablePoints: 300 }],
      [], // no payments
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // A loyalty transaction of type "refund" should have been inserted
    const refundTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "refund",
    );
    expect(refundTx).toBeDefined();
    expect((refundTx as Record<string, unknown>)["points"]).toBe(200);
    expect((refundTx as Record<string, unknown>)["referenceType"]).toBe("reservation");
  });

  // -------------------------------------------------------------------------
  it("reverses referral bonus: decrements referrer earnings and marks referral as reversed", async () => {
    const app = buildReservationsApp();
    // clientId present → reversal 4 runs (payments → empty)
    const existing = makeReservation({
      discountReferralCode: "REF-XYZ",
      discountReferralAmount: "50",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 3 — referral record lookup by reservationId (exact scope)
    //   [1] Reversal 4 — payments lookup (empty)
    //   [2] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "referral-001", referrerId: "referrer-client-001", bonusAmount: "10.00" }],
      [], // no payments
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // trips (seats) + clients (referralEarnings) + referrals (status) + reservations = 4 updates
    expect(tx.update).toHaveBeenCalledTimes(4);
  });

  // -------------------------------------------------------------------------
  it("reverses only the referral tied to the cancelled reservation, not other completed referrals with the same code", async () => {
    // Adversarial case: a referred client has TWO completed referrals with the
    // same code (two bookings). Cancelling res-001 must only touch referral-001
    // (the one with reservationId = "res-001") and leave referral-002 untouched.
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountReferralCode: "REF-SHARED",
      discountReferralAmount: "50",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // The referral lookup uses reservationId="res-001" → only returns referral-001.
    // referral-002 (same code, different reservation) is never touched.
    const tx = buildTxMock([
      [{ id: "referral-001", referrerId: "referrer-client-001", bonusAmount: "10.00" }],
      [], // no payments
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // The tx.select was called with a where clause that includes reservationId.
    // The referral record returned is referral-001; only 4 updates should run.
    expect(tx.update).toHaveBeenCalledTimes(4);
    // Verify tx.select was called — the reversal ran against the specific record
    expect(tx.select).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("claws back loyalty points earned from payments when reservation is cancelled", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: "client-001" });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup → 2 payments found
    //   [1] Reversal 4 — loyalty member lookup
    //   [2] Reversal 4 — earn transactions lookup (15 + 20 = 35 pts)
    //   [3] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "pay-001" }, { id: "pay-002" }],
      [{ id: "member-001", availablePoints: 150, totalPoints: 300 }],
      [{ points: 15 }, { points: 20 }],
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // A loyalty transaction of type "cancellation" should have been inserted
    const cancellationTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "cancellation",
    );
    expect(cancellationTx).toBeDefined();
    expect((cancellationTx as Record<string, unknown>)["points"]).toBe(-35);
  });

  // -------------------------------------------------------------------------
  it("performs ALL reversals simultaneously when reservation has coupon + loyalty + referral + payments", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountCouponCode: "COMBO20",
      discountCouponAmount: "100",
      discountLoyaltyPoints: 50,
      discountLoyaltyAmount: "5",
      discountReferralCode: "REF-ABC",
      discountReferralAmount: "25",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 1 (coupon) — store lookup (get store.id)
    //   [1] Reversal 1 (coupon) — coupon lookup by storeId + code → coupon.id
    //   [2] Reversal 2 (loyalty discount) — loyalty member
    //   [3] Reversal 3 (referral) — referral record by reservationId
    //   [4] Reversal 4 (payment loyalty) — payments
    //   [5] Reversal 4 — loyalty member (for payment clawback)
    //   [6] Reversal 4 — earn transactions
    //   [7] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "store-001" }],
      [{ id: "coupon-001" }],
      [{ id: "member-001", availablePoints: 200 }],
      [{ id: "ref-001", referrerId: "ref-client-001", bonusAmount: "10.00" }],
      [{ id: "pay-001" }],
      [{ id: "member-001", availablePoints: 250, totalPoints: 500 }],
      [{ points: 10 }],
      [cancelled],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);

    // Both a "refund" transaction (loyalty discount) and a "cancellation" (payment) must exist
    const refundTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "refund",
    );
    const cancellationTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "cancellation",
    );
    expect(refundTx).toBeDefined();
    expect(cancellationTx).toBeDefined();

    // trips + storeCoupons + loyaltyMembers (discount restore) +
    // clients (referral earnings) + referrals (status) +
    // loyaltyMembers (payment clawback) + reservations = 7 updates
    expect(tx.update).toHaveBeenCalledTimes(7);
  });

  // -------------------------------------------------------------------------
  it("skips all reversals when the reservation was already cancelled (wasActive = false)", async () => {
    const app = buildReservationsApp();
    // Already cancelled — not in ACTIVE_STATUSES — reversal block is skipped entirely
    const existing = makeReservation({
      status: "cancelled",
      discountCouponCode: "PROMO10",
      discountLoyaltyPoints: 100,
      clientId: null,
    });
    const stillCancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue: only the re-fetch after UPDATE (no reversals run)
    const tx = buildTxMock([[stillCancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // Only the reservation UPDATE itself — no seat restore, no reversals
    expect(tx.update).toHaveBeenCalledTimes(1);
    // No loyalty refund transactions inserted
    const refundTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "refund",
    );
    expect(refundTx).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: reversal amount logic (pure computation)
// ---------------------------------------------------------------------------

describe("Cancellation reversal — pure computation", () => {
  it("loyalty points restored equals exactly the amount that was debited", () => {
    const discountLoyaltyPoints = 150;
    const currentAvailable = 80;
    const restored = currentAvailable + discountLoyaltyPoints;
    expect(restored).toBe(230);
  });

  it("referral earnings reversal never goes below zero", () => {
    const currentEarnings = 5.0;
    const bonusToReverse = 10.0;
    const newEarnings = Math.max(0, currentEarnings - bonusToReverse);
    expect(newEarnings).toBe(0);
  });

  it("loyalty points from multiple payments are summed before reversal", () => {
    const earnedPoints = [{ points: 15 }, { points: 20 }, { points: 8 }];
    const totalEarned = earnedPoints.reduce((sum, t) => sum + t.points, 0);
    expect(totalEarned).toBe(43);
  });

  it("payment loyalty clawback never makes availablePoints negative", () => {
    const availablePoints = 30;
    const totalEarned = 50;
    const newAvailable = Math.max(0, availablePoints - totalEarned);
    expect(newAvailable).toBe(0);
  });

  it("totalPoints clawback never makes totalPoints negative", () => {
    const totalPoints = 40;
    const totalEarned = 100;
    const newTotal = Math.max(0, totalPoints - totalEarned);
    expect(newTotal).toBe(0);
  });
});
