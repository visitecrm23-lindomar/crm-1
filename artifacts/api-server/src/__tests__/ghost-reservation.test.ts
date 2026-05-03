import { randomUUID } from "crypto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import express from "express";
import request from "supertest";
import {
  db,
  tenantsTable,
  usersTable,
  tripsTable,
  clientsTable,
  storesTable,
  storeProductsTable,
  storeOrdersTable,
  reservationsTable,
} from "@workspace/db";

const { mockNextSeq } = vi.hoisted(() => ({ mockNextSeq: vi.fn() }));

// Clerk mock: createUser rejects with form_identifier_exists so the route sets
// newClerkId = null and skips db.insert(usersTable) — no fire-and-forget DB writes
vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: {
      createUser: vi.fn().mockRejectedValue({ errors: [{ code: "form_identifier_exists" }] }),
    },
    signInTokens: { createSignInToken: vi.fn() },
  },
  getAuth: vi.fn(() => ({ userId: "test_clerk" })),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/seat-sse.js", () => ({ addSeatClient: vi.fn(), removeSeatClient: vi.fn(), emitSeatUpdate: vi.fn() }));
vi.mock("../lib/realtime.js", () => ({ broadcastSeatUpdate: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/tenant.js", () => ({ requireAuth: vi.fn(), getTenantUser: vi.fn(), ADMIN_ROLES: ["admin"], MANAGEMENT_ROLES: ["admin", "gerente"] }));
vi.mock("../routes/payments.js", () => ({ syncReservationCommission: vi.fn().mockResolvedValue(undefined), default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), use: vi.fn() } }));
vi.mock("../queues/email-helpers.js", () => ({ enqueueReservationConfirmationEmail: vi.fn().mockResolvedValue(undefined), enqueueReservationCancellationEmail: vi.fn().mockResolvedValue(undefined), sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/google-calendar/sync-service.js", () => ({ CalendarSyncService: { syncTrip: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../lib/activities.js", () => ({ writeClientActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/pricing.js", () => ({
  normalizeOrderEmail: vi.fn((e: unknown) => typeof e === "string" ? e.trim().toLowerCase() : null),
  roundMoney: vi.fn((v: number) => Math.round(v * 100) / 100),
}));
vi.mock("../lib/reservation-number.js", () => ({
  getTenantReservationPrefix: vi.fn().mockResolvedValue("AG"),
  nextReservationSequence: mockNextSeq,
  buildReservationNumber: vi.fn(() => "AG-EX-202507-0001"),
  getYearMonth: vi.fn(() => "202507"),
  tripTypeToCode: vi.fn(() => "EX"),
}));
vi.mock("../lib/id.js", () => ({
  generateId: vi.fn(() => randomUUID()),
  generateVoucherCode: vi.fn(() => `VCH-${randomUUID().slice(0, 8).toUpperCase()}`),
  generateReferralCode: vi.fn(() => "REF-0001"),
}));

import { requireAuth } from "../lib/tenant.js";
import storePublicRouter from "../routes/store-public.js";
import { errorHandler } from "../middlewares/errorHandler.js";

const RUN       = randomUUID().replace(/-/g, "").slice(0, 8);
const TENANT_ID = `ghtst-${RUN}`;
const USER_ID   = `ghu-${RUN}`;
const STORE_ID  = `ghs-${RUN}`;
const TRIP_ID   = `ght-${RUN}`;
const PROD_ID   = `ghp-${RUN}`;
const SLUG      = `ghost-store-${RUN}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next) => {
    const noop = () => {};
    (req as unknown as Record<string, unknown>).log = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
    (req as unknown as Record<string, unknown>).id = "test-req";
    next();
  });
  app.use("/api", storePublicRouter);
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  vi.mocked(requireAuth).mockResolvedValue({} as never);
  await db.insert(tenantsTable).values({ id: TENANT_ID, name: "Ghost Agency", slug: `ghost-agency-${RUN}`, email: `ghost-${RUN}@agency.com`, planId: "starter", status: "trial" });
  await db.insert(usersTable).values({ id: USER_ID, clerkId: `ghost_clerk_${RUN}`, tenantId: TENANT_ID, name: "Ghost Agent", email: `ghost-agent-${RUN}@agency.com`, role: "admin", referralCode: `GHRF${RUN.toUpperCase()}` });
  await db.insert(storesTable).values({ id: STORE_ID, tenantId: TENANT_ID, slug: SLUG, name: "Ghost Store", email: `store-${RUN}@agency.com` });
  await db.insert(tripsTable).values({ id: TRIP_ID, tenantId: TENANT_ID, name: "Ghost Trip", slug: `ghost-trip-${RUN}`, destination: "Fortaleza", destinationCity: "Fortaleza", destinationState: "CE", type: "excursao", category: "standard", departureDate: new Date("2027-06-01"), totalCapacity: 40, availableSeats: 40, reservedSeats: 0, priceAdult: "300", createdById: USER_ID });
  await db.insert(storeProductsTable).values({ id: PROD_ID, storeId: STORE_ID, type: "trip", name: "Excursão Nordeste", slug: `excursao-nordeste-${RUN}`, price: "300", status: "active", trackInventory: false, tripId: TRIP_ID });
});

afterAll(async () => {
  // Short settle to let the fire-and-forget IIFE finish before cascaded deletes
  await new Promise((resolve) => setTimeout(resolve, 150));
  await db.delete(reservationsTable).where(eq(reservationsTable.tenantId, TENANT_ID));
  await db.delete(storeOrdersTable).where(eq(storeOrdersTable.storeId, STORE_ID));
  await db.delete(clientsTable).where(eq(clientsTable.tenantId, TENANT_ID));
  await db.delete(storeProductsTable).where(eq(storeProductsTable.storeId, STORE_ID));
  await db.delete(storesTable).where(eq(storesTable.id, STORE_ID));
  await db.delete(tripsTable).where(eq(tripsTable.id, TRIP_ID));
  await db.delete(usersTable).where(eq(usersTable.tenantId, TENANT_ID));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, TENANT_ID));
});

describe("Ghost reservation prevention — checkout route (real DB)", () => {
  it("leaves no client row when transaction rolls back after client insert", async () => {
    const email = `ghost-customer-${RUN}@test.com`;

    // Throw after tx.insert(clientsTable) to force a full rollback
    mockNextSeq.mockRejectedValueOnce(new Error("Simulated sequence failure after client insert"));

    const res = await request(buildApp())
      .post(`/api/public/store/${SLUG}/orders`)
      .send({ customerName: "Ghost Customer", customerEmail: email, items: [{ productId: PROD_ID, quantity: 1 }] });

    // Confirm execution reached the mid-tx failure point
    expect(mockNextSeq).toHaveBeenCalledTimes(1);
    expect(res.status).toBeGreaterThanOrEqual(400);

    const [orphan] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, TENANT_ID), eq(clientsTable.email, email)));
    expect(orphan).toBeUndefined();
  });
});

describe("Reservation TTL — expiresAt on persisted reservation (real DB)", () => {
  it("persists expiresAt ~15 min in the future and surfaces reservationExpiresAt in the response", async () => {
    const email = `ttl-customer-${RUN}@test.com`;
    mockNextSeq.mockResolvedValueOnce(1);

    const beforeRequest = Date.now();
    const res = await request(buildApp())
      .post(`/api/public/store/${SLUG}/orders`)
      .send({ customerName: "TTL Customer", customerEmail: email, items: [{ productId: PROD_ID, quantity: 1 }] });
    const afterRequest = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reservationExpiresAt");
    expect(new Date(res.body.reservationExpiresAt as string).getTime()).toBeGreaterThan(Date.now());

    const [client] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(and(eq(clientsTable.tenantId, TENANT_ID), eq(clientsTable.email, email)));
    expect(client).toBeDefined();

    // expiresAt is not yet in the compiled Drizzle insert type; use raw SQL to read it
    const result = await db.execute(sql`
      SELECT expires_at FROM reservations
      WHERE tenant_id = ${TENANT_ID} AND client_id = ${client.id}
      LIMIT 1
    `);
    const rawExpiresAt = result.rows[0]?.expires_at;
    expect(rawExpiresAt).toBeDefined();
    const expiresAt = rawExpiresAt instanceof Date ? rawExpiresAt : new Date(rawExpiresAt as string);
    const fifteenMin = 15 * 60 * 1000;
    const tolerance = 30_000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(beforeRequest + fifteenMin - tolerance);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(afterRequest + fifteenMin + tolerance);
  });
});
