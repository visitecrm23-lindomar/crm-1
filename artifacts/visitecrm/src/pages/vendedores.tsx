import { useState } from "react";
import {
  useListUsers,
  useListCommissions,
  useListReservations,
  useListDeals,
  useListPipelineStages,
  useListSystemConfigs,
} from "@workspace/api-client-react";
import type { UserProfile, Commission, Deal } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, DollarSign, TrendingUp, Award, ChevronRight, Target } from "lucide-react";

function fmtCurrency(v: number | string | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SellerStats {
  user: UserProfile;
  salesCount: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  dealCount: number;
  dealValue: number;
}

function GoalsChart({ stats, monthlyGoal }: { stats: SellerStats[]; monthlyGoal: number }) {
  const top = [...stats].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-4 h-4" />
          Metas vs Realizado — Meta mensal por vendedor: {fmtCurrency(monthlyGoal)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Sem dados de venda para exibir
          </p>
        ) : (
          <div className="space-y-4">
            {top.map((s) => {
              const pct = Math.min(100, (s.revenue / monthlyGoal) * 100);
              return (
                <div key={s.user.id} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{s.user.name}</span>
                    <span className="text-muted-foreground">
                      {fmtCurrency(s.revenue)} / {fmtCurrency(monthlyGoal)}
                    </span>
                  </div>
                  <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 100
                          ? "bg-green-500"
                          : pct >= 70
                          ? "bg-primary"
                          : pct >= 40
                          ? "bg-yellow-500"
                          : "bg-red-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute right-2 top-0 bottom-0 flex items-center text-xs font-bold text-foreground/80">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineView({
  deals,
  stages,
}: {
  deals: Deal[];
  stages: { id: string; name: string; color?: string | null }[];
}) {
  if (deals.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-4">
        Nenhum negócio no pipeline deste vendedor
      </p>
    );
  }

  const byStage: Record<string, Deal[]> = {};
  deals.forEach((d) => {
    const key = d.stageName ?? d.stageId;
    byStage[key] = [...(byStage[key] ?? []), d];
  });

  return (
    <div className="space-y-3">
      {Object.entries(byStage).map(([stage, stageDeals]) => {
        const total = stageDeals.reduce((s, d) => s + d.value, 0);
        return (
          <div key={stage} className="rounded-lg border p-3">
            <div className="flex justify-between items-center mb-2">
              <Badge variant="secondary" className="text-xs">
                {stage}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {stageDeals.length} negócio(s) — {fmtCurrency(total)}
              </span>
            </div>
            <div className="space-y-1">
              {stageDeals.slice(0, 5).map((d) => (
                <div key={d.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[200px]">{d.title}</span>
                  <span className="font-mono font-medium">{fmtCurrency(d.value)}</span>
                </div>
              ))}
              {stageDeals.length > 5 && (
                <p className="text-xs text-muted-foreground">+{stageDeals.length - 5} mais</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Vendedores() {
  const { data: users = [] } = useListUsers();
  const { data: allCommissions = [] } = useListCommissions();
  const { data: reservationsData } = useListReservations({ limit: 500 });
  const reservations = reservationsData?.data ?? [];
  const { data: allDeals = [] } = useListDeals();
  const { data: stages = [] } = useListPipelineStages();
  const { data: configs } = useListSystemConfigs();
  const monthlyGoal = (() => {
    const v = (configs ?? []).find((c) => c.key === "salesMonthlyGoal")?.value;
    const parsed = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    return isNaN(parsed) || parsed <= 0 ? 50000 : parsed;
  })();

  const [selectedSeller, setSelectedSeller] = useState<SellerStats | null>(null);

  const sellers = users.filter(
    (u) => u.role === "vendedor" || u.role === "agencia" || u.role === "superadmin"
  );

  const stats: SellerStats[] = sellers.map((user) => {
    const userCommissions: Commission[] = allCommissions.filter(
      (c) => c.userId === user.id
    );
    const commission = userCommissions.reduce(
      (sum, c) => sum + parseFloat(c.commissionAmount ?? "0"),
      0
    );
    const revenue = userCommissions.reduce(
      (sum, c) => sum + parseFloat(c.baseAmount ?? "0"),
      0
    );
    const salesCount = userCommissions.length;
    const userDeals = allDeals.filter((d) => d.ownerId === user.id);
    const dealValue = userDeals.reduce((s, d) => s + d.value, 0);
    const wonDeals = userDeals.filter((d) => d.status === "won").length;
    const closedDeals = userDeals.filter(
      (d) => d.status === "won" || d.status === "lost"
    ).length;
    const conversionRate = closedDeals > 0 ? Math.round((wonDeals / closedDeals) * 100) : 0;
    return { user, salesCount, revenue, commission, conversionRate, dealCount: userDeals.length, dealValue };
  });

  const totalSellers = stats.length;
  const totalSales = stats.reduce((s, x) => s + x.salesCount, 0);
  const totalCommission = stats.reduce((s, x) => s + x.commission, 0);
  const totalRevenue = stats.reduce((s, x) => s + x.revenue, 0);
  const avgConversion =
    stats.length > 0
      ? stats.reduce((s, x) => s + x.conversionRate, 0) / stats.length
      : 0;

  const sorted = [...stats].sort((a, b) => b.revenue - a.revenue);

  function openSeller(s: SellerStats) {
    setSelectedSeller(s);
  }

  const sellerReservations = selectedSeller
    ? reservations.filter(
        (r) =>
          allCommissions.some(
            (c) => c.userId === selectedSeller.user.id && c.reservationId === r.id
          )
      )
    : [];

  const sellerCommissions: Commission[] = selectedSeller
    ? allCommissions.filter((c) => c.userId === selectedSeller.user.id)
    : [];

  const sellerDeals: Deal[] = selectedSeller
    ? allDeals.filter((d) => d.ownerId === selectedSeller.user.id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard de Vendedores</h1>
        <p className="text-sm text-muted-foreground">Desempenho e comissões da equipe de vendas</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total de Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSellers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="w-4 h-4" />
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Comissão Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtCurrency(totalCommission)}</p>
            <p className="text-xs text-muted-foreground">
              de {fmtCurrency(totalRevenue)} em vendas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Conversão Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{avgConversion.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">negócios ganhos/fechados</p>
          </CardContent>
        </Card>
      </div>

      {/* Goals vs actual chart */}
      <GoalsChart stats={stats} monthlyGoal={monthlyGoal} />

      {/* Ranking table */}
      <Card>
        <CardHeader>
          <CardTitle>Ranking de Vendedores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Vendas</TableHead>
                <TableHead>Receita</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Negócios</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Nenhum vendedor com dados de comissão
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((s, idx) => (
                  <TableRow key={s.user.id}>
                    <TableCell>
                      <span
                        className={`font-bold ${
                          idx === 0
                            ? "text-yellow-500"
                            : idx === 1
                            ? "text-gray-400"
                            : idx === 2
                            ? "text-orange-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{s.user.name}</p>
                        <p className="text-xs text-muted-foreground">{s.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {s.user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.salesCount}</TableCell>
                    <TableCell>{fmtCurrency(s.revenue)}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {fmtCurrency(s.commission)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{s.dealCount}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={s.conversionRate} className="w-16 h-1.5" />
                        <span className="text-xs">{s.conversionRate}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSeller(s)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-seller detail */}
      <Dialog open={!!selectedSeller} onOpenChange={() => setSelectedSeller(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSeller?.user.name} — Detalhes
            </DialogTitle>
          </DialogHeader>
          {selectedSeller && (
            <div className="space-y-4">
              {/* Personal KPIs */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="text-2xl font-bold">{selectedSeller.salesCount}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Receita gerada</p>
                  <p className="text-xl font-bold">{fmtCurrency(selectedSeller.revenue)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Comissão</p>
                  <p className="text-xl font-bold text-green-600">
                    {fmtCurrency(selectedSeller.commission)}
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Conversão</p>
                  <p className="text-2xl font-bold">{selectedSeller.conversionRate}%</p>
                </div>
              </div>

              {/* Goal progress */}
              <div className="rounded-lg border p-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">Meta mensal</span>
                  <span className="text-muted-foreground">
                    {fmtCurrency(selectedSeller.revenue)} / {fmtCurrency(monthlyGoal)}
                  </span>
                </div>
                <Progress
                  value={Math.min(100, (selectedSeller.revenue / monthlyGoal) * 100)}
                  className="h-3"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.min(100, Math.round((selectedSeller.revenue / monthlyGoal) * 100))}% da meta atingida
                </p>
              </div>

              <Tabs defaultValue="commissions">
                <TabsList>
                  <TabsTrigger value="commissions">Comissões</TabsTrigger>
                  <TabsTrigger value="pipeline">
                    Pipeline ({sellerDeals.length})
                  </TabsTrigger>
                  <TabsTrigger value="reservations">
                    Reservas ({sellerReservations.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="commissions">
                  <div className="rounded-md border mt-2">
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
                        {sellerCommissions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                              Nenhuma comissão registrada
                            </TableCell>
                          </TableRow>
                        ) : (
                          sellerCommissions.slice(0, 10).map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="text-sm">
                                {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                              </TableCell>
                              <TableCell>{fmtCurrency(c.baseAmount)}</TableCell>
                              <TableCell className="text-green-600">
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
                  </div>
                </TabsContent>

                <TabsContent value="pipeline" className="mt-2">
                  <PipelineView deals={sellerDeals} stages={stages} />
                </TabsContent>

                <TabsContent value="reservations">
                  {sellerReservations.length > 0 ? (
                    <div className="rounded-md border mt-2">
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
                          {sellerReservations.slice(0, 8).map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.voucherCode}</TableCell>
                              <TableCell>{r.client.name}</TableCell>
                              <TableCell>{r.trip.name}</TableCell>
                              <TableCell>{fmtCurrency(r.totalValue)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {r.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      Nenhuma reserva associada via comissão
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
