import { ROLES } from "@workspace/permissions";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { selectQueue, mockSelect, mockUpdate } = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  return { selectQueue, mockSelect, mockUpdate };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    transaction: vi.fn(),
  },
  tripsTable: {},
  reservationsTable: {},
  tenantsTable: {},
  plansTable: {},
  passengersTable: {},
  clientsTable: {},
  usersTable: {},
  storesTable: {},
  storeOrdersTable: {},
  storeOrderItemsTable: {},
  storeProductsTable: {},
  storeProductVariantsTable: {},
  storeCouponsTable: {},
  storeReviewsTable: {},
  storeCategoriesTable: {},
  loyaltyMembersTable: {},
  loyaltyTransactionsTable: {},
  loyaltyProgramsTable: {},
  referralsTable: {},
  referralSettingsTable: {},
  dealsTable: {},
  pipelineStagesTable: {},
  emailLogsTable: {},
  referralTrackingTable: {},
  paymentsTable: {},
  commissionsTable: {},
  vehicleLayoutsTable: {},
  auditLogsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...a) => a),
  or: vi.fn((...a) => a),
  inArray: vi.fn((_col: unknown, ids: unknown) => ids),
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
  ADMIN_ROLES: ["superadmin", "agencia"],
  MANAGEMENT_ROLES: ["superadmin", "agencia", "gerente"],
}));

