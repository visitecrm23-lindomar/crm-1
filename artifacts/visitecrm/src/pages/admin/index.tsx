import { useGetAdminStats, useGetSystemHealth, getGetSystemHealthQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Building2, CheckCircle2, Clock, XCircle, TrendingUp } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativos",
  trial: "Em Trial",
  suspended: "Suspensos",
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  active: CheckCircle2,
  trial: Clock,
  suspended: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-600",
  trial: "text-amber-600",
  suspended: "text-red-600",
};

function formatMRR(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const REDIS_STATUS_CONFIG = {
  degraded: {
    label: "Redis degradado",
    description:
      "O Redis está recebendo erros transitórios consecutivos. Filas de e-mail, PDF e lembretes podem estar lentas ou paradas.",
    classes: "bg-amber-50 border-amber-300 text-amber-800",
    iconClasses: "text-amber-500",
  },
  unavailable: {
    label: "Redis indisponível",
    description:
      "O limite diário de requisições do Redis (Upstash free tier) foi atingido ou o serviço está inacessível. E-mails, PDFs e lembretes automáticos estão parados até a conexão ser restabelecida.",
    classes: "bg-red-50 border-red-300 text-red-800",
    iconClasses: "text-red-500",
  },
};

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const { data: systemHealth } = useGetSystemHealth({
    query: { queryKey: getGetSystemHealthQueryKey(), refetchInterval: 60_000 },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Carregando métricas...</div>
      </div>
    );
  }

  const statusKeys = ["active", "trial", "suspended"];
  const planKeys = Object.keys(stats?.byPlan ?? {});
  const redisStatus = systemHealth?.redis?.status;
  const redisAlert = redisStatus && redisStatus !== "ok" ? REDIS_STATUS_CONFIG[redisStatus] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Visão Geral da Plataforma</h1>
        <p className="text-muted-foreground text-sm mt-1">Métricas globais de todos os tenants cadastrados</p>
      </div>

      {redisAlert && (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${redisAlert.classes}`}>
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${redisAlert.iconClasses}`} />
          <div>
            <p className="font-semibold text-sm">{redisAlert.label}</p>
            <p className="text-sm mt-0.5">{redisAlert.description}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Tenants</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalTenants ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR Estimado</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{formatMRR(stats?.mrr ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Apenas tenants ativos</p>
          </CardContent>
        </Card>

        {statusKeys.map((key) => {
          const Icon = STATUS_ICONS[key] ?? Building2;
          const count = stats?.byStatus?.[key] ?? 0;
          return (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {STATUS_LABELS[key] ?? key}
                </CardTitle>
                <Icon className={`w-4 h-4 ${STATUS_COLORS[key] ?? ""}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${STATUS_COLORS[key] ?? ""}`}>{count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por Plano</CardTitle>
        </CardHeader>
        <CardContent>
          {planKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum dado disponível</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {["starter", "pro", "enterprise"].map((plan) => {
                const count = stats?.byPlan?.[plan] ?? 0;
                const total = stats?.totalTenants ?? 1;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={plan} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{PLAN_LABELS[plan] ?? plan}</span>
                      <span className="text-muted-foreground">{count} tenants</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          plan === "enterprise"
                            ? "bg-indigo-500"
                            : plan === "pro"
                            ? "bg-blue-500"
                            : "bg-slate-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
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
