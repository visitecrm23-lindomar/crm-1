import { useState, useMemo } from "react";
import {
  useListCommissions,
  useListCommissionRules,
  useUpdateCommission,
  useCreateCommissionRule,
  useUpdateCommissionRule,
  useDeleteCommissionRule,
  useListTrips,
} from "@workspace/api-client-react";
import type { CommissionRule } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, DollarSign, CheckCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PAYMENT_STATUS_LABELS as STATUS_LABELS, PAYMENT_STATUS_COLORS as STATUS_COLORS } from "@/lib/labels";

const fmt = (v: number | string) => formatCurrency(typeof v === "string" ? parseFloat(v) || 0 : v);

export default function Commissions() {
  const [tab, setTab] = useState("commissions");
  const [statusFilter, setStatusFilter] = useState("");
  const [isRuleOpen, setIsRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleDisplayType, setRuleDisplayType] = useState("percentage");
  const [appliesTo, setAppliesTo] = useState("all");
  const [selectedTripId, setSelectedTripId] = useState("");

  const ruleType = ruleDisplayType === "tiered" ? "percentage" : ruleDisplayType as "percentage" | "fixed";

  const { data: commissionsRaw, isLoading: loadingCommissions, refetch: refetchCommissions } = useListCommissions();
  const { data: rulesData, isLoading: loadingRules, refetch: refetchRules } = useListCommissionRules();
  const { data: tripsData } = useListTrips({ limit: 100 });
  const updateCommission = useUpdateCommission();
  const createRule = useCreateCommissionRule();
  const updateRule = useUpdateCommissionRule();
  const deleteRule = useDeleteCommissionRule();

  const commissions = useMemo(() => {
    const all = Array.isArray(commissionsRaw) ? commissionsRaw : [];
    if (!statusFilter) return all;
    return all.filter(c => c.status === statusFilter);
  }, [commissionsRaw, statusFilter]);

  const kpis = useMemo(() => {
    const all = Array.isArray(commissionsRaw) ? commissionsRaw : [];
    const total = all.reduce((s, c) => s + parseFloat(c.commissionAmount), 0);
    const paid = all.filter(c => c.status === "paid").reduce((s, c) => s + parseFloat(c.commissionAmount), 0);
    const pending = all.filter(c => c.status === "pending").reduce((s, c) => s + parseFloat(c.commissionAmount), 0);
    const approved = all.filter(c => c.status === "approved").reduce((s, c) => s + parseFloat(c.commissionAmount), 0);
    const pendingOrApproved = pending + approved;
    const count = all.length;
    return { total, paid, pending, approved, pendingOrApproved, count };
  }, [commissionsRaw]);

  const handleApprove = async (id: string) => {
    await updateCommission.mutateAsync({ id, data: { status: "approved" } });
    refetchCommissions();
  };

  const handlePay = async (id: string) => {
    await updateCommission.mutateAsync({ id, data: { status: "paid", paidAt: new Date().toISOString() } });
    refetchCommissions();
  };

  const handleSaveRule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const isTiered = ruleDisplayType === "tiered";
    if (isTiered && !selectedTripId) {
      alert("Selecione uma viagem para a regra escalonada por viagem.");
      return;
    }
    const effectiveAppliesTo = isTiered ? "trip" : appliesTo;
    const ruleData = {
      name: fd.get("name") as string,
      type: ruleType,
      value: fd.get("value") as string,
      appliesTo: effectiveAppliesTo,
      tripId: (isTiered || appliesTo === "trip") ? selectedTripId || undefined : undefined,
      isActive: true,
    };
    if (editingRule) {
      await updateRule.mutateAsync({ id: editingRule.id, data: ruleData });
    } else {
      await createRule.mutateAsync({ data: ruleData });
    }
    setIsRuleOpen(false);
    setEditingRule(null);
    setAppliesTo("all");
    setSelectedTripId("");
    refetchRules();
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Excluir esta regra de comissão?")) return;
    await deleteRule.mutateAsync({ id });
    refetchRules();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comissões</h1>
          <p className="text-muted-foreground text-sm">Gerencie comissões de vendedores e regras de cálculo</p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted text-blue-600 mt-1"><DollarSign className="w-5 h-5" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{fmt(kpis.total)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted text-green-600 mt-1"><CheckCircle className="w-5 h-5" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pagas</p>
                <p className="text-xl font-bold text-green-600">{fmt(kpis.paid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted text-yellow-600 mt-1"><Clock className="w-5 h-5" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pendentes/Aprovadas</p>
                <p className="text-xl font-bold text-yellow-600">{fmt(kpis.pendingOrApproved)}</p>
                <p className="text-xs text-muted-foreground">Pendente: {fmt(kpis.pending)} · Aprovada: {fmt(kpis.approved)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted text-purple-600 mt-1"><DollarSign className="w-5 h-5" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Número de Comissões</p>
                <p className="text-xl font-bold text-purple-600">{kpis.count}</p>
                <p className="text-xs text-muted-foreground">{loadingCommissions ? "—" : `${(Array.isArray(commissionsRaw) ? commissionsRaw : []).filter(c => c.status === "paid").length} pagas`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="commissions">Comissões</TabsTrigger>
            <TabsTrigger value="rules">Regras de Cálculo</TabsTrigger>
          </TabsList>
          {tab === "commissions" && (
            <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="approved">Aprovada</SelectItem>
                <SelectItem value="paid">Paga</SelectItem>
              </SelectContent>
            </Select>
          )}
          {tab === "rules" && (
            <Button onClick={() => { setEditingRule(null); setRuleDisplayType("percentage"); setAppliesTo("all"); setSelectedTripId(""); setIsRuleOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Nova Regra
            </Button>
          )}
        </div>

        <TabsContent value="commissions" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor (ID)</TableHead>
                  <TableHead>Reserva</TableHead>
                  <TableHead>Base de Cálculo</TableHead>
                  <TableHead>Valor da Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pago em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCommissions ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : commissions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma comissão encontrada.</TableCell></TableRow>
                ) : commissions.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm font-mono">{c.userId.slice(0, 12)}…</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.reservationId ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmt(c.baseAmount)}</TableCell>
                    <TableCell className="font-semibold text-sm">{fmt(c.commissionAmount)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.paidAt ? new Date(c.paidAt).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {c.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => handleApprove(c.id)}>
                            Aprovar
                          </Button>
                        )}
                        {c.status === "approved" && (
                          <Button size="sm" onClick={() => handlePay(c.id)}>
                            <DollarSign className="w-4 h-4 mr-1" /> Pagar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome da Regra</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRules ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !rulesData?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>
                ) : rulesData.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell className="text-sm">
                      {rule.appliesTo === "trip" && rule.tripId ? "Escalonado por viagem" : rule.type === "percentage" ? "Percentual" : "Valor Fixo"}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {rule.type === "percentage" ? `${rule.value}%` : fmt(rule.value)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rule.appliesTo === "trip" && rule.tripId
                        ? (tripsData?.data.find(t => t.id === rule.tripId)?.name ?? "Viagem específica")
                        : rule.appliesTo === "all" ? "Todas" : rule.appliesTo === "national" ? "Nacionais" : rule.appliesTo === "international" ? "Internacionais" : rule.appliesTo}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {rule.isActive ? "Ativa" : "Inativa"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { setEditingRule(rule); setRuleDisplayType(rule.appliesTo === "trip" && rule.tripId ? "tiered" : rule.type); setAppliesTo(rule.appliesTo ?? "all"); setSelectedTripId(rule.tripId ?? ""); setIsRuleOpen(true); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isRuleOpen} onOpenChange={v => { setIsRuleOpen(v); if (!v) setEditingRule(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar Regra" : "Nova Regra de Comissão"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRule} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome da Regra *</label>
              <Input name="name" required defaultValue={editingRule?.name ?? ""} placeholder="Ex: Comissão Padrão 10%" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Comissão</label>
              <Select value={ruleDisplayType} onValueChange={v => { setRuleDisplayType(v); if (v !== "tiered") setSelectedTripId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%) — geral</SelectItem>
                  <SelectItem value="fixed">Valor Fixo (R$) — geral</SelectItem>
                  <SelectItem value="tiered">Escalonado por viagem (%)</SelectItem>
                </SelectContent>
              </Select>
              {ruleDisplayType === "tiered" && (
                <p className="text-xs text-muted-foreground">A taxa percentual se aplica especificamente à viagem selecionada.</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{ruleDisplayType === "fixed" ? "Valor (R$)" : "Percentual (%)"}</label>
              <Input
                name="value"
                type="number"
                step="0.01"
                required
                defaultValue={editingRule?.value ?? ""}
                placeholder={ruleDisplayType === "fixed" ? "150.00" : "10"}
              />
            </div>
            {ruleDisplayType === "tiered" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Viagem específica *</label>
                <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                  <SelectTrigger><SelectValue placeholder="Escolha a viagem..." /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {(tripsData?.data ?? []).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Aplica a</label>
                <Select value={appliesTo} onValueChange={v => { setAppliesTo(v); if (v !== "trip") setSelectedTripId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as viagens</SelectItem>
                    <SelectItem value="national">Viagens nacionais</SelectItem>
                    <SelectItem value="international">Viagens internacionais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsRuleOpen(false); setEditingRule(null); }}>Cancelar</Button>
              <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
                {createRule.isPending || updateRule.isPending ? "Salvando..." : "Salvar Regra"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
