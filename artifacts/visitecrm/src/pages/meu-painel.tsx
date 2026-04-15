import { useMemo } from "react";
import {
  useGetMe,
  useListCommissions,
  useListReservations,
  useListDeals,
  useListSalesGoals,
} from "@workspace/api-client-react";
import type { Commission } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, Award, Target, Gauge } from "lucide-react";

function fmtCurrency(v: number | string | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function MeuPainel() {
  const { data: me } = useGetMe();
  const { data: allCommissions = [] } = useListCommissions();
  const { data: reservationsData } = useListReservations({ limit: 200 } as Parameters<typeof useListReservations>[0]);
  const reservations = reservationsData?.data ?? [];
  const { data: allDeals = [] } = useListDeals();
  const { data: goals = [] } = useListSalesGoals({
    userId: me?.id,
    month: currentMonth(),
  });

  const myCommissions: Commission[] = useMemo(
    () => (me ? allCommissions.filter((c) => c.userId === me.id) : []),
    [allCommissions, me]
  );

  const totalRevenue = useMemo(
    () => myCommissions.reduce((sum, c) => sum + parseFloat(c.baseAmount ?? "0"), 0),
    [myCommissions]
  );

  const totalCommission = useMemo(
    () => myCommissions.reduce((sum, c) => sum + parseFloat(c.commissionAmount ?? "0"), 0),
    [myCommissions]
  );

  const pendingCommission = useMemo(
    () =>
      myCommissions
        .filter((c) => c.status === "pending")
        .reduce((sum, c) => sum + parseFloat(c.commissionAmount ?? "0"), 0),
    [myCommissions]
  );

  const paidCommission = useMemo(
    () =>
      myCommissions
        .filter((c) => c.status === "paid")
        .reduce((sum, c) => sum + parseFloat(c.commissionAmount ?? "0"), 0),
    [myCommissions]
  );

  const myDeals = useMemo(
    () => (me ? allDeals.filter((d) => d.ownerId === me.id) : []),
    [allDeals, me]
  );

  const myReservations = useMemo(
    () =>
      reservations.filter((r) =>
        myCommissions.some((c) => c.reservationId === r.id)
      ),
    [reservations, myCommissions]
  );

  const wonDeals = myDeals.filter((d) => d.status === "won").length;
  const closedDeals = myDeals.filter((d) => d.status === "won" || d.status === "lost").length;
  const conversionRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;

  const activeGoal = goals.find((g) => g.status === "active");
  const monthlyGoal = activeGoal?.goalAmount ?? me?.monthlyGoal ?? 0;
  const goalPct = monthlyGoal > 0 ? Math.min(100, (totalRevenue / monthlyGoal) * 100) : 0;

  const month = currentMonth();
  const monthlyCommissions = myCommissions.filter((c) => c.createdAt.startsWith(month));
  const monthlyRevenue = monthlyCommissions.reduce((s, c) => s + parseFloat(c.baseAmount ?? "0"), 0);
  const monthlyCommissionTotal = monthlyCommissions.reduce((s, c) => s + parseFloat(c.commissionAmount ?? "0"), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary" />
          Meu Painel
        </h1>
        <p className="text-sm text-muted-foreground">
          Seu desempenho de vendas e comissões — {me?.name}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Receita Gerada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtCurrency(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">{myCommissions.length} venda(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="w-4 h-4" />
              Comissão Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fmtCurrency(totalCommission)}</p>
            <p className="text-xs text-muted-foreground">{fmtCurrency(paidCommission)} pago</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">{wonDeals}/{closedDeals} fechados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              Comissão Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{fmtCurrency(pendingCommission)}</p>
            <p className="text-xs text-muted-foreground">a receber</p>
          </CardContent>
        </Card>
      </div>

      {/* Commission config banner */}
      {me?.commissionType && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-xs text-muted-foreground">Tipo de comissão</p>
                <p className="font-semibold">
                  {me.commissionType === "fixed" ? "Valor fixo" : "Percentual"}
                </p>
              </div>
              {me.commissionType === "percentage" && (
                <div>
                  <p className="text-xs text-muted-foreground">Taxa</p>
                  <p className="font-semibold">{me.commissionRate ?? 0}%</p>
                </div>
              )}
              {me.commissionType === "fixed" && (
                <div>
                  <p className="text-xs text-muted-foreground">Valor fixo</p>
                  <p className="font-semibold">{fmtCurrency(me.commissionFixed)}</p>
                </div>
              )}
              {monthlyGoal > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Meta mensal</p>
                  <p className="font-semibold">{fmtCurrency(monthlyGoal)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly goal progress */}
      {monthlyGoal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Meta do Mês Atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Receita este mês</span>
              <span className="font-medium">
                {fmtCurrency(monthlyRevenue)} / {fmtCurrency(monthlyGoal)}
              </span>
            </div>
            <div className="relative h-5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  goalPct >= 100
                    ? "bg-green-500"
                    : goalPct >= 70
                    ? "bg-primary"
                    : goalPct >= 40
                    ? "bg-yellow-500"
                    : "bg-red-400"
                }`}
                style={{ width: `${goalPct}%` }}
              />
              <span className="absolute right-2 top-0 bottom-0 flex items-center text-xs font-bold text-foreground/80">
                {goalPct.toFixed(0)}%
              </span>
            </div>
            {monthlyCommissionTotal > 0 && (
              <p className="text-sm text-muted-foreground">
                Comissão neste mês: <strong className="text-green-600">{fmtCurrency(monthlyCommissionTotal)}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent commissions */}
      <Card>
        <CardHeader>
          <CardTitle>Minhas Comissões</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Valor Base</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myCommissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma comissão registrada ainda
                  </TableCell>
                </TableRow>
              ) : (
                myCommissions.slice(0, 15).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{fmtCurrency(c.baseAmount)}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {fmtCurrency(c.commissionAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "paid" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {c.status === "paid" ? "Pago" : c.status === "pending" ? "Pendente" : c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent reservations */}
      {myReservations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Minhas Reservas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Viagem</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myReservations.slice(0, 10).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.voucherCode}</TableCell>
                    <TableCell>{r.client.name}</TableCell>
                    <TableCell className="truncate max-w-[180px]">{r.trip.name}</TableCell>
                    <TableCell>{fmtCurrency(r.totalValue)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
