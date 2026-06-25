import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderComponent, cleanupRoots } from "./eventSourceHarness.js";

// ---------------------------------------------------------------------------
// Controllable hook return values — modified per test in beforeEach.
// vi.hoisted ensures these exist before the vi.mock factories run.
// ---------------------------------------------------------------------------
const mockGetCurrentSubscription = vi.hoisted(() => vi.fn());
const mockGetMe = vi.hoisted(() => vi.fn());
const mockGetTenant = vi.hoisted(() => vi.fn());
const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports that use them.
// ---------------------------------------------------------------------------
vi.mock("wouter", () => ({
  useLocation: () => ["", vi.fn()],
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/hooks/useSeatStream", () => ({
  useSeatStream: () => ({ occupiedSeats: {}, eventCount: 0, connected: false }),
}));

vi.mock("@workspace/permissions", () => ({
  RESERVATION_STATUS: {},
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentSubscription: mockGetCurrentSubscription,
  useGetMe: mockGetMe,
  useGetTenant: mockGetTenant,
  useListTrips: () => ({ data: null }),
  useGetTrip: () => ({ data: null }),
  useGetTripSeatMap: () => ({ data: null, dataUpdatedAt: 0 }),
  useListReservations: () => ({ data: null }),
  useListClients: () => ({ data: null }),
  useCreateReservation: () => ({ mutateAsync: mockMutateAsync }),
  useCreateClient: () => ({ mutateAsync: mockMutateAsync }),
  useRegenerateTripSeatMap: () => ({ mutateAsync: mockMutateAsync }),
  getGetTripSeatMapQueryKey: (id: string) => ["seat-map", id],
}));

vi.mock("@/components/plan-limit-wall", () => ({
  PlanFeatureWall: () =>
    createElement("div", { "data-testid": "plan-wall" }, "PlanFeatureWall"),
  canUpgradeForFeature: () => false,
}));

vi.mock("@/components/SeatMapPicker", () => ({
  getSeatColor: () => "gray",
  getCellIcon: () => "",
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: unknown }) =>
    createElement("button", null, children as never),
}));
vi.mock("@/components/ui/input", () => ({
  Input: () => createElement("input"),
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: unknown }) =>
    createElement("label", null, children as never),
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: unknown }) =>
    createElement("span", { "data-testid": "badge" }, children as never),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  SelectContent: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  SelectItem: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  SelectTrigger: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  SelectValue: () => null,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  DialogContent: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  DialogHeader: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  DialogTitle: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  DialogDescription: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  DialogFooter: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
}));
vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  Search: () => null,
  Users: () => null,
  AlertCircle: ({ className }: { className?: string }) =>
    createElement("span", { "data-testid": "alert-icon", className }, "!"),
  Download: () => null,
  RefreshCw: () => null,
}));

import { SeatMap } from "../pages/trips/SeatMap.js";
import { makeTenantData } from "./tenantFixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function planWithSeatMap() {
  return { data: { plan: { supportedFeatures: ["seatMap"] } } };
}
function planWithoutSeatMap() {
  return { data: { plan: { supportedFeatures: [] } } };
}

beforeEach(() => {
  mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
  mockGetMe.mockReturnValue({ data: { tenantId: "tenant-1" } });
  mockGetTenant.mockReturnValue(makeTenantData(false));
});

afterEach(async () => {
  await cleanupRoots();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SeatMap — seatMapEnabled tenant toggle", () => {
  it("shows the disabled state when plan supports seatMap but seatMapEnabled is false", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
    mockGetTenant.mockReturnValue(makeTenantData(false));

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    expect(container.textContent).toContain("Mapa de assentos desabilitado");
    expect(container.textContent).toContain(
      "O mapa de assentos está desabilitado nas configurações da agência.",
    );
    expect(container.querySelector("[data-testid='plan-wall']")).toBeNull();
  });

  it("links to /configuracoes from the disabled state", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
    mockGetTenant.mockReturnValue(makeTenantData(false));

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    const link = container.querySelector("a[href='/configuracoes']");
    expect(link).not.toBeNull();
  });

  it("shows the plan wall — not the disabled state — when plan does not include seatMap", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithoutSeatMap());
    mockGetTenant.mockReturnValue(makeTenantData(false));

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    expect(container.querySelector("[data-testid='plan-wall']")).not.toBeNull();
    expect(container.textContent).not.toContain("Mapa de assentos desabilitado");
  });

  it("does not show the disabled state when seatMapEnabled is not set (defaults to true)", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
    mockGetTenant.mockReturnValue(makeTenantData(undefined));

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    expect(container.textContent).not.toContain("Mapa de assentos desabilitado");
    expect(container.querySelector("[data-testid='plan-wall']")).toBeNull();
  });

  it("does not show the disabled state when seatMapEnabled is explicitly true", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
    mockGetTenant.mockReturnValue(makeTenantData(true));

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    expect(container.textContent).not.toContain("Mapa de assentos desabilitado");
  });

  it("shows the disabled state even when tenantData is still loading (settings key absent)", async () => {
    mockGetCurrentSubscription.mockReturnValue(planWithSeatMap());
    // Simulate tenantData not yet loaded
    mockGetTenant.mockReturnValue({ data: undefined });

    const { container } = await renderComponent(
      createElement(SeatMap, { tripId: "trip-1" }),
    );

    // tenantSettings = {} → seatMapEnabled = undefined → disabled NOT triggered
    expect(container.textContent).not.toContain("Mapa de assentos desabilitado");
  });
});
