const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ClientPortalReservation {
  id: string;
  reservationNumber: string | null;
  status: string;
  voucherCode: string;
  totalValue: number;
  paidValue: number;
  balance: number;
  seatsCount: number;
  paymentMethod: string | null;
  storeOrderId: string | null;
  createdAt: string;
  tripName: string;
  tripDestination: string;
  tripDepartureDate: string | null;
  tripReturnDate: string | null;
  tripType: string;
  boardingPointName: string | null;
  boardingPointTime: string | null;
  npsSubmitted: boolean;
}

export interface ClientLoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  description: string;
  createdAt: string;
}

export interface ClientLoyalty {
  availablePoints: number;
  totalPoints: number;
  tier: string;
  programName: string;
  pointsPerReal: number;
  realPerPoint: number;
  minRedeemPoints: number;
  recentTransactions: ClientLoyaltyTransaction[];
}

export interface ClientReferral {
  id: string;
  referredName: string | null;
  referredEmail: string | null;
  status: string;
  convertedAt: string | null;
  bonusAmount: string;
  bonusPaid: boolean;
  bonusPaidAt: string | null;
  bonusCreditUsedAt: string | null;
  bonusCreditOrderId: string | null;
  bonusCreditUsedAmount: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface ClientPortalProfile {
  user: {
    id: string;
    name: string;
    email: string;
    cpf: string | null;
    referralCode: string;
    createdAt: string | null;
  } | null;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    cpf: string | null;
    birthDate: string | null;
    addressCity: string | null;
    addressState: string | null;
    referralCode: string | null;
  } | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string;
  } | null;
  reservations: ClientPortalReservation[];
  referral: {
    code: string | null;
    totalReferrals: number;
    completedReferrals: number;
    pendingReferrals: number;
    totalEarnings: string;
    creditBalance: string;
    shareMessage: string | null;
    currentTierLevel: string;
    currentTierLabel: string;
    currentTierMultiplier: number;
    tierProgress: number;
    nextTierMin: number | null;
    nextTierLabel: string | null;
  };
  stats: {
    totalSpent: number;
  };
  loyalty: ClientLoyalty | null;
}

async function apiReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message ?? err.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export type ClientNotificationType =
  | "referral_converted"
  | "referral_bonus_released"
  | "referral_bonus_paid"
  | "referral_link_clicked";

export interface ClientNotification {
  id: string;
  type: ClientNotificationType;
  payload: {
    referredName?: string;
    referralCode?: string;
    bonusAmount?: number;
    agencyName?: string;
  };
  readAt: string | null;
  createdAt: string;
}

export interface ClientNotificationsResponse {
  data: ClientNotification[];
  unreadCount: number;
}

export const clientPortalApi = {
  getProfile: () => apiReq<ClientPortalProfile>("GET", "/client/me"),
  updateProfile: (data: {
    name?: string;
    phone?: string | null;
    cpf?: string | null;
    birthDate?: string | null;
  }) => apiReq<ClientPortalProfile["client"]>("PATCH", "/client/me", data),
  getMyReferrals: () => apiReq<{ data: ClientReferral[] }>("GET", "/client/me/referrals"),
  deleteMyAccount: () => apiReq<void>("DELETE", "/users/me"),
  getNotifications: () => apiReq<ClientNotificationsResponse>("GET", "/client/notifications"),
  markAllNotificationsRead: () => apiReq<void>("POST", "/client/notifications/read-all"),
  getNotificationStreamUrl: () => `${BASE}/api/client/notifications/stream`,
  submitNps: (data: { reservationId: string; score: number; comment?: string | null }) =>
    apiReq<{ id: string }>("POST", "/client/nps", data),
};
