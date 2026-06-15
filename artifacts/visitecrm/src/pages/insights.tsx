import { useState } from "react";
import { useGetInsightsSummary } from "@workspace/api-client-react";
import type { GetInsightsSummaryPeriod } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Minus,
  DollarSign, Users, Target, BarChart2, Map, Star, BrainCircuit,
  ShoppingCart, Zap, Package, Heart, Globe,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: number) => formatCurrency(v);
const fmtCompact = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return fmt(v);
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtNum = (v: number) => String(Math.round(v));

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function VariationBadge({ curr, prev, invert = false }: { curr: number; prev: number | null; invert?: boolean }) {
  if (prev === null || prev === 0) return null;
  const delta = ((curr - (prev ?? 0)) / Math.abs(prev)) * 100;
  const isPositive = invert ? delta < 0 : delta >= 0;
  const color = isPositive ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50";
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  if (Math.abs(delta) < 0.05) return <span className="text-xs text-muted-foreground ml-1">—</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ml-1.5 ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  prev,
  prevValue,
  sub,
  color,
  loading,
  invert,
  format = "compact",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  prev?: number | null;
  prevValue?: string;
  sub?: string;
  color: string;
  loading?: boolean;
  invert?: boolean;
  format?: "compact" | "currency" | "pct" | "num";
}) {
  const display =
    format === "pct" ? fmtPct(value) :
    format === "num" ? fmtNum(value) :
    format === "currency" ? fmt(value) :
    fmtCompact(value);

  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`mt-1 p-2 rounded-md bg-muted ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-28 mt-1" />
          ) : (
            <div className="flex items-center flex-wrap mt-0.5">
              <p className="text-xl font-bold">{display}</p>
              {prev != null && <VariationBadge curr={value} prev={prev} invert={invert} />}
            </div>
          )}
          {sub && !loading && (
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          )}
          {prevValue && !loading && (
            <p className="text-xs text-muted-foreground mt-0.5">Período anterior: {prevValue}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  month: "mês anterior",
  quarter: "trimestre anterior",
  year: "ano anterior",
};

export default function Insights() {
  const [period, setPeriod] = useState<GetInsightsSummaryPeriod>("month");
  const { data, isLoading } = useGetInsightsSummary({ period });
  const prevLabel = PERIOD_LABELS[period] ?? "período anterior";

  const ex = data?.executive;
  const co = data?.commercial;
  const mk = data?.marketing;
  const fi = data?.financial;
  const op = data?.operational;
  const re = data?.retention;
  const ex2 = data?.expansion;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-primary" />
            Insights Estratégicos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Inteligência de negócio em 7 pilares — variações vs. {prevLabel}
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as GetInsightsSummaryPeriod)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="quarter">Último trimestre</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="executiva">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="executiva">Executiva</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="financeira">Financeira</TabsTrigger>
          <TabsTrigger value="operacional">Operacional</TabsTrigger>
          <TabsTrigger value="retencao">Retenção</TabsTrigger>
          <TabsTrigger value="expansao">Expansão</TabsTrigger>
        </TabsList>

        {/* ─── EXECUTIVA ─────────────────────────────────────────────── */}
        <TabsContent value="executiva" className="mt-5 space-y-4">
          <SectionHeader
            icon={BarChart2}
            title="Visão Executiva"
            description="Panorama completo da saúde do negócio no período"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={DollarSign} label="Receita Total" value={ex?.totalRevenue ?? 0} prev={ex?.totalRevenuePrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(ex?.totalRevenuePrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Lucro Líquido" value={ex?.netProfit ?? 0} prev={ex?.netProfitPrev ?? null} format="compact" color={(ex?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} loading={isLoading} prevValue={fmtCompact(ex?.netProfitPrev ?? 0)} />
            <KpiCard icon={Target} label="Margem de Lucro" value={ex?.profitMargin ?? 0} prev={ex?.profitMarginPrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(ex?.profitMarginPrev ?? 0)} />
            <KpiCard icon={Users} label="Novos Clientes" value={ex?.newClients ?? 0} prev={ex?.newClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(ex?.newClientsPrev ?? 0)} />
            <KpiCard icon={ShoppingCart} label="Reservas Confirmadas" value={ex?.confirmedReservations ?? 0} prev={ex?.confirmedReservationsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(ex?.confirmedReservationsPrev ?? 0)} />
            <KpiCard icon={Map} label="Viagens Ativas" value={ex?.activeTrips ?? 0} format="num" color="text-orange-600" loading={isLoading} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={ex?.conversionRate ?? 0} prev={ex?.conversionRatePrev ?? null} format="pct" color="text-purple-600" loading={isLoading} prevValue={fmtPct(ex?.conversionRatePrev ?? 0)} />
            <KpiCard icon={BarChart2} label="Ocupação Média" value={ex?.occupancyRate ?? 0} format="pct" color="text-cyan-600" loading={isLoading} />
          </div>

          {ex?.averageNps != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-4 h-4" /> NPS — Net Promoter Score
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div>
                  <p className="text-5xl font-bold">{Number(ex.averageNps).toFixed(0)}</p>
                  <p className={`text-sm font-medium mt-1 ${Number(ex.averageNps) >= 70 ? "text-green-600" : Number(ex.averageNps) >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {Number(ex.averageNps) >= 70 ? "Excelente" : Number(ex.averageNps) >= 50 ? "Bom" : "A melhorar"}
                  </p>
                </div>
                <div className="flex-1">
                  <div className="w-full bg-muted rounded-full h-3">
                    <div className={`h-3 rounded-full ${Number(ex.averageNps) >= 70 ? "bg-green-500" : Number(ex.averageNps) >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(Number(ex.averageNps), 100)}%` }} />
                  </div>
                  {ex.averageNpsPrev != null && (
                    <p className="text-xs text-muted-foreground mt-1">Período anterior: {Number(ex.averageNpsPrev).toFixed(0)} pontos</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── COMERCIAL ─────────────────────────────────────────────── */}
        <TabsContent value="comercial" className="mt-5 space-y-4">
          <SectionHeader
            icon={Target}
            title="Visão Comercial"
            description="Pipeline, conversão e desempenho de vendas"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Target} label="Negócios Abertos" value={co?.openDeals ?? 0} prev={co?.openDealsPrev ?? null} format="num" color="text-orange-600" loading={isLoading} prevValue={fmtNum(co?.openDealsPrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Negócios Ganhos" value={co?.wonDeals ?? 0} prev={co?.wonDealsPrev ?? null} format="num" color="text-green-600" loading={isLoading} prevValue={fmtNum(co?.wonDealsPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Valor do Pipeline" value={co?.pipelineValue ?? 0} prev={co?.pipelineValuePrev ?? null} format="compact" color="text-blue-600" loading={isLoading} prevValue={fmtCompact(co?.pipelineValuePrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={co?.avgTicket ?? 0} prev={co?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(co?.avgTicketPrev ?? 0)} />
            <KpiCard icon={ShoppingCart} label="Novas Reservas" value={co?.newReservations ?? 0} prev={co?.newReservationsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(co?.newReservationsPrev ?? 0)} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={co?.conversionRate ?? 0} prev={co?.conversionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(co?.conversionRatePrev ?? 0)} />
            <KpiCard icon={Users} label="Total de Leads" value={co?.totalLeads ?? 0} prev={co?.totalLeadsPrev ?? null} format="num" color="text-cyan-600" loading={isLoading} prevValue={fmtNum(co?.totalLeadsPrev ?? 0)} />
            <KpiCard icon={TrendingDown} label="Cancelamentos" value={co?.cancellations ?? 0} prev={co?.cancellationsPrev ?? null} format="num" color="text-red-600" loading={isLoading} invert prevValue={fmtNum(co?.cancellationsPrev ?? 0)} />
          </div>

          {!isLoading && co && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Funil de Conversão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Leads Totais", value: co.totalLeads, color: "#3B82F6" },
                  { label: "Negócios Abertos", value: co.openDeals, color: "#8B5CF6" },
                  { label: "Novas Reservas", value: co.newReservations, color: "#F59E0B" },
                  { label: "Confirmadas", value: co.wonDeals, color: "#10B981" },
                ].map((item) => {
                  const max = co.totalLeads || 1;
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-32 shrink-0">{item.label}</span>
                      <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                        <div className="h-5 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: item.color }}>
                          <span className="text-xs font-medium text-white">{item.value}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── MARKETING ─────────────────────────────────────────────── */}
        <TabsContent value="marketing" className="mt-5 space-y-4">
          <SectionHeader
            icon={Zap}
            title="Visão de Marketing"
            description="Geração de leads, captação e conversão de clientes"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Users} label="Novos Clientes" value={mk?.newClients ?? 0} prev={mk?.newClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(mk?.newClientsPrev ?? 0)} />
            <KpiCard icon={Target} label="Total de Leads" value={mk?.totalLeads ?? 0} prev={mk?.totalLeadsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(mk?.totalLeadsPrev ?? 0)} />
            <KpiCard icon={Zap} label="Taxa de Conversão" value={mk?.conversionRate ?? 0} prev={mk?.conversionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(mk?.conversionRatePrev ?? 0)} />
            <KpiCard icon={ArrowUpRight} label="Indicações / Comissões" value={mk?.referrals ?? 0} prev={mk?.referralsPrev ?? null} format="num" color="text-orange-600" loading={isLoading} prevValue={fmtNum(mk?.referralsPrev ?? 0)} />
          </div>

          {!isLoading && mk && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Captação de Clientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos clientes (período)</span>
                    <span className="font-semibold">{mk.newClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos clientes (anterior)</span>
                    <span className="font-semibold text-muted-foreground">{mk.newClientsPrev}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Leads gerados</span>
                    <span className="font-semibold">{mk.totalLeads}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Conversão leads → venda</span>
                    <span className="font-semibold text-primary">{fmtPct(mk.conversionRate)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Crescimento vs. Período Anterior</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {[
                    { label: "Clientes", curr: mk.newClients, prev: mk.newClientsPrev },
                    { label: "Leads", curr: mk.totalLeads, prev: mk.totalLeadsPrev },
                    { label: "Conversão", curr: mk.conversionRate, prev: mk.conversionRatePrev, isPct: true },
                  ].map((row) => {
                    const delta = row.prev > 0 ? ((row.curr - row.prev) / row.prev) * 100 : null;
                    return (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{row.isPct ? fmtPct(row.curr) : row.curr}</span>
                          {delta !== null && (
                            <Badge variant="secondary" className={delta >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}>
                              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── FINANCEIRA ────────────────────────────────────────────── */}
        <TabsContent value="financeira" className="mt-5 space-y-4">
          <SectionHeader
            icon={DollarSign}
            title="Visão Financeira"
            description="Receita, despesas, margem e fluxo de caixa"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={DollarSign} label="Receita Total" value={fi?.totalRevenue ?? 0} prev={fi?.totalRevenuePrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(fi?.totalRevenuePrev ?? 0)} />
            <KpiCard icon={TrendingDown} label="Despesas Totais" value={fi?.totalExpenses ?? 0} prev={fi?.totalExpensesPrev ?? null} format="compact" color="text-red-600" loading={isLoading} invert prevValue={fmtCompact(fi?.totalExpensesPrev ?? 0)} />
            <KpiCard icon={TrendingUp} label="Lucro Líquido" value={fi?.netProfit ?? 0} prev={fi?.netProfitPrev ?? null} format="compact" color={(fi?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"} loading={isLoading} prevValue={fmtCompact(fi?.netProfitPrev ?? 0)} />
            <KpiCard icon={Target} label="Margem de Lucro" value={fi?.profitMargin ?? 0} prev={fi?.profitMarginPrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(fi?.profitMarginPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={fi?.avgTicket ?? 0} prev={fi?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(fi?.avgTicketPrev ?? 0)} />
            <KpiCard icon={ArrowUpRight} label="A Receber" value={fi?.receivable ?? 0} format="compact" color="text-blue-600" loading={isLoading} />
            <KpiCard icon={ArrowDownRight} label="A Pagar" value={fi?.payable ?? 0} format="compact" color="text-orange-600" loading={isLoading} />
            <KpiCard icon={TrendingDown} label="Vencido (A Receber)" value={fi?.overdue ?? 0} format="compact" color="text-red-500" loading={isLoading} invert />
          </div>

          {!isLoading && fi && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Demonstrativo de Resultado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Receita Bruta</span>
                  <span className="font-semibold text-green-600">{fmt(fi.totalRevenue)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">(-) Despesas</span>
                  <span className="font-semibold text-red-600">- {fmt(fi.totalExpenses)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm font-medium">Lucro Líquido</span>
                  <span className={`font-bold text-base ${fi.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fi.netProfit >= 0 ? "+" : ""}{fmt(fi.netProfit)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Margem de Lucro</span>
                  <span className={`font-semibold ${fi.profitMargin >= 20 ? "text-emerald-600" : fi.profitMargin >= 10 ? "text-yellow-600" : "text-red-600"}`}>
                    {fmtPct(fi.profitMargin)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── OPERACIONAL ───────────────────────────────────────────── */}
        <TabsContent value="operacional" className="mt-5 space-y-4">
          <SectionHeader
            icon={Map}
            title="Visão Operacional"
            description="Viagens, ocupação, passageiros e fornecedores"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Map} label="Viagens Ativas" value={op?.activeTrips ?? 0} format="num" color="text-blue-600" loading={isLoading} />
            <KpiCard icon={Map} label="Novas Viagens" value={op?.newTrips ?? 0} prev={op?.newTripsPrev ?? null} format="num" color="text-indigo-600" loading={isLoading} prevValue={fmtNum(op?.newTripsPrev ?? 0)} />
            <KpiCard icon={BarChart2} label="Ocupação Média" value={op?.occupancyRate ?? 0} format="pct" color="text-cyan-600" loading={isLoading} />
            <KpiCard icon={ShoppingCart} label="Reservas Confirmadas" value={op?.confirmedReservations ?? 0} prev={op?.confirmedReservationsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(op?.confirmedReservationsPrev ?? 0)} />
            <KpiCard icon={TrendingDown} label="Cancelamentos" value={op?.cancellations ?? 0} prev={op?.cancellationsPrev ?? null} format="num" color="text-red-600" loading={isLoading} invert prevValue={fmtNum(op?.cancellationsPrev ?? 0)} />
            <KpiCard icon={Target} label="Reservas / Viagem" value={op?.avgReservationsPerTrip ?? 0} prev={op?.avgReservationsPerTripPrev ?? null} format="num" color="text-orange-600" loading={isLoading} prevValue={fmtNum(op?.avgReservationsPerTripPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Receita / Viagem" value={op?.revenuePerTrip ?? 0} prev={op?.revenuePerTripPrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(op?.revenuePerTripPrev ?? 0)} />
            <KpiCard icon={Package} label="Fornecedores" value={op?.totalSuppliers ?? 0} format="num" color="text-purple-600" loading={isLoading} sub={`+${op?.newSuppliers ?? 0} este período`} />
          </div>
        </TabsContent>

        {/* ─── RETENÇÃO ──────────────────────────────────────────────── */}
        <TabsContent value="retencao" className="mt-5 space-y-4">
          <SectionHeader
            icon={Heart}
            title="Retenção & Comunidade"
            description="Fidelidade, NPS e engajamento da base de clientes"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Star} label="Membros de Fidelidade" value={re?.loyaltyMembers ?? 0} format="num" color="text-yellow-600" loading={isLoading} sub={`+${re?.loyaltyNewMembers ?? 0} este período`} />
            <KpiCard icon={Users} label="Clientes que Voltaram" value={re?.repeatClients ?? 0} prev={re?.repeatClientsPrev ?? null} format="num" color="text-teal-600" loading={isLoading} prevValue={fmtNum(re?.repeatClientsPrev ?? 0)} />
            <KpiCard icon={Target} label="Taxa de Retenção" value={re?.retentionRate ?? 0} prev={re?.retentionRatePrev ?? null} format="pct" color="text-indigo-600" loading={isLoading} prevValue={fmtPct(re?.retentionRatePrev ?? 0)} />
            <KpiCard icon={Users} label="Novos Clientes" value={re?.newClients ?? 0} prev={re?.newClientsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(re?.newClientsPrev ?? 0)} />
          </div>

          {re?.averageNps != null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-4 h-4" /> NPS — Net Promoter Score
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div>
                  <p className="text-5xl font-bold">{Number(re.averageNps).toFixed(0)}</p>
                  <p className={`text-sm font-medium mt-1 ${Number(re.averageNps) >= 70 ? "text-green-600" : Number(re.averageNps) >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                    {Number(re.averageNps) >= 70 ? "Excelente" : Number(re.averageNps) >= 50 ? "Bom" : "A melhorar"}
                  </p>
                  {re.averageNpsPrev != null && (
                    <p className="text-xs text-muted-foreground mt-1">Anterior: {Number(re.averageNpsPrev).toFixed(0)} pontos</p>
                  )}
                </div>
                <div className="flex-1">
                  <div className="w-full bg-muted rounded-full h-3">
                    <div className={`h-3 rounded-full ${Number(re.averageNps) >= 70 ? "bg-green-500" : Number(re.averageNps) >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(Number(re.averageNps), 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Escala de 0 a 100 pontos</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!isLoading && re && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Base de Clientes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de clientes</span>
                    <span className="font-semibold">{re.totalClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos no período</span>
                    <span className="font-semibold text-green-600">+{re.newClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Clientes recorrentes</span>
                    <span className="font-semibold text-blue-600">{re.repeatClients}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Taxa de retenção</span>
                    <span className="font-semibold text-indigo-600">{fmtPct(re.retentionRate)}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Programa de Fidelidade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de membros</span>
                    <span className="font-semibold">{re.loyaltyMembers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos membros (período)</span>
                    <span className="font-semibold text-green-600">+{re.loyaltyNewMembers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Novos membros (anterior)</span>
                    <span className="font-semibold text-muted-foreground">+{re.loyaltyNewMembersPrev}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ─── EXPANSÃO ──────────────────────────────────────────────── */}
        <TabsContent value="expansao" className="mt-5 space-y-4">
          <SectionHeader
            icon={Globe}
            title="Expansão & Inovação"
            description="Crescimento de portfólio, novos destinos e parceiros"
          />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <KpiCard icon={Map} label="Novas Viagens" value={ex2?.newTrips ?? 0} prev={ex2?.newTripsPrev ?? null} format="num" color="text-blue-600" loading={isLoading} prevValue={fmtNum(ex2?.newTripsPrev ?? 0)} />
            <KpiCard icon={Package} label="Novos Fornecedores" value={ex2?.newSuppliers ?? 0} prev={ex2?.newSuppliersPrev ?? null} format="num" color="text-indigo-600" loading={isLoading} prevValue={fmtNum(ex2?.newSuppliersPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Receita / Viagem" value={ex2?.revenuePerTrip ?? 0} prev={ex2?.revenuePerTripPrev ?? null} format="compact" color="text-green-600" loading={isLoading} prevValue={fmtCompact(ex2?.revenuePerTripPrev ?? 0)} />
            <KpiCard icon={DollarSign} label="Ticket Médio" value={ex2?.avgTicket ?? 0} prev={ex2?.avgTicketPrev ?? null} format="compact" color="text-purple-600" loading={isLoading} prevValue={fmtCompact(ex2?.avgTicketPrev ?? 0)} />
          </div>

          {!isLoading && ex2 && (
            <div className="grid gap-4 md:grid-cols-2">
              {ex2.topDestinations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="w-4 h-4" /> Top Destinos no Período
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ex2.topDestinations.map((d: { name: string; count: number }, i: number) => {
                      const max = ex2.topDestinations[0]?.count ?? 1;
                      return (
                        <div key={d.name} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{i + 1}</span>
                          <span className="text-sm text-muted-foreground w-32 truncate shrink-0">{d.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold w-8 text-right">{d.count}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Crescimento de Portfólio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Receita Total</span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{fmtCompact(ex2.totalRevenue)}</span>
                      {ex2.totalRevenuePrev > 0 && (
                        <Badge variant="secondary" className={(ex2.totalRevenue >= ex2.totalRevenuePrev) ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}>
                          {ex2.totalRevenue >= ex2.totalRevenuePrev ? "+" : ""}{pctChange(ex2.totalRevenue, ex2.totalRevenuePrev)?.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total de Fornecedores</span>
                    <span className="font-semibold">{ex2.totalSuppliers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Novos fornecedores</span>
                    <span className="font-semibold text-green-600">+{ex2.newSuppliers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Novas viagens</span>
                    <span className="font-semibold text-blue-600">+{ex2.newTrips}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
