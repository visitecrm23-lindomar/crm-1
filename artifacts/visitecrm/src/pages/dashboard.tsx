import { useGetDashboardSummary, useGetDashboardRevenueChart, useGetDashboardUpcomingTrips, useListPayments, useListClients, useGetMe } from "@workspace/api-client-react";
import { Users, Map, DollarSign, TrendingUp, Star, Briefcase, CalendarCheck, AlertTriangle, ArrowUpRight, Plus, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function KpiCard({ title, value, sub, icon: Icon, loading, color = "text-primary" }: {
  title: string; value: string | number; sub?: string; icon: React.ElementType; loading: boolean; color?: string;
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
  const { data: chartData, isLoading: loadingChart } = useGetDashboardRevenueChart({ period: "12m" });
  const { data: upcomingTrips, isLoading: loadingTrips } = useGetDashboardUpcomingTrips();
  const { data: recentClients, isLoading: loadingClients } = useListClients({ limit: 10, page: 1 });
  const { data: pendingPayments, isLoading: loadingPayments } = useListPayments({ status: "pending", limit: 10 });

  const npsLabel = summary?.averageNps != null
    ? `${summary.averageNps.toFixed(1)} / 10`
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral da sua agência de turismo.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients">
            <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Cliente</Button>
          </Link>
          <Link href="/trips">
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Viagem</Button>
          </Link>
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
            <CardDescription>Últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChart ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
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
            <CardTitle>Próximas Viagens</CardTitle>
            <CardDescription>Partidas programadas</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTrips ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !upcomingTrips?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma viagem próxima.</p>
            ) : (
              <div className="space-y-3">
                {upcomingTrips.slice(0, 5).map((trip) => {
                  const days = differenceInDays(parseISO(trip.departureDate), new Date());
                  const occupancy = Math.round(((trip.totalCapacity - trip.availableSeats) / trip.totalCapacity) * 100);
                  return (
                    <div key={trip.id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors">
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
                <Link href="/trips">
                  <Button variant="ghost" size="sm" className="w-full mt-1">
                    Ver todas as viagens <ArrowUpRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
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
                {recentClients?.data.slice(0, 8).map((client) => (
                  <div key={client.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
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
              <p className="text-sm text-muted-foreground text-center py-8">Sem pagamentos pendentes.</p>
            ) : (
              <div className="space-y-2">
                {pendingPayments.data.slice(0, 8).map((p) => {
                  const overdue = new Date(p.dueDate) < new Date();
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {overdue ? (
                          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{p.description ?? p.category}</p>
                          <p className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                            Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
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
    </div>
  );
}

function SellerDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: chartData, isLoading: loadingChart } = useGetDashboardRevenueChart({ period: "12m" });
  const { data: myDeals, isLoading: loadingClients } = useListClients({ limit: 10, page: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Painel</h1>
        <p className="text-muted-foreground text-sm">Seus resultados de vendas.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Meus Clientes" value={summary?.totalClients ?? 0} sub="Total na sua carteira" icon={Users} loading={isLoading} />
        <KpiCard title="Minhas Vendas" value={formatCurrency(summary?.revenueThisMonth ?? 0)} sub="Receita este mês" icon={DollarSign} loading={isLoading} color="text-green-600" />
        <KpiCard title="Reservas do Mês" value={summary?.confirmedReservations ?? 0} sub="Confirmadas este mês" icon={CalendarCheck} loading={isLoading} color="text-blue-600" />
        <KpiCard title="Negócios Abertos" value={summary?.openDeals ?? 0} sub={`${formatCurrency(summary?.dealsPipelineValue ?? 0)} no pipeline`} icon={Briefcase} loading={isLoading} color="text-purple-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desempenho de Vendas</CardTitle>
          <CardDescription>Receita dos últimos 6 meses</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingChart ? <Skeleton className="h-[260px] w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" name="Receita" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meus Clientes Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingClients ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
            <div className="space-y-2">
              {myDeals?.data.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.whatsapp}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(client.totalSpent)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: upcomingTrips, isLoading: loadingTrips } = useGetDashboardUpcomingTrips();
  const { data: pendingPayments, isLoading: loadingPayments } = useListPayments({ status: "pending", limit: 5 });

  const nextTrip = upcomingTrips?.[0];
  const daysToTrip = nextTrip ? differenceInDays(parseISO(nextTrip.departureDate), new Date()) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Área</h1>
        <p className="text-muted-foreground text-sm">Suas viagens e informações.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Próxima Viagem" value={daysToTrip != null ? `${daysToTrip} dias` : "—"} sub={nextTrip?.name ?? "Sem viagem agendada"} icon={Map} loading={loadingTrips} color="text-blue-600" />
        <KpiCard title="Pontos de Fidelidade" value="—" sub="Acumule pontos viajando" icon={Star} loading={isLoading} color="text-yellow-500" />
        <KpiCard title="Viagens Realizadas" value={summary?.totalReservations ?? 0} sub="Total de reservas" icon={CalendarCheck} loading={isLoading} />
        <KpiCard title="Saldo de Indicação" value="R$ 0,00" sub="Indique amigos e ganhe" icon={TrendingUp} loading={isLoading} color="text-green-600" />
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
                  {daysToTrip != null && daysToTrip > 0 && (
                    <Badge className="ml-2" variant="outline">Faltam {daysToTrip} dias</Badge>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Ver Voucher</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pagamentos Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPayments ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !pendingPayments?.data.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento pendente.</p>
          ) : (
            <div className="space-y-2">
              {pendingPayments.data.map((p) => (
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
