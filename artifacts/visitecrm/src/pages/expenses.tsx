import { useState, useMemo } from "react";
import {
  useListExpenses,
  useCreateExpense,
  useUpdateExpense,
  useListTrips,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, CheckCircle, TrendingDown, Clock, AlertCircle } from "lucide-react";

const fmt = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `R$ ${(isNaN(n) ? 0 : n).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};
const CATEGORY_LABELS: Record<string, string> = {
  transport: "Transporte",
  accommodation: "Hospedagem",
  food: "Alimentação",
  marketing: "Marketing",
  administrative: "Administrativo",
  commission: "Comissão",
  other: "Outro",
};
const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência",
  cash: "Dinheiro",
  boleto: "Boleto",
};

export default function Expenses() {
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tripFilter, setTripFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expenseMethod, setExpenseMethod] = useState("pix");

  const { data: expensesData, isLoading, refetch } = useListExpenses({
    status: statusFilter || undefined,
    tripId: tripFilter || undefined,
    limit: 100,
  });
  const { data: tripsData } = useListTrips({ limit: 100 });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();

  const expenses = useMemo(() => {
    let all = expensesData?.data ?? [];
    if (categoryFilter) all = all.filter(e => e.category === categoryFilter);
    if (dateFrom) all = all.filter(e => e.dueDate >= dateFrom);
    if (dateTo) all = all.filter(e => e.dueDate <= dateTo);
    return all;
  }, [expensesData, categoryFilter, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const all = expensesData?.data ?? [];
    const total = all.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
    const paid = all.filter(e => e.status === "paid").reduce((s, e) => s + parseFloat(String(e.amount)), 0);
    const pending = all.filter(e => e.status === "pending").reduce((s, e) => s + parseFloat(String(e.amount)), 0);
    const overdue = all.filter(e => e.status === "overdue").reduce((s, e) => s + parseFloat(String(e.amount)), 0);
    return { total, paid, pending, overdue };
  }, [expensesData]);

  const handleMarkPaid = async (id: string) => {
    await updateExpense.mutateAsync({
      id,
      data: { status: "paid", paymentDate: new Date().toISOString().split("T")[0] }
    });
    refetch();
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createExpense.mutateAsync({
      data: {
        category: fd.get("category") as string || "other",
        description: fd.get("description") as string,
        amount: parseFloat(fd.get("amount") as string || "0"),
        dueDate: fd.get("dueDate") as string,
        paymentMethod: expenseMethod || undefined,
        tripId: (fd.get("tripId") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      }
    });
    setIsCreateOpen(false);
    refetch();
  };

  const hasFilters = statusFilter || categoryFilter || tripFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Despesas</h1>
          <p className="text-muted-foreground text-sm">Controle todas as despesas operacionais e por viagem</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Registrar Despesa
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-5 flex items-start gap-3">
          <div className="mt-1 p-2 rounded-md bg-muted text-red-600"><TrendingDown className="w-5 h-5" /></div>
          <div><p className="text-sm text-muted-foreground">Total</p><p className="text-xl font-bold">{fmt(kpis.total)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-start gap-3">
          <div className="mt-1 p-2 rounded-md bg-muted text-green-600"><CheckCircle className="w-5 h-5" /></div>
          <div><p className="text-sm text-muted-foreground">Pagas</p><p className="text-xl font-bold text-green-600">{fmt(kpis.paid)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-start gap-3">
          <div className="mt-1 p-2 rounded-md bg-muted text-yellow-600"><Clock className="w-5 h-5" /></div>
          <div><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-xl font-bold text-yellow-600">{fmt(kpis.pending)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-5 flex items-start gap-3">
          <div className="mt-1 p-2 rounded-md bg-muted text-destructive"><AlertCircle className="w-5 h-5" /></div>
          <div><p className="text-sm text-muted-foreground">Vencidas</p><p className="text-xl font-bold text-destructive">{fmt(kpis.overdue)}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border">
        <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="overdue">Vencido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter || "all"} onValueChange={v => setCategoryFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="transport">Transporte</SelectItem>
            <SelectItem value="accommodation">Hospedagem</SelectItem>
            <SelectItem value="food">Alimentação</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="administrative">Administrativo</SelectItem>
            <SelectItem value="other">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tripFilter || "all"} onValueChange={v => setTripFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Viagem" /></SelectTrigger>
          <SelectContent className="max-h-48">
            <SelectItem value="all">Todas as viagens</SelectItem>
            {tripsData?.data.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" placeholder="De" />
          <span className="text-muted-foreground text-sm">até</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" placeholder="Até" />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(""); setCategoryFilter(""); setTripFilter(""); setDateFrom(""); setDateTo(""); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Viagem</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  {hasFilters ? "Nenhuma despesa com os filtros selecionados." : "Nenhuma despesa registrada."}
                </TableCell>
              </TableRow>
            ) : expenses.map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-medium text-sm">{e.description}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{CATEGORY_LABELS[e.category] ?? e.category}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.tripId ? tripsData?.data.find(t => t.id === e.tripId)?.name ?? e.tripId.slice(0, 8) + "…" : "—"}</TableCell>
                <TableCell className="text-sm">{new Date(e.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-medium text-sm">{fmt(e.amount)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{METHOD_LABELS[e.paymentMethod ?? ""] ?? e.paymentMethod ?? "—"}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[e.status] ?? "bg-gray-100 text-gray-800"}`}>
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {e.status !== "paid" && (
                    <Button size="sm" variant="outline" onClick={() => handleMarkPaid(e.id)}>
                      <CheckCircle className="w-4 h-4 mr-1" /> Pago
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Despesa</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoria</label>
                <Select name="category" defaultValue="transport">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transport">Transporte</SelectItem>
                    <SelectItem value="accommodation">Hospedagem</SelectItem>
                    <SelectItem value="food">Alimentação</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="administrative">Administrativo</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Forma de Pagamento</label>
                <Select value={expenseMethod} onValueChange={setExpenseMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="credit_card">Cartão</SelectItem>
                    <SelectItem value="bank_transfer">Transferência</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição *</label>
              <Input name="description" required placeholder="Ex: Passagens aéreas São Paulo" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor (R$) *</label>
                <Input name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Vencimento *</label>
                <Input name="dueDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Viagem (opcional)</label>
              <Select name="tripId" defaultValue="">
                <SelectTrigger><SelectValue placeholder="Vincular a uma viagem..." /></SelectTrigger>
                <SelectContent className="max-h-48">
                  <SelectItem value="">Nenhuma</SelectItem>
                  {tripsData?.data.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <Input name="notes" placeholder="Informações adicionais..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createExpense.isPending}>
                {createExpense.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
