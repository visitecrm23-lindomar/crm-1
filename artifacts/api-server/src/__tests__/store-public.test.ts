/**
 * HTTP integration tests for POST /api/public/store/:slug/orders
 *
 * Tests the checkout endpoint in isolation by mocking the DB layer (vi.mock)
 * so no real database is required.  The real Express route handlers run against
 * a supertest HTTP client so all middleware and error-handler paths are exercised.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// vi.hoisted: shared mock factories must exist before any vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, limit: mockLimit }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockTransaction = vi.fn();

  return { mockLimit, mockWhere, mockFrom, mockSelect, mockTransaction };
});

// ---------------------------------------------------------------------------
// Module mocks (must appear before router import)
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
  tripsTable: {},
  clientsTable: {},
  usersTable: {},
  referralsTable: {},
  referralSettingsTable: {},
  referralTrackingTable: {},
  dealsTable: {},
  pipelineStagesTable: {},
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

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../lib/pricing.js", () => ({
  normalizeOrderEmail: vi.fn((e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : null)),
}));

// ---------------------------------------------------------------------------
// Import router AFTER mocks
// ---------------------------------------------------------------------------

import storePublicRouter from "../routes/store-public.js";
import { errorHandler } from "../middlewares/errorHandler.js";

// ---------------------------------------------------------------------------
// Minimal Express app
// ---------------------------------------------------------------------------

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  const noop = () => {};
  req.log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
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

const FAKE_PRODUCT = {
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
  tripId: null,
};

const FAKE_ORDER = {
  id: "gen-id",
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
  paymentProvider: "manual",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const VALID_BODY = {
  customerName: "Maria Souza",
  customerEmail: "maria@example.com",
  items: [{ productId: "prod-001", quantity: 1 }],
};

function buildTxMock() {
  return {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
    select: vi.fn(() => ({ from: mockFrom })),
  };
}

// ---------------------------------------------------------------------------
// Tests: POST /api/public/store/:slug/orders
// ---------------------------------------------------------------------------

describe("POST /api/public/store/:slug/orders — checkout endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit });
    mockSelect.mockReturnValue({ from: mockFrom });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(buildTxMock()),
    );
  });

  // ── 1. Validation errors (400) ────────────────────────────────────────────

  it("returns 400 when customerName is missing", async () => {
    mockLimit.mockResolvedValueOnce([FAKE_STORE]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ customerEmail: "maria@example.com", items: [{ productId: "p1", quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when customerEmail is missing", async () => {
    mockLimit.mockResolvedValueOnce([FAKE_STORE]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ customerName: "Maria", items: [{ productId: "p1", quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when customerEmail is not a valid email address", async () => {
    mockLimit.mockResolvedValueOnce([FAKE_STORE]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ customerName: "Maria", customerEmail: "not-an-email", items: [{ productId: "p1", quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when items array is empty", async () => {
    mockLimit.mockResolvedValueOnce([FAKE_STORE]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ customerName: "Maria", customerEmail: "maria@example.com", items: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when items field is missing entirely", async () => {
    mockLimit.mockResolvedValueOnce([FAKE_STORE]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ customerName: "Maria", customerEmail: "maria@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  // ── 2. Store not found (404) ──────────────────────────────────────────────

  it("returns 404 when store slug does not exist", async () => {
    mockLimit.mockResolvedValueOnce([]); // store not found

    const res = await request(buildApp())
      .post("/api/public/store/nonexistent-store/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  // ── 3. Out-of-stock product ───────────────────────────────────────────────

  it("returns 409 with INSUFFICIENT_STOCK when product stock is exhausted", async () => {
    const outOfStockProduct = {
      ...FAKE_PRODUCT,
      trackInventory: true,
      allowBackorder: false,
      stockQuantity: 0,
    };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])     // getActiveStore
      .mockResolvedValueOnce([outOfStockProduct]); // product fetch

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
  });

  it("returns 409 with INSUFFICIENT_STOCK when requested quantity exceeds available stock", async () => {
    const lowStockProduct = {
      ...FAKE_PRODUCT,
      trackInventory: true,
      allowBackorder: false,
      stockQuantity: 1,
    };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([lowStockProduct]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({
        ...VALID_BODY,
        items: [{ productId: "prod-001", quantity: 5 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("INSUFFICIENT_STOCK");
  });

  // ── 4. Coupon validation ──────────────────────────────────────────────────

  it("returns 400 with COUPON_EXPIRED when coupon date range has passed", async () => {
    const expiredCoupon = {
      id: "coupon-001",
      storeId: "store-001",
      code: "EXPIRED10",
      type: "percentage",
      value: "10.00",
      isActive: true,
      startsAt: new Date("2020-01-01"),
      expiresAt: new Date("2020-12-31"),
      usageLimit: null,
      usageCount: 0,
      maxDiscountAmount: null,
    };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([FAKE_PRODUCT])
      .mockResolvedValueOnce([expiredCoupon]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ ...VALID_BODY, couponCode: "EXPIRED10" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COUPON_EXPIRED");
  });

  it("returns 400 with COUPON_USAGE_LIMIT_EXCEEDED when coupon has reached its usage cap", async () => {
    const maxedCoupon = {
      id: "coupon-002",
      storeId: "store-001",
      code: "MAXED20",
      type: "fixed",
      value: "20.00",
      isActive: true,
      startsAt: new Date("2020-01-01"),
      expiresAt: new Date("2099-12-31"),
      usageLimit: 5,
      usageCount: 5,
      maxDiscountAmount: null,
    };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([FAKE_PRODUCT])
      .mockResolvedValueOnce([maxedCoupon]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ ...VALID_BODY, couponCode: "MAXED20" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COUPON_USAGE_LIMIT_EXCEEDED");
  });

  it("returns 200 and applies fixed discount when coupon is valid (type=fixed)", async () => {
    const fixedCoupon = {
      id: "coupon-003",
      storeId: "store-001",
      code: "SAVE20",
      type: "fixed",
      value: "20.00",
      isActive: true,
      startsAt: new Date("2020-01-01"),
      expiresAt: new Date("2099-12-31"),
      usageLimit: null,
      usageCount: 0,
      maxDiscountAmount: null,
    };
    const discountedOrder = { ...FAKE_ORDER, discountAmount: "20.00", totalAmount: "130.00" };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([FAKE_PRODUCT])
      .mockResolvedValueOnce([fixedCoupon])
      .mockResolvedValueOnce([discountedOrder])
      .mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ ...VALID_BODY, couponCode: "SAVE20" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orderId");
    expect(parseFloat(res.body.totalAmount)).toBe(130);
  });

  it("returns 200 and applies percentage discount when coupon is valid (type=percentage)", async () => {
    const percentCoupon = {
      id: "coupon-004",
      storeId: "store-001",
      code: "PERC10",
      type: "percentage",
      value: "10.00",
      isActive: true,
      startsAt: new Date("2020-01-01"),
      expiresAt: new Date("2099-12-31"),
      usageLimit: null,
      usageCount: 0,
      maxDiscountAmount: null,
    };
    const discountedOrder = { ...FAKE_ORDER, discountAmount: "15.00", totalAmount: "135.00" };

    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])
      .mockResolvedValueOnce([FAKE_PRODUCT])
      .mockResolvedValueOnce([percentCoupon])
      .mockResolvedValueOnce([discountedOrder])
      .mockResolvedValue([]);

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send({ ...VALID_BODY, couponCode: "PERC10" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orderId");
    expect(parseFloat(res.body.totalAmount)).toBe(135);
  });

  // ── 5. Valid order (200) ──────────────────────────────────────────────────

  it("returns 200 with orderId when all fields are valid and product is in stock", async () => {
    mockLimit
      .mockResolvedValueOnce([FAKE_STORE])    // getActiveStore
      .mockResolvedValueOnce([FAKE_PRODUCT])  // product fetch (no tripId, no inventory)
      .mockResolvedValueOnce([FAKE_ORDER])    // post-tx order re-fetch
      .mockResolvedValue([]);                 // items fetch (and any extra selects)

    const res = await request(buildApp())
      .post("/api/public/store/minha-loja/orders")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("orderId");
    expect(res.body).toHaveProperty("orderNumber");
    expect(res.body).toHaveProperty("totalAmount");
  });
});
