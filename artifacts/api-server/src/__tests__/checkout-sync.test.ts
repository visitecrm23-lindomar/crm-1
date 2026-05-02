/**
 * Checkout synchronisation tests — POST /api/public/store/:slug/orders
 *
 * (a) broadcastSeatUpdate is called with the correct tripId + tenantId after a
 *     successful trip-linked checkout.
 * (b) writeClientActivity is called with "reservation_created" and the correct
 *     clientId / createdById after a successful trip-linked checkout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  selectQueue,
  mockTransaction,
  mockBroadcastSeatUpdate,
  mockWriteClientActivity,
  mockEnqueueConfirmationEmail,
} = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const mockTransaction = vi.fn();
  const mockBroadcastSeatUpdate = vi.fn().mockResolvedValue(undefined);
  const mockWriteClientActivity = vi.fn().mockResolvedValue(undefined);
  const mockEnqueueConfirmationEmail = vi.fn().mockResolvedValue(undefined);
  return {
    selectQueue,
    mockTransaction,
    mockBroadcastSeatUpdate,
    mockWriteClientActivity,
    mockEnqueueConfirmationEmail,
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  function makeDbSelect() {
    const value = (selectQueue as unknown[][]).shift() ?? [];
    const limitFn = vi.fn().mockResolvedValue(value);
    const thenableResult = Object.assign(Promise.resolve(value), { limit: limitFn });
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => thenableResult),
        limit: limitFn,
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({ where: vi.fn(() => thenableResult) })),
          where: vi.fn(() => thenableResult),
        })),
      })),
    };
  }

  return {
    db: {
      select: vi.fn(makeDbSelect),
      insert: vi.fn(() => ({
        values: vi.fn(() =>
          Object.assign(Promise.resolve([]), {
            onConflictDoNothing: vi.fn().mockResolvedValue([]),
          }),
        ),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
      transaction: mockTransaction,
    },
    storesTable: {},
    storeProductsTable: {},
    storeProductVariantsTable: {},
    storeCategoriesTable: {},
    storeOrdersTable: {},
    storeOrderItemsTable: {},
    storeCouponsTable: {},
    storeReviewsTable: {},
    storeReferralTrackingTable: {},
    reservationsTable: {},
    passengersTable: {},
    tripsTable: {},
    clientsTable: {},
    usersTable: {},
    referralsTable: {},
    referralTrackingTable: {},
    referralSettingsTable: {},
    pipelineStagesTable: {},
    dealsTable: {},
    loyaltyMembersTable: {},
    loyaltyTransactionsTable: {},
    loyaltyProgramsTable: {},
    tenantsTable: {},
    emailLogsTable: {},
  };
});

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
  clerkClient: {
    users: {
      createUser: vi.fn().mockRejectedValue(new Error("clerk unavailable in tests")),
    },
    signInTokens: {
      createSignInToken: vi.fn().mockRejectedValue(new Error("clerk unavailable in tests")),
    },
  },
  getAuth: vi.fn(() => ({ userId: "user_test" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/seat-sse.js", () => ({
  addSeatClient: vi.fn(),
  removeSeatClient: vi.fn(),
  emitSeatUpdate: vi.fn(),
}));

vi.mock("../lib/realtime.js", () => ({
  broadcastSeatUpdate: mockBroadcastSeatUpdate,
}));

vi.mock("../lib/activities.js", () => ({
  writeClientActivity: mockWriteClientActivity,
}));

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: mockEnqueueConfirmationEmail,
  enqueueReservationCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/reservation-number.js", () => ({
  getTenantReservationPrefix: vi.fn().mockResolvedValue("AG"),
  nextReservationSequence: vi.fn().mockResolvedValue(1),
  buildReservationNumber: vi.fn(() => "AG-EX-202507-0001"),
  getYearMonth: vi.fn(() => "202507"),
  tripTypeToCode: vi.fn(() => "EX"),
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
  generateVoucherCode: vi.fn(() => "VCHR-0001"),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import storePublicRouter from "../routes/store-public.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  const noop = (..._args: unknown[]) => {};
  req.log = {
    trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
  } as never;
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", storePublicRouter);
  app.use(errorHandler);
  return app;
}

function buildTxMock() {
  return {
    execute: vi.fn().mockResolvedValue({
      rows: [{ id: "trip-001", available_seats: 10, type: "excursao" }],
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() =>
        Object.assign(Promise.resolve([]), {
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }),
      ),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const FAKE_STORE = {
  id: "store-001",
  tenantId: "tenant-001",
  slug: "minha-loja",
  name: "Minha Loja",
  isActive: true,
  maintenanceMode: false,
  logo: null,
  contactWhatsapp: null,
  contactPhone: null,
  contactEmail: null,
  customDomain: null,
};

const FAKE_TRIP_PRODUCT = {
  id: "prod-001",
  storeId: "store-001",
  name: "Excursão Nordeste",
  type: "trip",
  price: "150.00",
  salePrice: null,
  onSale: false,
  trackInventory: false,
  allowBackorder: false,
  stockQuantity: null,
  salesCount: 0,
  status: "active",
  thumbnail: null,
  tripId: "trip-001",
};

const FAKE_ORDER = {
  id: "order-001",
  storeId: "store-001",
  tenantId: "tenant-001",
  orderNumber: "#2026-00001",
  customerName: "Maria Souza",
  customerEmail: "maria@example.com",
  subtotal: "150.00",
  discountAmount: "0.00",
  totalAmount: "150.00",
  status: "pending",
  paymentMethod: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VALID_BODY = {
  customerName: "Maria Souza",
  customerEmail: "maria@example.com",
  items: [{ productId: "prod-001", quantity: 1 }],
};

// ---------------------------------------------------------------------------
// Queue setup
// ---------------------------------------------------------------------------

function setupTripLinkedCheckoutQueue() {
  selectQueue.length = 0;
  selectQueue.push(
    [FAKE_STORE],                                                 // 1. getActiveStore
    [FAKE_TRIP_PRODUCT],                                          // 2. product fetch
    [{ availableSeats: 10 }],                                     // 3. Phase 1.5 — trip seats
    [{ id: "user-001" }],                                         // 4. Phase 2.5 — admin user
    [{ id: "client-001", cpf: null, birthDate: null }],           // 5. Phase 2.5 — existing client
    [],                                                           // 6. Pipeline stages (awaited directly)
    [{ id: "trip-001", name: "Excursão Nordeste" }],              // 7. Trip names (awaited directly)
    [FAKE_ORDER],                                                 // 8. Post-tx order
    [],                                                           // 9. Post-tx items (awaited directly)
    [],                                                           // 10. IIFE — portal user check
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/public/store/:slug/orders — checkout sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBroadcastSeatUpdate.mockResolvedValue(undefined);
    mockWriteClientActivity.mockResolvedValue(undefined);
    mockEnqueueConfirmationEmail.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(buildTxMock()),
    );
  });

  // ── (a) broadcastSeatUpdate ──────────────────────────────────────────────

  it("(a) calls broadcastSeatUpdate with the correct tripId and tenantId after a trip-linked checkout", async () => {
    setupTripLinkedCheckoutQueue();

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockBroadcastSeatUpdate).toHaveBeenCalledOnce();
    expect(mockBroadcastSeatUpdate).toHaveBeenCalledWith("trip-001", "tenant-001");
  });

  // ── (b) writeClientActivity ──────────────────────────────────────────────

  it("(b) records writeClientActivity with reservation_created after a trip-linked checkout", async () => {
    setupTripLinkedCheckoutQueue();

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockWriteClientActivity).toHaveBeenCalledOnce();
    expect(mockWriteClientActivity).toHaveBeenCalledWith(
      "client-001",
      "reservation_created",
      expect.stringContaining("vitrine"),
      "user-001",
      expect.any(Object),
    );
  });

  // ── Non-trip products — no seat update, no activity ─────────────────────

  it("does not call broadcastSeatUpdate or writeClientActivity for non-trip products", async () => {
    selectQueue.length = 0;
    selectQueue.push(
      [FAKE_STORE],
      [{ ...FAKE_TRIP_PRODUCT, tripId: null }],  // non-trip product
      [FAKE_ORDER],
      [],
    );

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockBroadcastSeatUpdate).not.toHaveBeenCalled();
    expect(mockWriteClientActivity).not.toHaveBeenCalled();
  });
});
