import { useState } from "react";
import { useLocation } from "wouter";
import {
  useUpdateTenant,
  useListPlans,
} from "@workspace/api-client-react";
import { useAdminTenants, getAdminTenantsQueryKey, useSyncSuperadmin, type AdminTenant } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Users, ChevronLeft, ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 15;

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  trial: "Trial",
  suspended: "Suspenso",
  pending_payment: "Pgto. Pendente",
  overdue: "Em atraso",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trial: "secondary",
  suspended: "destructive",
  pending_payment: "outline",
  overdue: "destructive",
};

const PLAN_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  starter: "outline",
  pro: "secondary",
  enterprise: "default",
};

interface EditModalProps {
  tenant: AdminTenant | null;
  onClose: () => void;
}

function EditTenantModal({ tenant, onClose }: EditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTenant = useUpdateTenant();
  const { data: plans = [] } = useListPlans();

  const [planId, setPlanId] = useState(tenant?.planId ?? "");
  const [status, setStatus] = useState(tenant?.status ?? "trial");

  if (!tenant) return null;

  async function handleSave() {
    if (!tenant) return;
    try {
      await updateTenant.mutateAsync({ id: tenant.id, data: { planId, status } });
      await queryClient.invalidateQueries({ queryKey: getAdminTenantsQueryKey() });
      toast({ title: "Tenant atualizado com sucesso" });
      onClose();
    } catch {
      toast({ title: "Erro ao atualizar tenant", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Tenant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">{tenant.name}</p>
            <p className="text-xs text-muted-foreground">{tenant.email}</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Plano</label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.length > 0
                  ? plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.monthlyPrice != null ? ` — R$ ${Number(p.monthlyPrice).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mês` : ""}
                      </SelectItem>
                    ))
                  : (
                    <>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </>
                  )
                }
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="suspended">Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateTenant.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateTenant.isPending}>
            {updateTenant.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTenants() {
  const { data: tenants = [], isLoading } = useAdminTenants();
  const { data: plans = [] } = useListPlans();
  const syncSuperadmin = useSyncSuperadmin();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [editingTenant, setEditingTenant] = useState<AdminTenant | null>(null);
  const [, navigate] = useLocation();

  async function handleSyncSuperadmin() {
    try {
      const result = await syncSuperadmin.mutateAsync() as { already?: boolean };
      toast({
        title: result?.already ? "Já é superadmin" : "Papel superadmin sincronizado!",
        description: result?.already ? "Seu papel já estava correto." : "Seu papel foi atualizado para superadmin. Faça login novamente para aplicar.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao sincronizar papel", description: msg, variant: "destructive" });
    }
  }

  const planNameMap: Record<string, string> = {};
  for (const p of plans) {
    planNameMap[p.id] = p.name;
    if (p.slug) planNameMap[p.slug] = p.name;
  }

  const totalPages = Math.max(1, Math.ceil(tenants.length / PAGE_SIZE));
  const paginated = tenants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tenants.length} agência{tenants.length !== 1 ? "s" : ""} cadastrada{tenants.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSyncSuperadmin} disabled={syncSuperadmin.isPending} title="Sincronizar papel superadmin">
          <ShieldCheck className="w-4 h-4 mr-2" />
          {syncSuperadmin.isPending ? "Sincronizando..." : "Sync Superadmin"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-pulse text-muted-foreground">Carregando tenants...</div>
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-muted-foreground">Nenhum tenant encontrado</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agência</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plano</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cadastro</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuários</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((tenant) => (
                      <tr key={tenant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{tenant.name}</div>
                          <div className="text-xs text-muted-foreground">{tenant.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={PLAN_VARIANTS[tenant.planId] ?? "outline"}>
                            {planNameMap[tenant.planId] ?? PLAN_LABELS[tenant.planId] ?? tenant.planId}
                          </Badge>
                          {tenant.pendingPlanId && (
                            <div className="text-xs text-amber-600 mt-0.5">
                              → {PLAN_LABELS[tenant.pendingPlanId] ?? tenant.pendingPlanId}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANTS[tenant.status] ?? "outline"}>
                            {STATUS_LABELS[tenant.status] ?? tenant.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(tenant.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            {tenant.userCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                              className="h-7 w-7 p-0"
                              title="Ver detalhes"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingTenant(tenant)}
                              className="h-7 w-7 p-0"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <EditTenantModal tenant={editingTenant} onClose={() => setEditingTenant(null)} />
    </div>
  );
}
