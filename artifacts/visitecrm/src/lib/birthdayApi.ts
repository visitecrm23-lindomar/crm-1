const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export interface BirthdayMessage {
  id: string;
  tenantId: string;
  clientId: string;
  birthdayYear: number;
  sentWhatsapp: boolean;
  sentEmail: boolean;
  whatsappSentAt: string | null;
  emailSentAt: string | null;
  whatsappError: string | null;
  emailError: string | null;
  couponId: string | null;
  couponCode: string | null;
  converted: boolean;
  isManual: boolean;
  sentById: string | null;
  createdAt: string;
}

export interface BirthdayClient {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  birthDate: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  birthdayMessage: BirthdayMessage | null;
  daysUntil?: number;
}

export interface BirthdayHistoryItem extends BirthdayMessage {
  client: BirthdayClient | null;
}

export interface BirthdayStats {
  totalSentYear: number;
  sentThisMonth: number;
  whatsappSent: number;
  emailSent: number;
  converted: number;
  conversionRate: number;
  todayCount: number;
  upcomingWeek: number;
}

export interface BirthdaySettings {
  enabled: boolean;
  discountPercent: number;
  validDays: number;
  sendWhatsapp: boolean;
  sendEmail: boolean;
  whatsappMessage?: string;
}

export const birthdayApi = {
  getToday: () => req<BirthdayClient[]>("GET", "/birthday/today"),
  getUpcoming: (days = 7) => req<BirthdayClient[]>("GET", `/birthday/upcoming?days=${days}`),
  getHistory: (year?: number, limit = 50) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (year) qs.set("year", String(year));
    return req<BirthdayHistoryItem[]>("GET", `/birthday/history?${qs}`);
  },
  getStats: () => req<BirthdayStats>("GET", "/birthday/stats"),
  sendMessage: (clientId: string) =>
    req<{ success: boolean; couponCode?: string; error?: string }>("POST", `/birthday/${clientId}/send`),
  getSettings: () => req<BirthdaySettings>("GET", "/birthday/settings"),
  updateSettings: (data: Partial<BirthdaySettings>) =>
    req<BirthdaySettings>("PUT", "/birthday/settings", data),
};
