import { useState, useMemo } from "react";
import {
  useGetDashboardRevenueChart,
  useGetPaymentsSummary,
  useListPayments,
  useListTrips,
  useListReservations,
} from "@workspace/api-client-react";
import type { GetDashboardRevenueChartPeriod } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, BarChart2, Target } from "lucide-react";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtCompact = (v: number) => {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

function RevenueBarChart({ data }: { data: Array<{ label: string; revenue: number; expenses: number }> }) {
  const max = Math.max(...data.map(d => Math.max(d.revenue, d.expenses)), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5 h-52">
        {data.map((point, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex justify-center gap-0.5 items-end" style={{ height: "190px" }}>
              <div
                className="flex-1 bg-primary/80 rounded-t-sm min-h-[2px] hover:bg-primary transition-colors"
                style={{ height: `${Math.max((point.revenue / max) * 180, 2)}px` }}
                title={`Receita: ${fmt(point.revenue)}`}
              />
              <div
                className="flex-1 bg-destructive/60 rounded-t-sm min-h-[2px] hover:bg-destructive/80 transition-colors"
                style={{ height: `${Math.max((point.expenses / max) * 180, 2)}px` }}
                title={`Despesas: ${fmt(point.expenses)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/80 inline-block" /> Receita</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-destructive/60 inline-block" /> Despesas</span>
      </div>
    </div>
  );
}

function PaymentMethodBar({ method, amount, total, color }: { method: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{method}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium w-20 text-right">{fmtCompact(amount)}</span>
      <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function Revenue() {
  const [period, setPeriod] = useState<GetDashboardRevenueChartPeriod>("12m");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: chartData, isLoading: loadingChart } = useGetDashboardRevenueChart({ period });
  const { data: paymentSummary, isLoading: loadingSummary } = useGetPaymentsSummary();
  const { data: paymentsData } = useListPayments({ type: "receivable", status: "paid", limit: 500 });
  const { data: tripsData } = useListTrips({ limit: 20 });
  const { data: reservationsData } = useListReservations({ limit: 200 });

  const totalRevenue = chartData?.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const totalExpenses = chartData?.reduce((s, d) => s + d.expenses, 0) ?? 0;
  const netRevenue = totalRevenue - totalExpenses;
  const avgMonthly = chartData?.length ? totalRevenue / chartData.length : 0;

  const paymentMethodTotals = useMemo(() => {
    const payments = paymentsData?.data ?? [];
    const methodMap: Record<string, number> = {};
    for (const p of payments) {
      if (!p.paymentMethod) continue;
      methodMap[p.paymentMethod] = (methodMap[p.paymentMethod] ?? 0) + parseFloat(String(p.amount));
    }
    return methodMap;
  }, [paymentsData]);

  const methodTotal = Object.values(paymentMethodTotals).reduce((a, b) => a + b, 0);

  const methodColors: Record<string, string> = {
    pix: "#10B981",
    credit_card: "#8B5CF6",
    debit_card: "#6366F1",
    bank_transfer: "#3B82F6",
    cash: "#F59E0B",
    boleto: "#EF4444",
  };
  const methodLabels: Record<string, string> = {
    pix: "PIX",
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de Débito",
    bank_transfer: "Transferência",
    cash: "Dinheiro",
    boleto: "Boleto",
  };

  const filteredChart = useMemo(() => {
    if (!chartData) return [];
    if (!dateFrom && !dateTo) return chartData;
    return chartData.filter(d => {
      if (dateFrom && d.label < dateFrom) return false;
      if (dateTo && d.label > dateTo) return false;
      return true;
    });
  }, [chartData, dateFrom, dateTo]);

  const topTrips = useMemo(() => {
    const trips = tripsData?.data ?? [];
    const reservations = reservationsData?.data ?? [];
    return trips
      .map(t => ({
        ...t,
        revenue: reservations.filter(r => r.tripId === t.id).reduce((s, r) => s + r.paidValue, 0),
        count: reservations.filter(r => r.tripId === t.id).length,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [tripsData, reservationsData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receita</h1>
          <p className="text-muted-foreground text-sm">Analise detalhada de receitas, despesas e desempenho financeiro</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" placeholder="De" />
          <span className="text-muted-foreground text-sm">até</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" placeholder="Até" />
          <Select value={period} onValueChange={v => setPeriod(v as GetDashboardRevenueChartPeriod)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
              <SelectItem value="ytd">Ano atual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <div className="mt-1 p-2 rounded-md bg-muted text-green-600"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Receita Bruta</p>
              {loadingChart ? <Skeleton className="h-8 w-28 mt-1" /> : <p className="text-2xl font-bold">{fmtCompact(totalRevenue)}</p>}
              <div className="flex items-center gap-1 mt-0.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs text-green-600">no período</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <div className="mt-1 p-2 rounded-md bg-muted text-red-600"><ArrowDownRight className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Despesas</p>
              {loadingChart ? <Skeleton className="h-8 w-28 mt-1" /> : <p className="text-2xl font-bold">{fmtCompact(totalExpenses)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <div className={`mt-1 p-2 rounded-md bg-muted ${netRevenue >= 0 ? "text-green-600" : "text-red-600"}`}><DollarSign className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Resultado Líquido</p>
              {loadingChart ? <Skeleton className="h-8 w-28 mt-1" /> : (
                <p className={`text-2xl font-bold ${netRevenue >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtCompact(netRevenue)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            <div className="mt-1 p-2 rounded-md bg-muted text-blue-600"><Target className="w-5 h-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Média Mensal</p>
              {loadingChart ? <Skeleton className="h-8 w-28 mt-1" /> : <p className="text-2xl font-bold">{fmtCompact(avgMonthly)}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">A Receber: {fmtCompact(paymentSummary?.totalReceivable ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Receita vs Despesas por Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingChart ? (
              <Skeleton className="h-52 w-full" />
            ) : !filteredChart.length ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">Sem dados disponíveis</div>
            ) : (
              <RevenueBarChart data={filteredChart} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Formas de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(paymentMethodTotals).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Nenhum pagamento recebido ainda.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(paymentMethodTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => (
                    <PaymentMethodBar
                      key={method}
                      method={methodLabels[method] ?? method}
                      amount={amount}
                      total={methodTotal}
                      color={methodColors[method] ?? "#94A3B8"}
                    />
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Viagens por Receita Gerada</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Viagem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Reservas</TableHead>
                <TableHead>Ocupação</TableHead>
                <TableHead>Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topTrips.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma viagem encontrada.</TableCell></TableRow>
              ) : topTrips.map((t, i) => {
                const occupancy = t.totalCapacity > 0 ? ((t.totalCapacity - t.availableSeats) / t.totalCapacity * 100) : 0;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.destination}</TableCell>
                    <TableCell className="text-sm">{t.count}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5 max-w-[80px]">
                          <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(occupancy, 100)}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{occupancy.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-sm">{fmt(t.revenue)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
