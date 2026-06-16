import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  maxUsers: number;
  maxClients: number;
  maxTrips: number;
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  tenantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInvoice {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantEmail: string | null;
  planId: string | null;
  description: string;
  amount: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface AdminUser {
  id: string;
  clerkId: string;
  tenantId: string | null;
  tenantName: string | null;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminAuditLog {
  id: string;
  tenantId: string;
  tenantName: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface GrowthMetric {
  month: string;
  label: string;
  new_tenants: number;
  active: number;
}

export interface MrrMetric {
  month: string;
  label: string;
  mrr: number;
}

export interface ChurnMetric {
  month: string;
  label: string;
  suspended: number;
  churnRate: number;
}

export interface AdminTenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  planId: string;
  pendingPlanId: string | null;
  status: string;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetails {
  id: string;
  name: string;
  slug: string;
  email: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  whatsapp: string | null;
  phone: string | null;
  logoUrl: string | null;
  planId: string;
  status: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  trialEndsAt: string | null;
  limits: Record<string, number>;
  users: AdminUser[];
  userCount: number;
  logs: AdminAuditLog[];
  invoices: AdminInvoice[];
  createdAt: string;
  updatedAt: string;
}

// ─── PLANS ────────────────────────────────────────────────────────────────────

export function useAdminPlans() {
  return useQuery<AdminPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => adminFetch("/api/admin/plans"),
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdminPlan>) => adminFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<AdminPlan> & { id: string }) =>
      adminFetch(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────

export function useAdminInvoices(filters?: { tenantId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set("tenantId", filters.tenantId);
  if (filters?.status) params.set("status", filters.status);
  return useQuery<AdminInvoice[]>({
    queryKey: ["admin", "invoices", filters],
    queryFn: () => adminFetch(`/api/admin/invoices?${params}`),
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AdminInvoice> & { tenantId: string; description: string; amount: string }) =>
      adminFetch("/api/admin/invoices", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "invoices"] }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; paidAt?: string; notes?: string }) =>
      adminFetch(`/api/admin/invoices/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "invoices"] }),
  });
}

// ─── ADMIN USERS ──────────────────────────────────────────────────────────────

export function useAdminUsers(filters?: { tenantId?: string; role?: string }) {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set("tenantId", filters.tenantId);
  if (filters?.role) params.set("role", filters.role);
  return useQuery<AdminUser[]>({
    queryKey: ["admin", "users", filters],
    queryFn: () => adminFetch(`/api/admin/users?${params}`),
  });
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

export function useAdminAuditLogs(filters?: { tenantId?: string; entityType?: string; action?: string }) {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set("tenantId", filters.tenantId);
  if (filters?.entityType) params.set("entityType", filters.entityType);
  if (filters?.action) params.set("action", filters.action);
  return useQuery<AdminAuditLog[]>({
    queryKey: ["admin", "audit-logs", filters],
    queryFn: () => adminFetch(`/api/admin/audit-logs?${params}`),
  });
}

// ─── METRICS ──────────────────────────────────────────────────────────────────

export function useAdminGrowthMetrics() {
  return useQuery<GrowthMetric[]>({
    queryKey: ["admin", "metrics", "growth"],
    queryFn: () => adminFetch("/api/admin/metrics/growth"),
  });
}

export function useAdminMrrMetrics() {
  return useQuery<MrrMetric[]>({
    queryKey: ["admin", "metrics", "mrr"],
    queryFn: () => adminFetch("/api/admin/metrics/mrr"),
  });
}

export function useAdminChurnMetrics() {
  return useQuery<ChurnMetric[]>({
    queryKey: ["admin", "metrics", "churn"],
    queryFn: () => adminFetch("/api/admin/metrics/churn"),
  });
}

// ─── TENANT DETAILS & ACTIONS ─────────────────────────────────────────────────

export function useAdminTenantDetails(id: string) {
  return useQuery<TenantDetails>({
    queryKey: ["admin", "tenants", id, "details"],
    queryFn: () => adminFetch(`/api/admin/tenants/${id}/details`),
    enabled: !!id,
  });
}

export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminFetch(`/api/admin/tenants/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants", vars.id] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

export function useActivateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/tenants/${id}/activate`, { method: "POST" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants", id] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}

// ─── ADMIN TENANTS LIST ───────────────────────────────────────────────────────

export function useAdminTenants() {
  return useQuery<AdminTenant[]>({
    queryKey: ["admin", "tenants"],
    queryFn: () => adminFetch("/api/admin/tenants"),
  });
}

export function getAdminTenantsQueryKey() {
  return ["admin", "tenants"] as const;
}

// ─── SUPERADMIN SYNC ──────────────────────────────────────────────────────────

export function useSyncSuperadmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminFetch("/api/admin/sync-superadmin", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
}
