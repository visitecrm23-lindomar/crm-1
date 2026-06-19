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
  mockSendWelcomeEmail,
} = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const mockTransaction = vi.fn();
  const mockBroadcastSeatUpdate = vi.fn().mockResolvedValue(undefined);
  const mockWriteClientActivity = vi.fn().mockResolvedValue(undefined);
  const mockEnqueueConfirmationEmail = vi.fn().mockResolvedValue(undefined);
  const mockSendWelcomeEmail = vi.fn().mockResolvedValue(undefined);
  return {
    selectQueue,
    mockTransaction,
    mockBroadcastSeatUpdate,
    mockWriteClientActivity,
    mockEnqueueConfirmationEmail,
    mockSendWelcomeEmail,
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
  enqueueNewBookingNotificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: mockSendWelcomeEmail,
}));

vi.mock("../lib/reservation-number.js", () => ({
  getTenantReservationPrefix: vi.fn().mockResolvedValue("AG"),
  nextReservationSequence: vi.fn().mockResolvedValue(1),
  buildReservationNumber: vi.fn(() => "AG-EX-202507-0001"),
  getYearMonth: vi.fn(() => "202507"),
  tripTypeToCode: vi.fn(() => "EX"),
}));

vi.mock("../lib/client-notifications.js", () => ({
  insertClientNotification: vi.fn().mockResolvedValue(undefined),
  getRecentNotifications: vi.fn().mockResolvedValue([]),
  getUnreadCount: vi.fn().mockResolvedValue(0),
  markAllRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
  generateVoucherCode: vi.fn(() => "VCHR-0001"),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

vi.mock("../lib/referral-code.js", () => ({
  generateAndAssignReferralCode: vi.fn().mockResolvedValue("REF-CODE-001"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import storePublicRouter from "../routes/store-public.js";
import { errorHandler } from "../middlewares/errorHandler.js";
import { clerkClient } from "@clerk/express";

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
  function makeTxSelect() {
    const value = (selectQueue as unknown[][]).shift() ?? [];
    const limitFn = vi.fn().mockResolvedValue(value);
    const thenableResult = Object.assign(Promise.resolve(value), { limit: limitFn });
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => thenableResult),
        limit: limitFn,
      })),
    };
  }
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
    select: vi.fn(makeTxSelect),
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

const FAKE_RESERVATION = {
  reservationId: "res-001",
  reservationNumber: "AG-EX-202507-0001",
  voucherCode: "VCH-001",
  seats: [],
  totalValue: "150.00",
  tripName: "Excursão Nordeste",
  tripDestination: "Fortaleza",
  tripDepartureDate: new Date("2027-06-01"),
  tripReturnDate: null,
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
    [FAKE_STORE],                                                 // 1. getActiveStore (db)
    [FAKE_TRIP_PRODUCT],                                          // 2. product fetch (db, prepareCheckoutItems)
    [{ availableSeats: 10 }],                                     // 3. trip seats check (db, prepareCheckoutItems)
    [{ id: "user-001" }],                                         // 4. admin user (tx, persist-order)
    [{ id: "client-001", cpf: null, birthDate: null }],           // 5. existing client (tx, upsertCheckoutClient)
    [FAKE_ORDER],                                                 // 6. post-tx order (db)
    [],                                                           // 7. post-tx items (db)
    [],                                                           // 8. portal user check (db, ensurePortalAccount) — existing user
  );
}

function setupNewUserCheckoutQueue() {
  selectQueue.length = 0;
  selectQueue.push(
    [FAKE_STORE],                                                 // 1. getActiveStore (db)
    [FAKE_TRIP_PRODUCT],                                          // 2. product fetch (db, prepareCheckoutItems)
    [{ availableSeats: 10 }],                                     // 3. trip seats check (db, prepareCheckoutItems)
    [{ id: "user-001" }],                                         // 4. admin user (tx, persist-order)
    [{ id: "client-001", cpf: null, birthDate: null }],           // 5. existing client (tx, upsertCheckoutClient)
    [FAKE_ORDER],                                                 // 6. post-tx order (db)
    [],                                                           // 7. post-tx items (db)
    [],                                                           // 8. portal user check — empty → new user (db, ensurePortalAccount)
    [],                                                           // 9. reservation query for confirmation email (no reservation yet)
    [],                                                           // 10. agency notification reservation rows (no reservation yet)
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

  it("(b) records writeClientActivity with order_created after a trip-linked checkout", async () => {
    setupTripLinkedCheckoutQueue();

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockWriteClientActivity).toHaveBeenCalledOnce();
    expect(mockWriteClientActivity).toHaveBeenCalledWith(
      "client-001",
      "order_created",
      expect.stringContaining("loja"),
      "client-001",
      expect.any(Object),
    );
  });

  // ── Non-trip products — no seat update, no activity ─────────────────────

  it("does not call broadcastSeatUpdate or writeClientActivity for non-trip products", async () => {
    selectQueue.length = 0;
    selectQueue.push(
      [FAKE_STORE],                                // 1. getActiveStore
      [{ ...FAKE_TRIP_PRODUCT, tripId: null }],   // 2. product fetch (non-trip, no seat check)
      [],                                          // 3. admin user (tx) — empty → no client created
      [FAKE_ORDER],                                // 4. post-tx order
      [],                                          // 5. post-tx items
    );

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(mockBroadcastSeatUpdate).not.toHaveBeenCalled();
    expect(mockWriteClientActivity).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Welcome e-mail + reservation confirmation credentials — new user happy path
// ---------------------------------------------------------------------------

describe("POST /api/public/store/:slug/orders — welcome email for new portal user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWelcomeEmail.mockResolvedValue(undefined);
    mockEnqueueConfirmationEmail.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(buildTxMock()),
    );
    vi.mocked(clerkClient.users.createUser).mockResolvedValue({
      id: "clerk-user-new",
    } as never);
    vi.mocked(clerkClient.signInTokens.createSignInToken).mockResolvedValue({
      url: "https://clerk.test/magic",
    } as never);
  });

  // ── (c) sendWelcomeEmail receives plainTextPassword ──────────────────────

  it("(c) calls sendWelcomeEmail with a non-empty plainTextPassword for a brand-new customer", async () => {
    setupNewUserCheckoutQueue();

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(mockSendWelcomeEmail).toHaveBeenCalledOnce());

    const [welcomeProps] = mockSendWelcomeEmail.mock.calls[0] as [Record<string, unknown>];
    expect(typeof welcomeProps.plainTextPassword).toBe("string");
    expect((welcomeProps.plainTextPassword as string).length).toBeGreaterThan(0);
    expect(welcomeProps.clientEmail).toBe(VALID_BODY.customerEmail);
  });

  // ── (d) enqueueReservationConfirmationEmail is NOT sent at checkout (payment-gated design)
  //
  // Reservations are created only after payment confirmation (webhook/manual payment),
  // so no reservation confirmation email is enqueued during the checkout route.
  // The confirmation email is dispatched from createReservationsForOrder at payment time.

  it("(d) enqueueReservationConfirmationEmail is not called at checkout (reservation created at payment time)", async () => {
    setupNewUserCheckoutQueue();

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);

    // Allow any async fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    // No confirmation email at checkout — reservation (and its email) are deferred to payment
    expect(mockEnqueueConfirmationEmail).not.toHaveBeenCalled();
  });
});
