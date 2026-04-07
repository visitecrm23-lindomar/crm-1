import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAdminTenantDetails, useSuspendTenant, useActivateTenant } from "@/hooks/use-admin";
import { useUpdateTenant, getListTenantsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ArrowLeft,
  Building2,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ScrollText,
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  trial: { label: "Trial", variant: "secondary" },
  suspended: { label: "Suspenso", variant: "destructive" },
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

function fmtCurrency(val: string | null) {
  if (!val) return "R$ 0,00";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TenantDetailPage() {
  const [, params] = useRoute("/admin/tenants/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tenant, isLoading } = useAdminTenantDetails(id);
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();
  const updateTenant = useUpdateTenant();

  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  function openEdit() {
    if (!tenant) return;
    setEditForm({
      name: tenant.name,
      email: tenant.email,
      cnpj: tenant.cnpj ?? "",
      address: tenant.address ?? "",
      city: tenant.city ?? "",
      state: tenant.state ?? "",
      zipCode: tenant.zipCode ?? "",
      whatsapp: tenant.whatsapp ?? "",
      phone: tenant.phone ?? "",
      planId: tenant.planId,
    });
    setShowEditDialog(true);
  }

  async function handleSuspend() {
    try {
      await suspend.mutateAsync({ id, reason: suspendReason });
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      toast({ title: "Agência suspensa com sucesso" });
      setShowSuspendDialog(false);
    } catch {
      toast({ title: "Erro ao suspender", variant: "destructive" });
    }
  }

  async function handleActivate() {
    try {
      await activate.mutateAsync(id);
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      toast({ title: "Agência ativada com sucesso" });
    } catch {
      toast({ title: "Erro ao ativar", variant: "destructive" });
    }
  }

  async function handleSave() {
    try {
      await updateTenant.mutateAsync({ id, data: editForm });
      qc.invalidateQueries({ queryKey: ["admin", "tenants", id, "details"] });
      qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      toast({ title: "Agência atualizada" });
      setShowEditDialog(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Agência não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/tenants")}>
          Voltar
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[tenant.status] ?? STATUS_MAP.trial;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/tenants")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{tenant.name}</h1>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{tenant.email}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={openEdit}>Editar</Button>
          {tenant.status === "suspended" ? (
            <Button onClick={handleActivate} disabled={activate.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Ativar
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setShowSuspendDialog(true)}>
              <XCircle className="w-4 h-4 mr-2" />
              Suspender
            </Button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Usuários</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tenant.userCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Plano: {PLAN_LABELS[tenant.planId] ?? tenant.planId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Faturas</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tenant.invoices.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {tenant.invoices.filter(i => i.status === "paid").length} pagas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Logs</CardTitle>
            <ScrollText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tenant.logs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Últimas ações</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Cadastro</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-base font-bold">{fmt(tenant.createdAt)}</div>
            {tenant.trialEndsAt && (
              <p className="text-xs text-amber-600 mt-1">Trial até {fmt(tenant.trialEndsAt)}</p>
            )}
            {tenant.suspendedAt && (
              <p className="text-xs text-destructive mt-1">Suspenso em {fmt(tenant.suspendedAt)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="users">Usuários ({tenant.userCount})</TabsTrigger>
          <TabsTrigger value="invoices">Faturas ({tenant.invoices.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs ({tenant.logs.length})</TabsTrigger>
        </TabsList>

        {/* INFO TAB */}
        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                ["Nome", tenant.name],
                ["Slug", tenant.slug],
                ["Email", tenant.email],
                ["CNPJ", tenant.cnpj || "—"],
                ["WhatsApp", tenant.whatsapp || "—"],
                ["Telefone", tenant.phone || "—"],
                ["Endereço", tenant.address || "—"],
                ["Cidade", tenant.city || "—"],
                ["Estado", tenant.state || "—"],
                ["CEP", tenant.zipCode || "—"],
                ["Plano", PLAN_LABELS[tenant.planId] ?? tenant.planId],
                ["Status", statusInfo.label],
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground">{k}</span>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
              {tenant.suspensionReason && (
                <div className="sm:col-span-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Motivo da suspensão</p>
                  <p className="text-sm">{tenant.suspensionReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {tenant.users.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum usuário cadastrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Nome</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Email</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Perfil</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Cadastro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenant.users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{u.name}</td>
                          <td className="py-2 text-muted-foreground">{u.email}</td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs">{u.role}</Badge>
                          </td>
                          <td className="py-2">
                            <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                              {u.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{fmt(u.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVOICES TAB */}
        <TabsContent value="invoices" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {tenant.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma fatura encontrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Descrição</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Valor</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Vencimento</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Pago em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenant.invoices.map((inv) => (
                        <tr key={inv.id} className="border-b last:border-0">
                          <td className="py-2">{inv.description}</td>
                          <td className="py-2 font-medium">{fmtCurrency(inv.amount)}</td>
                          <td className="py-2">
                            <Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : "secondary"} className="text-xs">
                              {inv.status === "paid" ? "Pago" : inv.status === "overdue" ? "Vencido" : "Pendente"}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{fmt(inv.dueDate)}</td>
                          <td className="py-2 text-muted-foreground">{fmt(inv.paidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOGS TAB */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {tenant.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum log encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Ação</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Entidade</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Usuário</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenant.logs.map((log) => (
                        <tr key={log.id} className="border-b last:border-0">
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs font-mono">{log.action}</Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{log.entityType}</td>
                          <td className="py-2 text-muted-foreground">{log.userName ?? "—"}</td>
                          <td className="py-2 text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString("pt-BR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Suspend Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Suspender Agência
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja suspender <strong>{tenant.name}</strong>? O acesso será bloqueado imediatamente.
          </p>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              placeholder="Ex: Pagamento em atraso"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={suspend.isPending}>
              Confirmar Suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agência</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "name", label: "Nome" },
              { key: "email", label: "Email" },
              { key: "cnpj", label: "CNPJ" },
              { key: "whatsapp", label: "WhatsApp" },
              { key: "phone", label: "Telefone" },
              { key: "address", label: "Endereço" },
              { key: "city", label: "Cidade" },
              { key: "state", label: "Estado" },
              { key: "zipCode", label: "CEP" },
            ].map(({ key, label }) => (
              <div key={key} className={key === "address" ? "col-span-2" : ""}>
                <Label className="text-xs">{label}</Label>
                <Input
                  value={editForm[key] ?? ""}
                  onChange={(e) => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            ))}
            <div>
              <Label className="text-xs">Plano</Label>
              <Select value={editForm.planId ?? "starter"} onValueChange={(v) => setEditForm(f => ({ ...f, planId: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateTenant.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
