import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderComponent, cleanupRoots } from "./eventSourceHarness.js";

// ---------------------------------------------------------------------------
// Controllable hook return values
// ---------------------------------------------------------------------------
const mockGetMe = vi.hoisted(() => vi.fn());
const mockGetTenant = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("wouter", () => ({
  useLocation: () => ["/trips/trip-1/passengers-overview", vi.fn()],
  Link: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: mockGetMe,
  useGetTenant: mockGetTenant,
  useListTrips: () => ({ data: { data: [] } }),
  useGetTrip: () => ({ data: null }),
  useListReservations: () => ({ data: { data: [] }, refetch: vi.fn() }),
  useUpdateReservation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@workspace/permissions", () => ({
  RESERVATION_STATUS: {
    CONFIRMED: "confirmed",
    PENDING: "pending",
    CANCELLED: "cancelled",
    COMPLETED: "completed",
  },
  TRIP_STATUS: {
    CANCELLED: "cancelled",
    DRAFT: "draft",
  },
  hasPermission: () => false,
  RESOURCES: { FINANCIAL: "financial" },
  ACTIONS: { VIEW: "view" },
}));

vi.mock("@/components/client360-modal", () => ({
  Client360Modal: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: { children: unknown; [k: string]: unknown }) =>
    createElement("button", rest, children as never),
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
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  AlertDialogAction: ({ children }: { children: unknown }) =>
    createElement("button", null, children as never),
  AlertDialogCancel: ({ children }: { children: unknown }) =>
    createElement("button", null, children as never),
  AlertDialogContent: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  AlertDialogDescription: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  AlertDialogFooter: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  AlertDialogHeader: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
  AlertDialogTitle: ({ children }: { children: unknown }) =>
    createElement("div", null, children as never),
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  Bus: () => null,
  Edit: () => null,
  X: () => null,
  Check: () => null,
  Download: () => null,
  Send: () => null,
  Plus: () => null,
  DollarSign: () => null,
  List: () => null,
  UserRound: () => null,
  MapPin: () => null,
  ChevronDown: () => null,
  ClipboardCheck: () => null,
  AlertTriangle: () => null,
  ShoppingBag: () => null,
}));

vi.mock("../pages/trips/constants.js", () => ({
  STATUS_MAP: {} as Record<string, { label: string; color: string }>,
}));

vi.mock("../pages/trips/utils.js", () => ({
  formatCurrency: (v: number) => `R$ ${v}`,
  formatDate: (d: string) => d,
}));

vi.mock("@/lib/labels", () => ({
  PAYMENT_METHOD_LABELS: {} as Record<string, string>,
}));

vi.mock("../pages/trips/PassengersOverviewFinancialDialog.js", () => ({
  PassengersOverviewFinancialDialog: () => null,
}));

import { PassengersOverview } from "../pages/trips/PassengersOverview.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTenantData(seatMapEnabled: boolean | undefined) {
  const settings: Record<string, unknown> =
    seatMapEnabled === undefined ? {} : { seatMapEnabled };
  return {
    data: {
      id: "tenant-1",
      name: "Agência",
      slug: "agencia",
      email: "a@b.com",
      planId: "plan-1",
      status: "active",
      createdAt: "2024-01-01",
      settings,
    },
  };
}

beforeEach(() => {
  mockGetMe.mockReturnValue({ data: { tenantId: "tenant-1", role: "admin" } });
  mockGetTenant.mockReturnValue(makeTenantData(false));
});

afterEach(async () => {
  await cleanupRoots();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PassengersOverview — seatMapEnabled tenant toggle", () => {
  it("hides the seat-map link when seatMapEnabled is false", async () => {
    mockGetTenant.mockReturnValue(makeTenantData(false));

    const { container } = await renderComponent(
      createElement(PassengersOverview, { tripId: "trip-1" }),
    );

    const link = container.querySelector("a[href='/trips/trip-1/seat-map']");
    expect(link).toBeNull();
  });

  it("shows the seat-map link when seatMapEnabled is true", async () => {
    mockGetTenant.mockReturnValue(makeTenantData(true));

    const { container } = await renderComponent(
      createElement(PassengersOverview, { tripId: "trip-1" }),
    );

    const link = container.querySelector("a[href='/trips/trip-1/seat-map']");
    expect(link).not.toBeNull();
  });

  it("shows the seat-map link when seatMapEnabled is absent (defaults to true)", async () => {
    mockGetTenant.mockReturnValue(makeTenantData(undefined));

    const { container } = await renderComponent(
      createElement(PassengersOverview, { tripId: "trip-1" }),
    );

    const link = container.querySelector("a[href='/trips/trip-1/seat-map']");
    expect(link).not.toBeNull();
  });
});
