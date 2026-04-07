import { useState } from "react";
import {
  useAdminInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  type AdminInvoice,
} from "@/hooks/use-admin";
import { useListTenants } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, DollarSign, Clock, CheckCircle2, AlertCircle, Check } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  paid: { label: "Pago", variant: "default" },
  pending: { label: "Pendente", variant: "secondary" },
  overdue: { label: "Vencido", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "outline" },
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

function fmtCurrency(val: string | null) {
  if (!val) return "R$ 0,00";
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminBillingPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: invoices = [], isLoading } = useAdminInvoices({
    status: statusFilter || undefined,
    tenantId: tenantFilter || undefined,
  });
  const { data: tenantsData = [] } = useListTenants();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const [form, setForm] = useState({
    tenantId: "",
    description: "",
    amount: "",
    dueDate: "",
    notes: "",
  });

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = invoices.filter(i => i.status === "pending").reduce((s, i) => s + Number(i.amount), 0);
  const countOverdue = invoices.filter(i => i.status === "overdue").length;
  const countPending = invoices.filter(i => i.status === "pending").length;

  async function handleCreate() {
    if (!form.tenantId || !form.description || !form.amount) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    try {
      await createInvoice.mutateAsync({ tenantId: form.tenantId, description: form.description, amount: form.amount, dueDate: form.dueDate || undefined, notes: form.notes || undefined });
      setShowCreate(false);
      setForm({ tenantId: "", description: "", amount: "", dueDate: "", notes: "" });
      toast({ title: "Fatura criada" });
    } catch {
      toast({ title: "Erro ao criar fatura", variant: "destructive" });
    }
  }

  async function handleMarkPaid(inv: AdminInvoice) {
    try {
      await updateInvoice.mutateAsync({ id: inv.id, status: "paid" });
      toast({ title: "Fatura marcada como paga" });
    } catch {
      toast({ title: "Erro ao atualizar fatura", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="text-sm text-muted-foreground mt-1">Faturas de assinatura de todas as agências</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Fatura
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Total Recebido</CardTitle>
            <DollarSign className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalPaid.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">A Receber</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {totalPending.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Pendentes</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countPending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Vencidas</CardTitle>
            <AlertCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{countOverdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tenantFilter} onValueChange={setTenantFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas as agências</SelectItem>
            {tenantsData.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter || tenantFilter) && (
          <Button variant="ghost" onClick={() => { setStatusFilter(""); setTenantFilter(""); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Carregando...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma fatura encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Agência</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Descrição</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Vencimento</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Pago em</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const statusInfo = STATUS_MAP[inv.status] ?? STATUS_MAP.pending;
                    return (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2">
                          <div className="font-medium">{inv.tenantName ?? inv.tenantId}</div>
                          <div className="text-xs text-muted-foreground">{inv.tenantEmail}</div>
                        </td>
                        <td className="py-2">{inv.description}</td>
                        <td className="py-2 text-right font-medium">{fmtCurrency(inv.amount)}</td>
                        <td className="py-2">
                          <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">{fmt(inv.dueDate)}</td>
                        <td className="py-2 text-muted-foreground">{fmt(inv.paidAt)}</td>
                        <td className="py-2">
                          {inv.status !== "paid" && inv.status !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleMarkPaid(inv)}
                              disabled={updateInvoice.isPending}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              Pago
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Agência *</Label>
              <Select value={form.tenantId} onValueChange={v => setForm(f => ({ ...f, tenantId: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecionar agência" />
                </SelectTrigger>
                <SelectContent>
                  {tenantsData.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Descrição *</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" placeholder="Ex: Assinatura Pro – Maio 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor (R$) *</Label>
                <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="h-8 text-sm" type="number" placeholder="297" />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="h-8 text-sm" type="date" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createInvoice.isPending}>Criar Fatura</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
