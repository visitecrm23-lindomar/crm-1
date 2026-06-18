/**
 * Integration test: verifies the referral-reversal gap detection query
 * (`findReferralReversalGaps`) used by the Dashboard alerts endpoint.
 *
 * The gap fires for any CANCELLED reservation (CRM *or* store checkout) whose
 * `discount_referral_code` still maps to a COMPLETED referral that was never
 * reversed/relinked against that reservation's id. This suite confirms the three
 * paths required by the task:
 *   (a) correctly reversed (a COMPLETED referral row carries reservation_id) → no alert
 *   (b) gap: code matches a COMPLETED referral but reservation_id is null/mismatched → alert
 *   (c) already-reversed referral (status='reversed') → no alert
 *
 * Like referral-source-constraint.test.ts, this file deliberately does NOT mock
 * `@workspace/db` — it exercises the real connection (DATABASE_URL must be set)
 * so the actual SQL is evaluated by Postgres.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  db,
  tenantsTable,
  tripsTable,
  usersTable,
  reservationsTable,
  referralsTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { REFERRAL_STATUS, RESERVATION_STATUS } from "@workspace/permissions";

import { generateId } from "../lib/id";
import { findReferralReversalGaps } from "../lib/referral-reversal-gaps";

const TENANT_ID = `test-tenant-${generateId()}`;
const OTHER_TENANT_ID = `test-tenant-${generateId()}`;
const TRIP_ID = `test-trip-${generateId()}`;
const USER_ID = `test-user-${generateId()}`;

// Track ids inserted per-test so cleanup is scoped and pass/fail-safe.
const reservationIds: string[] = [];
const referralIds: string[] = [];

let voucherSeq = 0;

function makeReservation(overrides: {
  status?: string;
  discountReferralCode?: string | null;
  reservationNumber?: string | null;
}) {
  const id = `test-res-${generateId()}`;
  reservationIds.push(id);
  voucherSeq += 1;
  return {
    id,
    tenantId: TENANT_ID,
    tripId: TRIP_ID,
    seats: [],
    totalValue: "100.00",
    balance: "0.00",
    voucherCode: `TEST-VCHR-${generateId()}-${voucherSeq}`,
    qrCode: `QR-${id}`,
    createdById: USER_ID,
    status: overrides.status ?? RESERVATION_STATUS.CANCELLED,
    discountReferralCode:
      overrides.discountReferralCode === undefined ? null : overrides.discountReferralCode,
    reservationNumber: overrides.reservationNumber ?? null,
  } satisfies typeof reservationsTable.$inferInsert;
}

function makeReferral(overrides: {
  code: string;
  status?: string;
  reservationId?: string | null;
  reversalWarningAcknowledgedAt?: Date | null;
  referrerName?: string | null;
  tenantId?: string;
  createdAt?: Date;
}) {
  const id = `test-ref-${generateId()}`;
  referralIds.push(id);
  return {
    id,
    tenantId: overrides.tenantId ?? TENANT_ID,
    referrerId: `referrer-${generateId()}`,
    code: overrides.code,
    status: overrides.status ?? REFERRAL_STATUS.COMPLETED,
    reservationId: overrides.reservationId ?? null,
    reversalWarningAcknowledgedAt: overrides.reversalWarningAcknowledgedAt ?? null,
    referrerName: overrides.referrerName ?? null,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  } satisfies typeof referralsTable.$inferInsert;
}

beforeAll(async () => {
  if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL must be set to run the referral reversal gap integration test");
  }

  await db.insert(tenantsTable).values({
    id: TENANT_ID,
    name: "Gap Test Agency",
    slug: `gap-test-${generateId()}`,
    email: `gap-${generateId()}@example.com`,
  } satisfies typeof tenantsTable.$inferInsert);

  await db.insert(usersTable).values({
    id: USER_ID,
    clerkId: `clerk-${generateId()}`,
    tenantId: TENANT_ID,
    name: "Gap Test User",
    email: `gap-user-${generateId()}@example.com`,
    referralCode: `RC-${generateId()}`,
  } satisfies typeof usersTable.$inferInsert);

  await db.insert(tripsTable).values({
    id: TRIP_ID,
    tenantId: TENANT_ID,
    name: "Gap Test Trip",
    slug: `gap-trip-${generateId()}`,
    destination: "Fortaleza, CE",
    destinationCity: "Fortaleza",
    destinationState: "CE",
    type: "excursao",
    category: "nacional",
    departureDate: new Date("2025-07-10"),
    totalCapacity: 46,
    availableSeats: 46,
    priceAdult: "100.00",
    createdById: USER_ID,
  } satisfies typeof tripsTable.$inferInsert);
});

afterEach(async () => {
  if (referralIds.length > 0) {
    await db.delete(referralsTable).where(inArray(referralsTable.id, [...referralIds]));
    referralIds.length = 0;
  }
  if (reservationIds.length > 0) {
    await db.delete(reservationsTable).where(inArray(reservationsTable.id, [...reservationIds]));
    reservationIds.length = 0;
  }
});

afterAll(async () => {
  await db.delete(tripsTable).where(inArray(tripsTable.id, [TRIP_ID]));
  await db.delete(usersTable).where(inArray(usersTable.id, [USER_ID]));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [TENANT_ID, OTHER_TENANT_ID]));
});

describe("findReferralReversalGaps", () => {
  it("(a) does NOT fire when the COMPLETED referral was correctly relinked to the reservation id", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    // COMPLETED referral that DOES carry the reservation id → reversal was handled.
    await db.insert(referralsTable).values(
      makeReferral({ code, status: REFERRAL_STATUS.COMPLETED, reservationId: reservation.id }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("(b) fires for a store checkout cancellation whose code maps to a COMPLETED referral with a null reservation id", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
      reservationNumber: "AG-EX-202507-0099",
    });
    await db.insert(reservationsTable).values(reservation);

    // COMPLETED referral matched only by code; reservation_id is null (the gap).
    await db.insert(referralsTable).values(
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: null,
        referrerName: "Maria Indicadora",
      }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    const hit = gaps.find((g) => g.reservation_id === reservation.id);
    expect(hit).toBeDefined();
    expect(hit?.referral_code).toBe(code);
    expect(hit?.reservation_number).toBe("AG-EX-202507-0099");
    expect(hit?.referrer_name).toBe("Maria Indicadora");
  });

  it("(b2) fires when the COMPLETED referral's reservation_id points at a DIFFERENT reservation (mismatch)", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    await db.insert(referralsTable).values(
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: `unrelated-res-${generateId()}`,
      }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeDefined();
  });

  it("(c) does NOT fire when the matching referral is already REVERSED", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    // Referral exists for the code but is already reversed → INNER JOIN (status=COMPLETED) misses it.
    await db.insert(referralsTable).values(
      makeReferral({ code, status: REFERRAL_STATUS.REVERSED, reservationId: null }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("does NOT fire when the reversal warning was already acknowledged", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    await db.insert(referralsTable).values(
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: null,
        reversalWarningAcknowledgedAt: new Date(),
      }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("does NOT fire for a non-cancelled (confirmed) reservation", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CONFIRMED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    await db.insert(referralsTable).values(
      makeReferral({ code, status: REFERRAL_STATUS.COMPLETED, reservationId: null }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("does NOT fire for a cancelled reservation that carried no referral code", async () => {
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: null,
    });
    await db.insert(reservationsTable).values(reservation);

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("is tenant-scoped: a matching referral under a different tenant does not surface the gap", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    // Referral with the same code but a different tenant → INNER JOIN tenant filter misses it.
    await db.insert(referralsTable).values(
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: null,
        tenantId: OTHER_TENANT_ID,
      }),
    );

    const gaps = await findReferralReversalGaps(TENANT_ID);
    expect(gaps.find((g) => g.reservation_id === reservation.id)).toBeUndefined();
  });

  it("deduplicates via DISTINCT ON when multiple COMPLETED referrals share the code (no fanout)", async () => {
    const code = `GAPCODE-${generateId()}`;
    const reservation = makeReservation({
      status: RESERVATION_STATUS.CANCELLED,
      discountReferralCode: code,
    });
    await db.insert(reservationsTable).values(reservation);

    await db.insert(referralsTable).values([
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: null,
        referrerName: "Primeiro",
        createdAt: new Date("2025-01-01T00:00:00Z"),
      }),
      makeReferral({
        code,
        status: REFERRAL_STATUS.COMPLETED,
        reservationId: null,
        referrerName: "Segundo",
        createdAt: new Date("2025-02-01T00:00:00Z"),
      }),
    ]);

    const gaps = await findReferralReversalGaps(TENANT_ID);
    const hits = gaps.filter((g) => g.reservation_id === reservation.id);
    expect(hits).toHaveLength(1);
    // ORDER BY ref.created_at ASC → earliest referrer wins.
    expect(hits[0]?.referrer_name).toBe("Primeiro");
  });

  it("returns an empty array for a blank tenant id without touching the database", async () => {
    const gaps = await findReferralReversalGaps("");
    expect(gaps).toEqual([]);
  });
});
