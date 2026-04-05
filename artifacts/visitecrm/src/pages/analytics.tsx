import { useGetDashboardSummary, useGetDashboardRevenueChart } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, TrendingUp, Users, Map, DollarSign, CalendarCheck } from "lucide-react";

export default function Analytics() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: chartData } = useGetDashboardRevenueChart({ period: "12m" });

  const maxRevenue = Math.max(...(chartData?.map((d) => d.revenue) ?? [1]), 1);

  const kpis = [
    {
      title: "Receita Total",
      value: summary ? `R$ ${summary.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—",
      sub: `R$ ${summary?.revenueThisMonth?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "0,00"} este mes`,
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      title: "Total de Clientes",
      value: summary?.totalClients?.toString() ?? "—",
      sub: `+${summary?.newClientsThisMonth ?? 0} este mes`,
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Reservas",
      value: summary?.totalReservations?.toString() ?? "—",
      sub: `${summary?.confirmedReservations ?? 0} confirmadas`,
      icon: CalendarCheck,
      color: "text-purple-600",
    },
    {
      title: "Taxa de Ocupacao",
      value: summary ? `${Number(summary.occupancyRate).toFixed(1)}%` : "—",
      sub: `${summary?.activeTrips ?? 0} viagens ativas`,
      icon: Map,
      color: "text-orange-600",
    },
    {
      title: "NPS Medio",
      value: summary?.averageNps != null ? Number(summary.averageNps).toFixed(1) : "—",
      sub: summary?.averageNps != null
        ? Number(summary.averageNps) >= 70 ? "Excelente" : Number(summary.averageNps) >= 50 ? "Bom" : "A melhorar"
        : "Sem dados",
      icon: TrendingUp,
      color: "text-teal-600",
    },
    {
      title: "Pipeline Aberto",
      value: summary ? `R$ ${Number(summary.dealsPipelineValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—",
      sub: `${summary?.openDeals ?? 0} negocios abertos`,
      icon: BarChart2,
      color: "text-indigo-600",
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analiticos</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Visao geral de desempenho da agencia</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-24 bg-muted/30 rounded-lg" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title}>
              <CardContent className="p-5 flex items-start gap-4">
                <div className={`mt-1 p-2 rounded-md bg-muted ${kpi.color}`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita x Despesas (12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {!chartData || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados disponiveis</p>
          ) : (
            <div className="flex items-end gap-1 h-48">
              {chartData.map((point, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col gap-0.5 justify-end" style={{ height: "160px" }}>
                    <div
                      className="w-full bg-primary/80 rounded-t-sm min-h-[2px]"
                      style={{ height: `${Math.max((point.revenue / maxRevenue) * 140, 2)}px` }}
                      title={`Receita: R$ ${point.revenue.toLocaleString("pt-BR")}`}
                    />
                    <div
                      className="w-full bg-destructive/60 rounded-t-sm min-h-[2px]"
                      style={{ height: `${Math.max((point.expenses / maxRevenue) * 140, 2)}px` }}
                      title={`Despesas: R$ ${point.expenses.toLocaleString("pt-BR")}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{point.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary/80 inline-block" /> Receita
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-destructive/60 inline-block" /> Despesas
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Pagamentos Pendentes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">
              R$ {Number(summary?.pendingPayments ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-muted-foreground mt-1">A receber em aberto</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Viagens Ativas</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {summary?.activeTrips ?? 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              de {summary?.totalTrips ?? 0} viagens cadastradas
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
