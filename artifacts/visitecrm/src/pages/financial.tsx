import { useState } from "react";
import { useGetPaymentsSummary, useListPayments, useListExpenses, useCreatePayment, useCreateExpense, useUpdatePayment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
};

export default function Financial() {
  const [tab, setTab] = useState("receivable");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useGetPaymentsSummary();
  const { data: paymentsData, isLoading: loadingPayments, refetch: refetchPayments } = useListPayments({ type: tab, limit: 20 });
  const { data: expensesData, isLoading: loadingExpenses, refetch: refetchExpenses } = useListExpenses({ limit: 20 });

  const createPayment = useCreatePayment();
  const createExpense = useCreateExpense();
  const updatePayment = useUpdatePayment();

  const handleCreatePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createPayment.mutateAsync({
      data: {
        type: fd.get("type") as string,
        category: fd.get("category") as string || "reservation",
        amount: parseFloat(fd.get("amount") as string || "0"),
        paymentMethod: fd.get("paymentMethod") as string || "pix",
        dueDate: fd.get("dueDate") as string,
        description: fd.get("description") as string || undefined,
        installments: parseInt(fd.get("installments") as string || "1"),
      }
    });
    setIsPaymentOpen(false);
    refetchPayments();
    refetchSummary();
  };

  const handleCreateExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await createExpense.mutateAsync({
      data: {
        category: fd.get("category") as string || "transport",
        description: fd.get("description") as string,
        amount: parseFloat(fd.get("amount") as string || "0"),
        dueDate: fd.get("dueDate") as string,
        paymentMethod: fd.get("paymentMethod") as string || undefined,
        notes: fd.get("notes") as string || undefined,
      }
    });
    setIsExpenseOpen(false);
    refetchExpenses();
  };

  const handleMarkPaid = async (paymentId: string) => {
    await updatePayment.mutateAsync({ id: paymentId, data: { status: "paid", paidAt: new Date().toISOString() } });
    refetchPayments();
    refetchSummary();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground mt-1">Controle receitas, despesas e fluxo de caixa.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isExpenseOpen} onOpenChange={setIsExpenseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="w-4 h-4 mr-2" /> Nova Despesa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Despesa</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateExpense} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Categoria</label>
                  <Select name="category" defaultValue="transport">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transport">Transporte</SelectItem>
                      <SelectItem value="accommodation">Hospedagem</SelectItem>
                      <SelectItem value="food">Alimentação</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input name="description" required placeholder="Descrição da despesa" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Valor (R$)</label>
                    <Input name="amount" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vencimento</label>
                    <Input name="dueDate" type="date" required />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createExpense.isPending}>
                    {createExpense.isPending ? "Salvando..." : "Salvar Despesa"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Novo Lançamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
              <form onSubmit={handleCreatePayment} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tipo</label>
                    <Select name="type" defaultValue="receivable">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receivable">A Receber</SelectItem>
                        <SelectItem value="payable">A Pagar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Forma de Pagamento</label>
                    <Select name="paymentMethod" defaultValue="pix">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="credit_card">Cartão</SelectItem>
                        <SelectItem value="bank_transfer">Transferência</SelectItem>
                        <SelectItem value="cash">Dinheiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input name="description" placeholder="Descrição do lançamento" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Valor (R$)</label>
                    <Input name="amount" type="number" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vencimento</label>
                    <Input name="dueDate" type="date" required />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={createPayment.isPending}>
                    {createPayment.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">A Receber</CardTitle></CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(summary?.totalReceivable ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Vencido: {formatCurrency(summary?.overdueReceivable ?? 0)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">A Pagar</CardTitle></CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(summary?.totalPayable ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Vencido: {formatCurrency(summary?.overduePayable ?? 0)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Recebido no Mês</CardTitle></CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-32" /> : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summary?.collectedThisMonth ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">Pago: {formatCurrency(summary?.paidThisMonth ?? 0)}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="receivable">Contas a Receber</TabsTrigger>
          <TabsTrigger value="payable">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
        </TabsList>

        <TabsContent value="receivable" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPayments ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : paymentsData?.data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                ) : paymentsData?.data.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><p className="font-medium">{p.description || "—"}</p><p className="text-xs text-muted-foreground">{p.category}</p></TableCell>
                    <TableCell>{new Date(p.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] ?? "bg-gray-100 text-gray-800"}`}>{statusLabels[p.status] ?? p.status}</span></TableCell>
                    <TableCell className="text-right">
                      {p.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)}>
                          <CheckCircle className="w-4 h-4 mr-1" /> Marcar Pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payable" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPayments ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : paymentsData?.data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                ) : paymentsData?.data.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><p className="font-medium">{p.description || "—"}</p><p className="text-xs text-muted-foreground">{p.category}</p></TableCell>
                    <TableCell>{new Date(p.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                    <TableCell><span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] ?? "bg-gray-100 text-gray-800"}`}>{statusLabels[p.status] ?? p.status}</span></TableCell>
                    <TableCell className="text-right">
                      {p.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)}>
                          <CheckCircle className="w-4 h-4 mr-1" /> Pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingExpenses ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : expensesData?.data.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma despesa registrada.</TableCell></TableRow>
                ) : expensesData?.data.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.description}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{new Date(e.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(e.amount)}</TableCell>
                    <TableCell><span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[e.status] ?? "bg-gray-100 text-gray-800"}`}>{statusLabels[e.status] ?? e.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
