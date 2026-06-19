import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// runPostPaymentSideEffects — task #17 V2 hardening
//
// Verifies that referral-code minting and portal-account provisioning are
// orchestrated correctly AFTER payment confirmation, and only for the right
// kinds of orders:
//   - referral code is minted only when the order has a clientId
//   - portal account is provisioned only when the paid order produced trip
//     reservations (product-only orders get no portal account)
//   - a missing order is a no-op
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  storeOrdersTable: {
    id: "id",
    orderNumber: "order_number",
    tenantId: "tenant_id",
    storeId: "store_id",
    clientId: "client_id",
    customerName: "customer_name",
    customerEmail: "customer_email",
  },
  reservationsTable: {
    id: "id",
    tenantId: "tenant_id",
    storeOrderId: "store_order_id",
  },
  storesTable: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    slug: "slug",
    logo: "logo",
    customDomain: "custom_domain",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

const mockEnsurePortalAccount = vi.fn();
vi.mock("../services/checkout/portal-account.js", () => ({
  ensurePortalAccount: (...args: unknown[]) => mockEnsurePortalAccount(...args),
}));

const mockGenerateAndAssignReferralCode = vi.fn();
vi.mock("../lib/referral-code.js", () => ({
  generateAndAssignReferralCode: (...args: unknown[]) =>
    mockGenerateAndAssignReferralCode(...args),
}));

vi.mock("../lib/id.js", () => ({
  generateReferralCode: vi.fn(() => "JOAO2026ABCDEFGH"),
}));

import { db } from "@workspace/db";
import { runPostPaymentSideEffects } from "../services/checkout/post-booking.js";

// Each db.select() call pops the next result set off this queue. where() returns
// a thenable (for terminal `await … .where()`) that also exposes .limit() (for
// `… .where().limit(1)`); both resolve to the same popped result set.
let selectResults: object[][] = [];

function installSelectQueue(results: object[][]) {
  selectResults = [...results];
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const p = Promise.resolve(rows) as Promise<object[]> & {
        limit: (n: number) => Promise<object[]>;
      };
      p.limit = vi.fn(() => Promise.resolve(rows));
      return p;
    });
    return chain;
  });
}

const ORDER = {
  id: "order-1",
  orderNumber: "VIS-PROD-202606-00001",
  tenantId: "tenant-1",
  storeId: "store-1",
  clientId: "client-1",
  customerName: "João Silva",
  customerEmail: "joao@example.com",
};

const STORE = {
  tenantId: "tenant-1",
  name: "Minha Loja",
  slug: "minha-loja",
  logo: "logo.png",
  customDomain: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsurePortalAccount.mockResolvedValue(undefined);
  mockGenerateAndAssignReferralCode.mockResolvedValue("JOAO2026ABCDEFGH");
});

describe("runPostPaymentSideEffects", () => {
  it("mints a referral code AND provisions a portal account for a paid trip order", async () => {
    installSelectQueue([
      [ORDER], // order lookup
      [{ id: "res-1" }], // reservations for order
      [STORE], // store lookup
    ]);

    await runPostPaymentSideEffects("order-1");

    expect(mockGenerateAndAssignReferralCode).toHaveBeenCalledTimes(1);
    expect(mockGenerateAndAssignReferralCode).toHaveBeenCalledWith(
      "client-1",
      "tenant-1",
      "JOAO2026ABCDEFGH",
      "JOOS", // "João Silva" → ASCII letters only → "JOOSILVA" → first 4
      expect.any(Number),
    );
    expect(mockEnsurePortalAccount).toHaveBeenCalledTimes(1);
    expect(mockEnsurePortalAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "joao@example.com",
        name: "João Silva",
        tenantId: "tenant-1",
        agencyName: "Minha Loja",
      }),
    );
  });

  it("mints a referral code but does NOT provision a portal account for a product-only order (no reservations)", async () => {
    installSelectQueue([
      [ORDER], // order lookup
      [], // no reservations → product-only
    ]);

    await runPostPaymentSideEffects("order-1");

    expect(mockGenerateAndAssignReferralCode).toHaveBeenCalledTimes(1);
    expect(mockEnsurePortalAccount).not.toHaveBeenCalled();
  });

  it("does NOT mint a referral code when the order has no clientId, but still provisions a portal account when reservations exist", async () => {
    installSelectQueue([
      [{ ...ORDER, clientId: null }], // order without a linked client
      [{ id: "res-1" }], // reservations exist
      [STORE], // store lookup
    ]);

    await runPostPaymentSideEffects("order-1");

    expect(mockGenerateAndAssignReferralCode).not.toHaveBeenCalled();
    expect(mockEnsurePortalAccount).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the order does not exist", async () => {
    installSelectQueue([[]]); // order lookup returns nothing

    await runPostPaymentSideEffects("missing-order");

    expect(mockGenerateAndAssignReferralCode).not.toHaveBeenCalled();
    expect(mockEnsurePortalAccount).not.toHaveBeenCalled();
  });

  it("still provisions the portal account even if referral-code generation throws", async () => {
    mockGenerateAndAssignReferralCode.mockRejectedValueOnce(new Error("boom"));
    installSelectQueue([
      [ORDER], // order lookup
      [{ id: "res-1" }], // reservations
      [STORE], // store lookup
    ]);

    await runPostPaymentSideEffects("order-1");

    expect(mockGenerateAndAssignReferralCode).toHaveBeenCalledTimes(1);
    expect(mockEnsurePortalAccount).toHaveBeenCalledTimes(1);
  });
});