vi.mock("../lib/google-calendar/sync-service.js", () => ({
  CalendarSyncService: {
    syncTrip: vi.fn().mockResolvedValue(undefined),
    deleteEventsForTrip: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/uploadthing.js", () => ({
  deleteOrphanedFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/plan-features.js", () => ({
  hasSeatMapFeature: vi.fn(() => false),
}));

vi.mock("../lib/passenger.js", () => ({
  deriveAgeCategory: vi.fn(() => "adult"),
  getAgeYears: vi.fn(() => 30),
}));

vi.mock("../lib/planLimits.js", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => "gen-id"),
  generateVoucherCode: vi.fn(() => "VCHR-0001"),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

vi.mock("../lib/status-validators.js", () => ({
  parseTripStatus: vi.fn((s: string) => s),
}));

vi.mock("@workspace/email", () => ({
  sendManifestEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../queues/index.js", () => ({
  getPdfQueue: vi.fn(() => ({ add: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("../queues/email-helpers.js", () => ({
  enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueReservationCancellationEmail: vi.fn().mockResolvedValue(undefined),
  enqueueNewBookingNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../queues/commission-sync-helper.js", () => ({
  enqueueCommissionSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/activities.js", () => ({
  writeClientActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../routes/payments.js", () => ({
  syncReservationCommission: vi.fn().mockResolvedValue(undefined),
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), use: vi.fn() },
}));

import { requireAuth } from "../lib/tenant.js";
import tripsRouter from "../routes/trips.js";
import { errorHandler } from "../middlewares/errorHandler.js";

interface QueryChain extends Promise<unknown[]> {
  from(t?: unknown): QueryChain;
  where(c?: unknown): QueryChain;
  limit(n?: number): Promise<unknown[]>;
  orderBy(...args: unknown[]): Promise<unknown[]>;
  offset(n?: number): QueryChain;
}

function makeChain(data: unknown[]): QueryChain {
  return Object.assign(Promise.resolve(data), {
    from: vi.fn().mockImplementation(() => makeChain(data)),
    where: vi.fn().mockImplementation(() => makeChain(data)),
    limit: vi.fn().mockResolvedValue(data),
    orderBy: vi.fn().mockResolvedValue(data),
    offset: vi.fn().mockImplementation(() => makeChain(data)),
  }) as QueryChain;
}

function stubLogger(
  req: express.Request & { log?: Record<string, unknown> },
  _res: express.Response,
  next: express.NextFunction,
) {
  const noop = (..._args: unknown[]) => {};
  req.log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop } as never;
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(stubLogger);
  app.use("/api", tripsRouter);
  app.use(errorHandler);
  return app;
}

const FAKE_USER = {
  id: "user-001",
  tenantId: "tenant-001",
  role: ROLES.AGENCY_ADMIN,
  name: "Test Agent",
  email: "agent@example.com",
};

const FAKE_TRIP = {
  id: "trip-001",
  name: "Excursão Nordeste",
  slug: "excursao-nordeste-t001",
  description: null,
  destination: "Fortaleza",
  destinationCity: "Fortaleza",
  destinationState: "CE",
  type: "nacional",
  category: "turismo",
  departureDate: new Date("2025-07-10"),
  returnDate: null,
  totalCapacity: 46,
  availableSeats: 44,
  reservedSeats: 1,
  confirmedSeats: 1,
  priceAdult: "500",
  priceChild: null,
  priceSenior: null,
  inclusions: [],
  exclusions: [],
  coverImage: null,
  gallery: [],
  itinerary: [],
  boardingPoints: [],
  status: "active",
  isPublic: true,
  isFeatured: false,
  vehiclePlate: null,
  vehicleType: null,
  driverName: null,
  tourGuide: null,
  tripOrganizer: null,
  driver1Cpf: null,
  driver1Cnh: null,
  driver1CnhCategory: null,
  driver1CnhExpiry: null,
  driver2Name: null,
  driver2Cpf: null,
  driver2Cnh: null,
  driver2CnhCategory: null,
  driver2CnhExpiry: null,
  tourGuideCpf: null,
  tourGuideRegistration: null,
  manifestNumber: null,
  seatLayout: "2x2",
  layoutId: null,
  showSeatMap: true,
  fixedCosts: [],
  variableCosts: [],
  freeOrganizers: null,
  freeGuides: null,
  freePassengers: [],
  originCity: null,
  originState: null,
  departureTime: null,
  returnTime: null,
  seatMap: null,
  tenantId: "tenant-001",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const TENANT_ROW = { planId: "starter" };
const PLAN_ROW = { supportedFeatures: [] };

describe("PATCH /api/trips/:id — free passenger seat conflict rule", () => {
  const requireAuthMock = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue.length = 0;
    requireAuthMock.mockResolvedValue(FAKE_USER as never);
    mockSelect.mockImplementation(() => makeChain(selectQueue.shift() ?? []));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("returns 422 with code SEAT_CONFLICT when a free passenger seat overlaps a pending reservation", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [{ seats: ["5", "6"] }],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({
        freePassengers: [
          { id: "fp-001", name: "João Guia", cpf: "111.222.333-44", whatsapp: "11999990000", role: "guide", seatNumber: "5" },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SEAT_CONFLICT");
    expect(Array.isArray(res.body.conflictingSeats)).toBe(true);
    expect(res.body.conflictingSeats).toContain("5");
  });

  it("returns 422 with code SEAT_CONFLICT when a free passenger seat overlaps a confirmed reservation", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [{ seats: ["10"] }, { seats: ["12"] }],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({
        freePassengers: [
          { id: "fp-002", name: "Ana Organizadora", cpf: "555.666.777-88", whatsapp: "11988880000", role: "organizer", seatNumber: "12" },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("SEAT_CONFLICT");
    expect(res.body.conflictingSeats).toContain("12");
  });

  it("returns 200 when free passenger seats are clear of all active reservations", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [{ seats: ["1", "2"] }],
      [FAKE_TRIP],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({
        freePassengers: [
          { id: "fp-003", name: "Pedro Guia", cpf: "222.333.444-55", whatsapp: "11977770000", role: "guide", seatNumber: "45" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("trip-001");
  });

  it("returns 200 when there are no active reservations at all", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [],
      [FAKE_TRIP],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({
        freePassengers: [
          { id: "fp-004", name: "Maria Organizadora", cpf: "333.444.555-66", whatsapp: "11966660000", role: "organizer", seatNumber: "3" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("trip-001");
  });

  it("returns 200 when freePassengers have no seatNumber set (null)", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [FAKE_TRIP],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({
        freePassengers: [
          { id: "fp-005", name: "Carlos Guia", cpf: "444.555.666-77", whatsapp: "11955550000", role: "guide", seatNumber: null },
          { id: "fp-006", name: "Rita Organizadora", cpf: "555.666.777-88", whatsapp: "11944440000", role: "organizer", seatNumber: null },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("trip-001");
  });

  it("returns 200 when freePassengers array is empty", async () => {
    const app = buildApp();

    selectQueue.push(
      [TENANT_ROW],
      [PLAN_ROW],
      [FAKE_TRIP],
    );

    const res = await request(app)
      .patch("/api/trips/trip-001")
      .send({ freePassengers: [] });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("trip-001");
  });
});
