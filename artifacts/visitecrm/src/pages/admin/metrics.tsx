import { useAdminGrowthMetrics, useAdminMrrMetrics, useAdminChurnMetrics } from "@/hooks/use-admin";
import { useGetAdminStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Building2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatBRL(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminMetricsPage() {
  const { data: stats } = useGetAdminStats();
  const { data: growth = [], isLoading: growthLoading, isError: growthError } = useAdminGrowthMetrics();
  const { data: mrr = [], isLoading: mrrLoading, isError: mrrError } = useAdminMrrMetrics();
  const { data: churn = [], isLoading: churnLoading, isError: churnError } = useAdminChurnMetrics();
  const anyError = growthError || mrrError || churnError;

  const currentMrr = mrr[mrr.length - 1]?.mrr ?? 0;
  const previousMrr = mrr[mrr.length - 2]?.mrr ?? 0;
  const mrrGrowth = previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr) * 100 : 0;

  const currentChurn = churn[churn.length - 1]?.churnRate ?? 0;
  const currentActive = growth[growth.length - 1]?.active ?? 0;
  const lastMonthActive = growth[growth.length - 2]?.active ?? 0;
  const activeGrowth = lastMonthActive > 0 ? ((currentActive - lastMonthActive) / lastMonthActive) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas do SaaS</h1>
        <p className="text-sm text-muted-foreground mt-1">Análise de crescimento, receita e churn dos últimos 12 meses</p>
      </div>

      {anyError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Erro ao carregar algumas métricas. Verifique suas permissões ou</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-destructive" onClick={() => window.location.reload()}>
            <RefreshCw className="w-3 h-3 mr-1" />
            tente novamente
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">MRR Atual</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{formatBRL(currentMrr)}</div>
            <p className={`text-xs mt-1 ${mrrGrowth >= 0 ? "text-green-600" : "text-destructive"}`}>
              {mrrGrowth >= 0 ? "+" : ""}{mrrGrowth.toFixed(1)}% vs mês anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Agências Ativas</CardTitle>
            <Building2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats?.byStatus?.active ?? currentActive}</div>
            <p className={`text-xs mt-1 ${activeGrowth >= 0 ? "text-green-600" : "text-destructive"}`}>
              {activeGrowth >= 0 ? "+" : ""}{activeGrowth.toFixed(1)}% vs mês anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Taxa de Churn</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{currentChurn.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Este mês</p>
          </CardContent>
        </Card>
      </div>

      {/* MRR Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MRR — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          {mrrLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={mrr} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} labelFormatter={l => `Mês: ${l}`} />
                <Line type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="MRR" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Growth Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Crescimento de Agências — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          {growthLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={growth} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="new_tenants" name="Novas agências" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="active" name="Ativas acum." fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Churn Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Churn Rate — Últimos 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          {churnLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={churn} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} labelFormatter={l => `Mês: ${l}`} />
                <Line type="monotone" dataKey="churnRate" stroke="#ef4444" strokeWidth={2} dot={false} name="Churn %" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
