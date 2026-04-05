import { useMemo, type ElementType } from "react";
import {
  useGetDashboardSummary, useGetDashboardRevenueChart, useGetDashboardUpcomingTrips,
  useListPayments, useListClients, useGetMe, useListPipelineStages, useListDeals, useListReservations,
} from "@workspace/api-client-react";
import { Users, Map, DollarSign, Star, Briefcase, CalendarCheck, AlertTriangle, ArrowUpRight, Plus, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const DONUT_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#6B7280"];

function KpiCard({ title, value, sub, icon: Icon, loading, color = "text-primary" }: {
  title: string; value: string | number; sub?: string; icon: ElementType; loading: boolean; color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <><Skeleton className="h-8 w-24 mb-1" /><Skeleton className="h-4 w-36" /></>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgencyDashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: rawChartData, isLoading: loadingChart } = useGetDashboardRevenueChart({ period: "12m" });
  const chartData = rawChartData?.slice(-6);
  const { data: upcomingTrips, isLoading: loadingTrips } = useGetDashboardUpcomingTrips();
  const { data: allClientsOrigin } = useListClients({ limit: 200, page: 1, sortBy: "createdAt", sortOrder: "desc" });
  const { data: recentClients, isLoading: loadingClients } = useListClients({ limit: 10, page: 1, sortBy: "createdAt", sortOrder: "desc" });
  const { data: pendingPayments, isLoading: loadingPayments } = useListPayments({ status: "pending", limit: 10 });
  const { data: stages, isLoading: loadingStages } = useListPipelineStages();
  const { data: deals, isLoading: loadingDeals } = useListDeals({ status: "open" });

  const npsLabel = summary?.averageNps != null ? `${summary.averageNps.toFixed(1)} / 10` : "—";

  const clientOriginData = useMemo(() => {
    const all = allClientsOrigin?.data ?? [];
    const groups: Record<string, number> = {};
    all.forEach(c => {
      const origin = c.origin ?? c.addressState ?? "Outros";
      groups[origin] = (groups[origin] ?? 0) + 1;
    });
    return Object.entries(groups).map(([name, value]) => ({ name, value })).slice(0, 6);
  }, [allClientsOrigin]);

  const miniPipelineStages = useMemo(() => {
    if (!stages || !deals) return [];
    return stages.slice(0, 3).map(s => ({
      ...s,
      stageDeals: (deals ?? []).filter(d => d.stageId === s.id),
    }));
  }, [stages, deals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral da sua agência de turismo.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients"><Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Cliente</Button></Link>
          <Link href="/trips"><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Viagem</Button></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total de Clientes" value={summary?.totalClients ?? 0} sub={`+${summary?.newClientsThisMonth ?? 0} este mês`} icon={Users} loading={loadingSummary} />
        <KpiCard title="Receita Total" value={formatCurrency(summary?.totalRevenue ?? 0)} sub={`${formatCurrency(summary?.revenueThisMonth ?? 0)} este mês`} icon={DollarSign} loading={loadingSummary} color="text-green-600" />
        <KpiCard title="Viagens Ativas" value={summary?.activeTrips ?? 0} sub={`De ${summary?.totalTrips ?? 0} no total`} icon={Map} loading={loadingSummary} color="text-blue-600" />
        <KpiCard title="NPS Médio" value={npsLabel} sub={`${summary?.confirmedReservations ?? 0} reservas confirmadas`} icon={Star} loading={loadingSummary} color="text-yellow-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Receita vs Despesas</CardTitle>
            <CardDescription>Últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChart ? <Skeleton className="h-[260px] w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Receita" stroke="#3B82F6" fill="url(#revenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" name="Despesas" stroke="#EF4444" fill="url(#expenses)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Origem dos Clientes</CardTitle>
            <CardDescription>Por estado</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingClients ? <Skeleton className="h-[200px] w-full" /> : clientOriginData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de origem.</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={clientOriginData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {clientOriginData.map((_, index) => (
                        <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {clientOriginData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-xs truncate flex-1">{item.name}</span>
                      <span className="text-xs font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pipeline — Visão Rápida</CardTitle>
            <Link href="/pipeline"><Button variant="ghost" size="sm">Ver completo <ArrowUpRight className="w-3 h-3 ml-1" /></Button></Link>
          </div>
        </CardHeader>
        <CardContent>
          {(loadingStages || loadingDeals) ? <Skeleton className="h-24 w-full" /> : (
            <div className="grid grid-cols-3 gap-4">
              {miniPipelineStages.map(s => (
                <div key={s.id} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">{s.stageDeals.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatCurrency(s.stageDeals.reduce((a, d) => a + d.value, 0))}</p>
                  <div className="mt-2 space-y-1">
                    {s.stageDeals.slice(0, 2).map(d => (
                      <div key={d.id} className="text-xs truncate text-muted-foreground bg-card rounded px-2 py-1 border">{d.title}</div>
                    ))}
                    {s.stageDeals.length > 2 && <p className="text-xs text-muted-foreground pl-1">+{s.stageDeals.length - 2} mais</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Próximas Viagens</CardTitle>
              <Link href="/trips"><Button variant="ghost" size="sm">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTrips ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !upcomingTrips?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma viagem próxima.</p>
            ) : (
              <div className="space-y-3">
                {upcomingTrips.slice(0, 5).map(trip => {
                  const days = differenceInDays(parseISO(trip.departureDate), new Date());
                  const occupancy = Math.round(((trip.totalCapacity - trip.availableSeats) / trip.totalCapacity) * 100);
                  return (
                    <div key={trip.id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{trip.name}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(trip.departureDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant={days <= 7 ? "destructive" : days <= 30 ? "default" : "secondary"} className="text-xs">
                          {days <= 0 ? "Hoje" : `${days}d`}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{occupancy}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Clientes Recentes</CardTitle>
              <Link href="/clients"><Button variant="ghost" size="sm">Ver todos</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingClients ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {recentClients?.data.slice(0, 10).map(client => (
                  <div key={client.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.addressCity ?? client.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">{client.classification}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pagamentos Pendentes</CardTitle>
            <Link href="/financial"><Button variant="ghost" size="sm">Ver todos</Button></Link>
          </div>
        </CardHeader>
        <CardContent>
          {loadingPayments ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !pendingPayments?.data.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem pagamentos pendentes.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {pendingPayments.data.slice(0, 10).map(p => {
                const overdue = new Date(p.dueDate) < new Date();
                return (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      {overdue ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" /> : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{p.description ?? p.category}</p>
                        <p className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm">{formatCurrency(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SellerDashboard() {
  const { data: me } = useGetMe();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: rawChartData, isLoading: loadingChart } = useGetDashboardRevenueChart({ period: "12m" });
  const chartData = rawChartData?.slice(-6);
  const { data: myLeads, isLoading: loadingLeads } = useListClients({
    limit: 8, page: 1, classification: "lead", sortBy: "createdAt", sortOrder: "desc",
    sellerId: me?.id ?? undefined,
  });
  const { data: myReservations, isLoading: loadingReservations } = useListReservations({
    limit: 8, status: "confirmed",
  });
  const { data: stages } = useListPipelineStages();
  const { data: deals } = useListDeals({ status: "open", ownerId: me?.id ?? undefined });
  const { data: pendingPayments, isLoading: loadingPayments } = useListPayments({ status: "pending", limit: 8 });

  const monthGoal = 50000;
  const monthRevenue = summary?.revenueThisMonth ?? 0;
  const goalPercent = Math.min(100, Math.round((monthRevenue / monthGoal) * 100));

  const funnelData = useMemo(() => {
    if (!stages || !deals) return [];
    return stages.map(s => ({
      name: s.name,
      value: (deals ?? []).filter(d => d.stageId === s.id).length,
      fill: s.color,
    })).filter(s => s.value > 0);
  }, [stages, deals]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Painel</h1>
        <p className="text-muted-foreground text-sm">Seus resultados de vendas.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Meus Clientes" value={summary?.totalClients ?? 0} sub="Total na carteira" icon={Users} loading={isLoading} />
        <KpiCard title="Vendas do Mês" value={formatCurrency(monthRevenue)} sub={`Meta: ${formatCurrency(monthGoal)}`} icon={DollarSign} loading={isLoading} color="text-green-600" />
        <KpiCard title="Reservas do Mês" value={summary?.confirmedReservations ?? 0} sub="Confirmadas este mês" icon={CalendarCheck} loading={isLoading} color="text-blue-600" />
        <KpiCard title="Comissões Pendentes" value={formatCurrency(pendingPayments?.data.reduce((a, p) => a + p.amount, 0) ?? 0)} sub={`${pendingPayments?.data.length ?? 0} em aberto`} icon={Briefcase} loading={isLoading} color="text-purple-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Meta vs Realizado</CardTitle>
            <span className="text-sm font-semibold text-primary">{goalPercent}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-3 mb-1">
            <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${goalPercent}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Realizado: <span className="font-semibold text-foreground">{formatCurrency(monthRevenue)}</span></span>
            <span>Meta: <span className="font-semibold text-foreground">{formatCurrency(monthGoal)}</span></span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Desempenho de Vendas</CardTitle>
            <CardDescription>Receita dos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChart ? <Skeleton className="h-[260px] w-full" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="revenue" name="Receita" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Meu Funil</CardTitle>
            <CardDescription>Negócios por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            {funnelData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem negócios no funil.</p>
            ) : (
              <div className="space-y-2">
                {funnelData.map(stage => (
                  <div key={stage.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.fill }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{stage.name}</span>
                        <span className="font-semibold">{stage.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, (stage.value / Math.max(1, funnelData[0]?.value ?? 1)) * 100)}%`, backgroundColor: stage.fill }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Minhas Leads</CardTitle>
              <Link href="/clients?classification=lead"><Button variant="ghost" size="sm">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLeads ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              : !myLeads?.data.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma lead ativa.</p>
              ) : (
                <div className="space-y-2">
                  {myLeads.data.map(client => (
                    <div key={client.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.pipelineStage ?? "Lead"}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">Lead</Badge>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Minhas Reservas</CardTitle>
              <Link href="/reservations"><Button variant="ghost" size="sm">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingReservations ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
              <div className="space-y-2">
                {!myReservations?.data.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma reserva confirmada.</p>
                ) : myReservations.data.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                        {r.client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{r.client.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{r.trip.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(r.totalValue)}</p>
                      <Badge variant={r.status === "confirmed" ? "default" : "secondary"} className="text-xs">{r.status === "confirmed" ? "Confirmada" : r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Minhas Comissões Pendentes</CardTitle>
              <Link href="/financial"><Button variant="ghost" size="sm">Ver todas</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPayments ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> :
              !pendingPayments?.data.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento pendente.</p>
              ) : (
                <div className="space-y-2">
                  {pendingPayments.data.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{p.description ?? p.category}</p>
                        <p className="text-xs text-muted-foreground">Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tarefas do Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">Módulo de tarefas disponível em breve.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClientDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: upcomingTrips, isLoading: loadingTrips } = useGetDashboardUpcomingTrips();
  const { data: pendingPayments, isLoading: loadingPayments } = useListPayments({ status: "pending", limit: 5 });
  const { data: me } = useGetMe();

  const nextTrip = upcomingTrips?.[0];
  const daysToTrip = nextTrip ? differenceInDays(parseISO(nextTrip.departureDate), new Date()) : null;

  const referralLink = `https://visitecrm.com.br/ref/${me?.referralCode ?? "—"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Área</h1>
        <p className="text-muted-foreground text-sm">Suas viagens e informações pessoais.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Próxima Viagem" value={daysToTrip != null ? `${daysToTrip} dias` : "—"} sub={nextTrip?.name ?? "Sem viagem agendada"} icon={Map} loading={loadingTrips} color="text-blue-600" />
        <KpiCard title="Pontos de Fidelidade" value="0 pts" sub="Acumule pontos viajando" icon={Star} loading={isLoading} color="text-yellow-500" />
        <KpiCard title="Viagens Realizadas" value={summary?.totalReservations ?? 0} sub="Total de reservas" icon={CalendarCheck} loading={isLoading} />
        <KpiCard title="Saldo de Indicação" value={formatCurrency(me?.referralBalance ?? 0)} sub="Indique amigos e ganhe" icon={DollarSign} loading={isLoading} color="text-green-600" />
      </div>

      {nextTrip && (
        <Card>
          <CardHeader>
            <CardTitle>Sua Próxima Viagem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{nextTrip.name}</h3>
                <p className="text-muted-foreground">{nextTrip.destination}</p>
                <p className="text-sm mt-1">
                  <span className="font-medium">{format(parseISO(nextTrip.departureDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                  {daysToTrip != null && daysToTrip > 0 && <Badge className="ml-2" variant="outline">Faltam {daysToTrip} dias</Badge>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Ver Voucher</Button>
                <Button variant="outline" size="sm">Baixar PDF</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pagamentos Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPayments ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              : !pendingPayments?.data.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento pendente.</p>
              ) : (
                <div className="space-y-2">
                  {pendingPayments.data.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg border">
                      <div>
                        <p className="text-sm font-medium">{p.description ?? p.category}</p>
                        <p className="text-xs text-muted-foreground">Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <span className="font-semibold">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Indicar Amigos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Indique amigos e ganhe bônus em sua próxima viagem!</p>
            <div className="flex gap-2">
              <Input readOnly value={referralLink} className="text-xs bg-muted/50" />
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(referralLink)}>Copiar</Button>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-100">
              <DollarSign className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700">Saldo disponível</p>
                <p className="text-xs text-green-600">{formatCurrency(me?.referralBalance ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Minhas Avaliações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação enviada ainda.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { data: me } = useGetMe();
  const role = me?.role;

  if (role === "cliente") return <ClientDashboard />;
  if (role === "vendedor") return <SellerDashboard />;
  return <AgencyDashboard />;
}
