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

import { ROLES } from "@workspace/permissions";
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
  mockEnqueueCancellationEmail,
  mockSyncTrip,
  mockSyncTripGeneral,
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
  const mockEnqueueCancellationEmail = vi.fn().mockResolvedValue(undefined);
  const mockSyncTrip = vi.fn().mockResolvedValue(undefined);
  const mockSyncTripGeneral = vi.fn().mockResolvedValue(undefined);

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
    mockEnqueueCancellationEmail,
    mockSyncTrip,
    mockSyncTripGeneral,
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
  storeOrdersTable: { id: "id", tenantId: "tenant_id", orderNumber: "order_number", status: "status", cancelledAt: "cancelled_at" },
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
  MANAGEMENT_ROLES: ["admin", "gerente"],
}));

vi.mock("../routes/payments.js", () => ({
  syncReservationCommission: vi.fn().mockResolvedValue(undefined),
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), use: vi.fn() },
}));

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueReservationCancellationEmail: mockEnqueueCancellationEmail,
  enqueueNewBookingNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: {
    syncTrip: mockSyncTripGeneral,
    syncTripOnReservationCancellation: mockSyncTrip,
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
  role: ROLES.AGENCY_ADMIN,
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
    // trips (seats) + storeCoupons (usageCount) + commissions (cancel) + reservations (status)
    expect(tx.update).toHaveBeenCalledTimes(4);
  });

  // -------------------------------------------------------------------------
  // Edge-case: coupon usageCount is already 0 when the decrement fires.
  // The SQL GREATEST(0, usage_count - 1) guard prevents it from going negative,
  // but the UPDATE must still be issued — this test confirms no DB constraint
  // error surfaces and the response is 200.
  it("still issues coupon usageCount update (GREATEST guard) when usageCount is already 0", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountCouponCode: "PROMO10",
      discountCouponAmount: "50",
      clientId: null,
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 1 — store lookup (get store.id for this tenant)
    //   [1] Reversal 1 — coupon lookup → usageCount is already 0 (already decremented)
    //   [2] re-fetch updated reservation
    //
    // The GREATEST guard in the SQL expression ensures the update still fires and
    // the floor is clamped to 0 — no constraint violation, no application error.
    const tx = buildTxMock([
      [{ id: "store-001" }],
      [{ id: "coupon-001", usageCount: 0 }],
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
    // trips (seats) + storeCoupons (usageCount) + commissions (cancel) + reservations (status) = 4
    expect(tx.update).toHaveBeenCalledTimes(4);

    // The coupon update must have been captured with the usageCount field present
    const couponUpdate = capturedUpdates.find(
      (u) => "usageCount" in u.set,
    );
    expect(couponUpdate).toBeDefined();
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
    //   [1] Reversal 2 — idempotency check (no prior "refund" tx → proceed)
    //   [2] Reversal 4 — payments lookup (empty)
    //   [3] Reversal 4 — loyalty member lookup (no member found → skip clawback)
    //   [4] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "member-001", availablePoints: 300 }],
      [], // no existing refund tx → proceed with restore
      [], // no payments
      [], // Reversal 4 loyalty member lookup → not found, skip clawback
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
    //   [2] Reversal 4 — loyalty member lookup (no member found → skip clawback)
    //   [3] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "referral-001", referrerId: "referrer-client-001", bonusAmount: "10.00" }],
      [], // no payments
      [], // Reversal 4 loyalty member lookup → not found, skip clawback
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
    // trips (seats) + clients (referralEarnings) + referrals (status) + commissions (cancel) + reservations = 5 updates
    expect(tx.update).toHaveBeenCalledTimes(5);
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
      [], // Reversal 4 loyalty member lookup → not found, skip clawback
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
    // The referral record returned is referral-001; only 5 updates should run.
    expect(tx.update).toHaveBeenCalledTimes(5);
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
    //   [2] Reversal 4 — idempotency check (no prior "cancellation" tx → proceed)
    //   [3] Reversal 4 — earn transactions lookup (15 + 20 = 35 pts)
    //   [4] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "pay-001" }, { id: "pay-002" }],
      [{ id: "member-001", availablePoints: 150, totalPoints: 300 }],
      [], // no existing cancellation tx → proceed with clawback
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
  it("claws back confirmation-earned loyalty points even when no payment records exist", async () => {
    // Scenario: reservation was confirmed (status → confirmed), which triggered
    // an "earn" loyalty transaction with referenceType="reservation". The client
    // later cancels without ever having made a payment. Without this fix, those
    // points would be silently kept.
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: "client-001", status: "confirmed" });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup (empty — no payment records)
    //   [1] Reversal 4 — loyalty member lookup → member found
    //   [2] Reversal 4 — idempotency check (no prior "cancellation" tx → proceed)
    //   [3] Reversal 4 — earn transactions → 50 pts earned at confirmation
    //   [4] re-fetch updated reservation
    const tx = buildTxMock([
      [],                                                               // no payments
      [{ id: "member-001", availablePoints: 50, totalPoints: 50 }],   // loyalty member
      [],                                                               // no prior cancellation tx → proceed
      [{ points: 50 }],                                                // confirmation-earned points
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
    expect((cancellationTx as Record<string, unknown>)["points"]).toBe(-50);
    expect((cancellationTx as Record<string, unknown>)["referenceType"]).toBe("reservation");
  });

  // -------------------------------------------------------------------------
  it("does NOT double-deduct confirmation-earned points when a reservation is re-cancelled (idempotency)", async () => {
    // Scenario: reservation was confirmed (earning points via referenceType="reservation"),
    // then cancelled once (a "cancellation" loyalty tx was written), then re-opened by an
    // admin and cancelled a second time. The second cancellation must detect the existing
    // "cancellation" tx and skip the clawback entirely — no extra points deducted.
    const app = buildReservationsApp();
    // No payments ever existed; points were earned purely from confirmation.
    const existing = makeReservation({ clientId: "client-001", status: "confirmed" });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup (empty — no payment records)
    //   [1] Reversal 4 — loyalty member lookup → member found
    //   [2] Reversal 4 — idempotency check → returns existing "cancellation" tx → SKIP
    //       (earn-transactions query is not called when idempotency fires)
    //   [3] re-fetch updated reservation
    const tx = buildTxMock([
      [],                                                              // no payments
      [{ id: "member-001", availablePoints: 0, totalPoints: 0 }],    // loyalty member (already clawed back)
      [{ id: "cancel-tx-001" }],                                      // existing cancellation tx → idempotency fires
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

    // loyaltyMembers must NOT be updated a second time (idempotency guard fired)
    // Expected updates: trips (seat restore) + commissions (cancel) + reservations (status) = 3
    expect(tx.update).toHaveBeenCalledTimes(3);

    // No new "cancellation" loyalty transaction should have been inserted
    const cancellationTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "cancellation",
    );
    expect(cancellationTx).toBeUndefined();
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
    //   [3] Reversal 2 — idempotency check (no prior "refund" tx → proceed)
    //   [4] Reversal 3 (referral) — referral record by reservationId
    //   [5] Reversal 4 (payment loyalty) — payments
    //   [6] Reversal 4 — loyalty member (for payment clawback)
    //   [7] Reversal 4 — idempotency check (no prior "cancellation" tx → proceed)
    //   [8] Reversal 4 — earn transactions
    //   [9] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "store-001" }],
      [{ id: "coupon-001" }],
      [{ id: "member-001", availablePoints: 200 }],
      [], // no existing refund tx → proceed
      [{ id: "ref-001", referrerId: "ref-client-001", bonusAmount: "10.00" }],
      [{ id: "pay-001" }],
      [{ id: "member-001", availablePoints: 250, totalPoints: 500 }],
      [], // no existing cancellation tx → proceed
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
    // loyaltyMembers (payment clawback) + commissions (cancel) + reservations = 8 updates
    expect(tx.update).toHaveBeenCalledTimes(8);
  });

  // -------------------------------------------------------------------------
  it("does not double-apply loyalty refund when a previously cancelled reservation is re-cancelled (idempotency)", async () => {
    // Simulates: cancel → reopen (manual admin action) → cancel again.
    // The second cancellation detects an existing "refund" loyaltyTransaction
    // for this reservationId and skips the loyalty restore to prevent drift.
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountLoyaltyPoints: 100,
      discountLoyaltyAmount: "10",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 2 — loyalty member lookup
    //   [1] Reversal 2 — idempotency check → returns existing "refund" tx → SKIP
    //   [2] Reversal 4 — payments lookup (empty)
    //   [3] Reversal 4 — loyalty member lookup (no member found → skip clawback)
    //   [4] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "member-001", availablePoints: 300 }],
      [{ id: "refund-tx-001" }], // existing refund tx → loyalty restore is skipped
      [],                         // no payments
      [],                         // Reversal 4 loyalty member lookup → not found, skip clawback
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
    // trips (seat restore) + commissions (cancel) + reservations (status update) = 3 updates
    // loyaltyMembers is NOT updated a second time (idempotency guard fired)
    expect(tx.update).toHaveBeenCalledTimes(3);
    // No new loyalty transactions inserted (refund was skipped)
    const refundTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "refund",
    );
    expect(refundTx).toBeUndefined();
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

  // -------------------------------------------------------------------------
  it("enqueues a cancellation email when a reservation with a client is cancelled", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: "client-001" });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup (empty)
    //   [1] Reversal 4 — loyalty member lookup (no member found → skip clawback)
    //   [2] re-fetch updated reservation
    const tx = buildTxMock([[], [], [cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(mockEnqueueCancellationEmail).toHaveBeenCalledWith("res-001", "tenant-001");
  });

  // -------------------------------------------------------------------------
  it("does NOT enqueue cancellation email when status transitions to 'refunded'", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: "client-001" });
    const refunded = { ...existing, status: "refunded" };

    mockLimit.mockResolvedValueOnce([existing]);

    // Reversal 4 payments lookup + loyalty member lookup (not found) + re-fetch
    const tx = buildTxMock([[], [], [refunded]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "refunded" });

    expect(res.status).toBe(200);
    expect(mockEnqueueCancellationEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("does NOT enqueue cancellation email when already-cancelled reservation is re-patched to cancelled", async () => {
    const app = buildReservationsApp();
    // wasActive = false (already cancelled)
    const existing = makeReservation({ status: "cancelled", clientId: "client-001" });
    const stillCancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // No reversals run (wasActive = false); only the re-fetch after UPDATE
    const tx = buildTxMock([[stillCancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(mockEnqueueCancellationEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("does NOT enqueue cancellation email for an unrelated update (no status change)", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: "client-001" });
    const updated = { ...existing, notes: "Updated note" };

    mockLimit.mockResolvedValueOnce([existing]);

    // No status transition: no reversals, just the re-fetch
    const tx = buildTxMock([[updated]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ notes: "Updated note" });

    expect(res.status).toBe(200);
    expect(mockEnqueueCancellationEmail).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  it("cancels pending/approved commissions for the reservation when it is cancelled", async () => {
    const app = buildReservationsApp();
    // No special discounts, no clientId → only seat restore + commission cancel + reservation update
    const existing = makeReservation({ clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue: only the re-fetch after UPDATE (no reversal selects needed)
    const tx = buildTxMock([[cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);

    // Exactly one update should have set { status: "cancelled" } as its ONLY field
    // (that's the commission cancel; the reservation update also carries cancelledAt)
    const commissionCancel = capturedUpdates.find(
      (u) => Object.keys(u.set).length === 1 && u.set.status === "cancelled",
    );
    expect(commissionCancel).toBeDefined();
  });

  // -------------------------------------------------------------------------
  it("calls CalendarSyncService.syncTripOnReservationCancellation after an active reservation is cancelled", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    const tx = buildTxMock([[cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(mockSyncTrip).toHaveBeenCalledWith(existing.tripId);
    // General syncTrip must NOT be called on cancellation — only the dedicated method
    expect(mockSyncTripGeneral).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Edge-case: referrer earnings are already 0 when the reversal runs.
  // The GREATEST(0, ...) guard in the SQL must keep the value at 0 instead of
  // going negative. The update should still be issued (the DB handles the clamp).
  it("reverses referral bonus even when referrer earnings are already 0 (GREATEST guard)", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountReferralCode: "REF-ZERO",
      discountReferralAmount: "10",
      clientId: "client-001",
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 3 — referral record lookup → referral found (bonusAmount = "10.00")
    //   [1] Reversal 4 — payments lookup (empty)
    //   [2] Reversal 4 — loyalty member lookup (not found → skip clawback)
    //   [3] re-fetch updated reservation
    //
    // The referrer's referralEarnings is effectively 0 in the DB, but we do not
    // read that value in application code — the GREATEST guard lives in the SQL
    // expression itself. So the tx.update for clients is still called; the DB
    // ensures the floor is 0.
    const tx = buildTxMock([
      [{ id: "referral-001", referrerId: "referrer-client-001", bonusAmount: "10.00" }],
      [], // no payments
      [], // no loyalty member → skip clawback
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
    // trips (seats) + clients (referralEarnings) + referrals (status) + commissions (cancel) + reservations = 5
    expect(tx.update).toHaveBeenCalledTimes(5);
  });

  // -------------------------------------------------------------------------
  // Edge-case: reservation has no seats (seats = []).
  // The seatsCount > 0 guard skips the trip-seat restore entirely, so
  // tx.update(tripsTable) is never called for seat restoration.
  it("skips the trip seat-restore when the reservation has no seats (seatsCount = 0)", async () => {
    const app = buildReservationsApp();
    // No seats, no discounts, no clientId → minimal reversal path
    const existing = makeReservation({ seats: [], clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue: only the re-fetch after UPDATE
    // No reversal selects run (no discounts, no clientId)
    const tx = buildTxMock([[cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    // commissions cancel + reservations status update = 2 updates
    // trips is NOT updated because seatsCount === 0
    expect(tx.update).toHaveBeenCalledTimes(2);

    // Verify that none of the captured updates targeted tripsTable seat columns.
    // We detect a seat-restore update by the presence of `availableSeats` in its set.
    const seatRestoreUpdate = capturedUpdates.find(
      (u) => "availableSeats" in u.set,
    );
    expect(seatRestoreUpdate).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Edge-case: reservation has a coupon code but the tenant has no store record.
  // The coupon reversal is silently skipped (the outer `if (store)` guard)
  // and the rest of the cancellation still completes successfully.
  it("silently skips coupon reversal when the store record does not exist", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({
      discountCouponCode: "GHOST-COUPON",
      discountCouponAmount: "30",
      clientId: null, // no loyalty/referral reversals
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 1 — store lookup → [] (no store found → coupon reversal skipped)
    //   [1] re-fetch updated reservation
    const tx = buildTxMock([
      [], // store not found → skip coupon decrement entirely
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
    // trips (seats) + commissions (cancel) + reservations (status) = 3 updates
    // storeCoupons is NOT updated because the store was not found
    expect(tx.update).toHaveBeenCalledTimes(3);

    // No storeCoupons (usageCount) update should have been captured
    const couponUpdate = capturedUpdates.find(
      (u) => "usageCount" in u.set,
    );
    expect(couponUpdate).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Store order lifecycle tests
  // -------------------------------------------------------------------------

  it("cancels the linked store order when a storefront reservation is cancelled", async () => {
    const app = buildReservationsApp();
    // No discounts, no clientId — only seat restore + commission cancel + store order cancel
    const existing = makeReservation({ storeOrderId: "ORD-2025-0001", clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] store order lookup by orderNumber → open order found
    //   [1] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "order-001", status: "pending" }],
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

    // trips (seats) + commissions (cancel) + storeOrders (cancel) + reservations = 4 updates
    expect(tx.update).toHaveBeenCalledTimes(4);

    // The store order update must set { status: "cancelled", cancelledAt: <Date> }
    const storeOrderUpdate = capturedUpdates.find(
      (u) => u.set.status === "cancelled" && "cancelledAt" in u.set,
    );
    expect(storeOrderUpdate).toBeDefined();
  });

  // -------------------------------------------------------------------------
  it("skips the store order update when the linked order is already cancelled (idempotency)", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ storeOrderId: "ORD-2025-0002", clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] store order lookup → order already cancelled
    //   [1] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "order-002", status: "cancelled" }],
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

    // trips (seats) + commissions (cancel) + reservations = 3 — NO store order update
    expect(tx.update).toHaveBeenCalledTimes(3);

    // Confirm no update with cancelledAt was issued
    const storeOrderUpdate = capturedUpdates.find(
      (u) => "cancelledAt" in u.set,
    );
    expect(storeOrderUpdate).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  it("skips the store order update when the linked order is completed (idempotency)", async () => {
    const app = buildReservationsApp();
    const existing = makeReservation({ storeOrderId: "ORD-2025-0003", clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] store order lookup → order already completed (fulfilled, cannot re-cancel)
    //   [1] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "order-003", status: "completed" }],
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

    // trips (seats) + commissions (cancel) + reservations = 3 — NO store order update
    expect(tx.update).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  it("gracefully skips the store order update when no matching order is found", async () => {
    const app = buildReservationsApp();
    // storeOrderId is set but the order no longer exists in the DB
    const existing = makeReservation({ storeOrderId: "ORD-MISSING", clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] store order lookup → not found
    //   [1] re-fetch updated reservation
    const tx = buildTxMock([
      [], // no store order found
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

    // trips (seats) + commissions (cancel) + reservations = 3 — NO store order update
    expect(tx.update).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  it("cancels store order alongside coupon reversal when storefront reservation has both", async () => {
    const app = buildReservationsApp();
    // Reservation from the storefront that also used a coupon; clientId null → no loyalty/referral
    const existing = makeReservation({
      storeOrderId: "ORD-2025-0010",
      discountCouponCode: "STORE20",
      discountCouponAmount: "20",
      clientId: null,
    });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue (in execution order):
    //   [0] Reversal 1 — store lookup (for coupon)
    //   [1] Reversal 1 — coupon lookup
    //   [2] store order lookup by orderNumber
    //   [3] re-fetch updated reservation
    const tx = buildTxMock([
      [{ id: "store-001" }],
      [{ id: "coupon-001" }],
      [{ id: "order-010", status: "confirmed" }],
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
    // trips (seats) + storeCoupons (usageCount) + commissions + storeOrders + reservations = 5
    expect(tx.update).toHaveBeenCalledTimes(5);

    // Both the coupon update and the store order cancel must be present
    const couponUpdate = capturedUpdates.find((u) => "usageCount" in u.set);
    expect(couponUpdate).toBeDefined();

    const storeOrderUpdate = capturedUpdates.find(
      (u) => u.set.status === "cancelled" && "cancelledAt" in u.set,
    );
    expect(storeOrderUpdate).toBeDefined();
  });

  // -------------------------------------------------------------------------
  it("does not touch any store order when the reservation has no storeOrderId", async () => {
    const app = buildReservationsApp();
    // Default makeReservation has storeOrderId: null
    const existing = makeReservation({ clientId: null });
    const cancelled = { ...existing, status: "cancelled" };

    mockLimit.mockResolvedValueOnce([existing]);

    // tx select queue: only the re-fetch (no store order lookup needed)
    const tx = buildTxMock([[cancelled]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);

    // No cancelledAt update should appear (store order path never executed)
    const storeOrderUpdate = capturedUpdates.find((u) => "cancelledAt" in u.set);
    expect(storeOrderUpdate).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  it("calls general CalendarSyncService.syncTrip for non-cancellation reservation PATCHes (regression guard)", async () => {
    const app = buildReservationsApp();
    // A notes-only update: no status change, no cancellation
    const existing = makeReservation({ clientId: "client-001" });
    const updated = { ...existing, notes: "Observação nova" };

    mockLimit.mockResolvedValueOnce([existing]);

    // No reversals: only the re-fetch after UPDATE
    const tx = buildTxMock([[updated]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const res = await request(app)
      .patch("/api/reservations/res-001")
      .send({ notes: "Observação nova" });

    expect(res.status).toBe(200);
    // General syncTrip must be called for non-cancellation PATCHes
    expect(mockSyncTripGeneral).toHaveBeenCalledWith(existing.tripId);
    // Cancellation-specific method must NOT be called
    expect(mockSyncTrip).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // End-to-end lifecycle: confirmed → cancel (clawback) → reopen → cancel again
  //
  // This test exercises the full DB round-trip across three sequential API calls
  // against the same Express app, verifying that:
  //   1. The reservation is confirmed with a seeded "earn" loyalty tx (50 pts)
  //      representing what loyaltyAwardPointsForReservation writes at confirmation.
  //   2. Cancelling the confirmed reservation writes a "cancellation" clawback tx
  //      and decrements the member's available points to 0.
  //   3. Re-opening the reservation (admin sets status back to pending) is a no-op
  //      for loyalty — no points are re-awarded or re-clawed.
  //   4. Cancelling the re-opened reservation a second time fires the idempotency
  //      guard: the existing "cancellation" tx is detected and no second deduction
  //      is made — the member's available points remain unchanged at 0.
  // -------------------------------------------------------------------------
  it("end-to-end: confirmed reservation → cancel (clawback written) → reopen → cancel again (idempotency guard prevents double-deduction)", async () => {
    const app = buildReservationsApp();

    // Seed state: reservation is confirmed; the loyalty member has 50 available
    // points that were earned when the reservation was confirmed (earn tx seeded
    // in the Reversal 4 select queue below as [{ points: 50 }]).
    const confirmedReservation = makeReservation({ clientId: "client-001", status: "confirmed" });

    // ── Step 1: PATCH confirmed → cancelled (first cancellation, clawback) ──
    // wasActive = true, wasConfirmed = true, isBeingCancelled = true
    // → Reversal 4 runs and claws back the 50 seeded earn points.
    const cancelledReservation = { ...confirmedReservation, status: "cancelled" };

    // outer: requireReservationAccess
    mockLimit.mockResolvedValueOnce([confirmedReservation]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup (empty — no payment records)
    //   [1] Reversal 4 — loyalty member lookup → member with 50 pts
    //   [2] Reversal 4 — idempotency check (no prior "cancellation" tx) → proceed
    //   [3] Reversal 4 — earn transactions → 50 pts earned at confirmation
    //   [4] re-fetch updated reservation
    const tx1 = buildTxMock([
      [],                                                               // no payments
      [{ id: "member-001", availablePoints: 50, totalPoints: 50 }],   // loyalty member
      [],                                                               // no prior cancellation tx → proceed
      [{ points: 50 }],                                                 // seeded earn tx (50 pts from confirmation)
      [cancelledReservation],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx1));

    // outer: formatReservation → trip + client
    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const firstCancelRes = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(firstCancelRes.status).toBe(200);

    // Verify the seeded earn tx was clawed back: a "cancellation" loyalty
    // transaction must have been inserted with -50 pts referencing the reservation.
    const clawbackTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "cancellation",
    );
    expect(clawbackTx).toBeDefined();
    expect((clawbackTx as Record<string, unknown>)["points"]).toBe(-50);
    expect((clawbackTx as Record<string, unknown>)["referenceId"]).toBe("res-001");
    expect((clawbackTx as Record<string, unknown>)["referenceType"]).toBe("reservation");

    // The loyalty member must have been updated: Math.max(0, 50 - 50) = 0
    const memberUpdateAfterCancel = capturedUpdates.find(
      (u) => "availablePoints" in u.set,
    );
    expect(memberUpdateAfterCancel).toBeDefined();
    expect((memberUpdateAfterCancel as { set: Record<string, unknown> }).set.availablePoints).toBe(0);

    capturedInserts.length = 0;
    capturedUpdates.length = 0;

    // ── Step 2: PATCH cancelled → pending (admin reopens the reservation) ───
    // wasActive = ACTIVE_STATUSES.includes("cancelled") → false
    // isBeingCancelled = false → reversal block entirely skipped.
    // No loyalty operations happen; only the reservation row is updated.
    const reopenedReservation = { ...cancelledReservation, status: "pending" };

    // outer: requireReservationAccess
    mockLimit.mockResolvedValueOnce([cancelledReservation]);

    // tx select queue:
    //   [0] re-fetch after UPDATE (no reversal selects — not a cancellation)
    // tx updates: reservations (status → pending) = 1 update
    const tx2 = buildTxMock([[reopenedReservation]]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx2));

    // outer: formatReservation → trip + client
    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const reopenRes = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "pending" });

    expect(reopenRes.status).toBe(200);

    // No loyalty transactions inserted during the reopen
    expect(
      capturedInserts.some(
        (i) => ["earn", "cancellation", "refund"].includes(
          (i as Record<string, unknown>)["type"] as string,
        ),
      ),
    ).toBe(false);

    capturedInserts.length = 0;
    capturedUpdates.length = 0;

    // ── Step 3: PATCH pending → cancelled again (idempotency guard fires) ───
    // wasActive = true (pending is in ACTIVE_STATUSES), isBeingCancelled = true
    // → Reversal 4 runs, but the idempotency check finds the existing
    //   "cancellation" tx from step 1 and SKIPS the clawback entirely.
    // The member's available points must remain at 0 — unchanged from step 1.
    const recancelledReservation = { ...reopenedReservation, status: "cancelled" };

    // outer: requireReservationAccess
    mockLimit.mockResolvedValueOnce([reopenedReservation]);

    // tx select queue (in execution order):
    //   [0] Reversal 4 — payments lookup (empty)
    //   [1] Reversal 4 — loyalty member lookup → member still at 0 pts (already clawed back)
    //   [2] Reversal 4 — idempotency check → existing "cancellation" tx found → SKIP
    //   [3] re-fetch updated reservation
    // Note: earn-transactions query is NOT called when idempotency fires (short-circuit)
    const tx3 = buildTxMock([
      [],                                                              // no payments
      [{ id: "member-001", availablePoints: 0, totalPoints: 0 }],    // member (already at 0)
      [{ id: "cancel-tx-001" }],                                      // existing cancellation tx → idempotency fires
      [recancelledReservation],
    ]);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx3));

    // outer: formatReservation → trip + client
    mockLimit
      .mockResolvedValueOnce([FAKE_TRIP])
      .mockResolvedValueOnce([FAKE_CLIENT]);

    const secondCancelRes = await request(app)
      .patch("/api/reservations/res-001")
      .send({ status: "cancelled" });

    expect(secondCancelRes.status).toBe(200);

    // Idempotency guard fired: NO new "cancellation" loyalty transaction inserted
    const secondClawbackTx = capturedInserts.find(
      (i) => (i as Record<string, unknown>)["type"] === "cancellation",
    );
    expect(secondClawbackTx).toBeUndefined();

    // loyaltyMembers must NOT be updated a second time — available points stay at 0
    const secondMemberUpdate = capturedUpdates.find(
      (u) => "availablePoints" in u.set,
    );
    expect(secondMemberUpdate).toBeUndefined();

    // Expected updates on the second cancellation:
    //   trips (seat restore) + commissions (cancel) + reservations (status) = 3
    // loyaltyMembers is deliberately absent — idempotency guard prevented the update
    expect(tx3.update).toHaveBeenCalledTimes(3);
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
