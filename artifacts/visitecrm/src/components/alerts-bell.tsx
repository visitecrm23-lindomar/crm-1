import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, AlertTriangle, Info, XCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Alert {
  id: string;
  type: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  actionHref: string;
  count: number;
}

interface AlertsResponse {
  alerts: Alert[];
  count: number;
}

async function fetchAlerts(): Promise<AlertsResponse> {
  const res = await fetch("/api/alerts", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

const TYPE_CONFIG = {
  critical: {
    Icon: XCircle,
    className: "text-destructive",
    badgeClass: "bg-destructive text-destructive-foreground",
    labelClass: "text-destructive",
  },
  warning: {
    Icon: AlertTriangle,
    className: "text-amber-500",
    badgeClass: "bg-amber-500 text-white",
    labelClass: "text-amber-600",
  },
  info: {
    Icon: Info,
    className: "text-blue-500",
    badgeClass: "bg-blue-500 text-white",
    labelClass: "text-blue-600",
  },
};

export function AlertsBell({ userRole }: { userRole?: string }) {
  const canSeeAlerts = userRole === "agencia" || userRole === "superadmin" || userRole === "vendedor";

  const { data } = useQuery<AlertsResponse>({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 5 * 60 * 1000,
    enabled: canSeeAlerts,
    staleTime: 60_000,
  });

  const alerts = data?.alerts ?? [];
  const count = data?.count ?? 0;

  const criticalCount = alerts.filter(a => a.type === "critical").length;
  const badgeCount = count;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Alertas Inteligentes">
          <Bell className="w-4 h-4" />
          {badgeCount > 0 && (
            <span
              className={`absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center leading-none ${
                criticalCount > 0
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-amber-500 text-white"
              }`}
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h4 className="text-sm font-semibold">Alertas Inteligentes</h4>
          {badgeCount > 0 && (
            <Badge
              className={`text-[10px] h-4 px-1.5 ${criticalCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}
            >
              {badgeCount}
            </Badge>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto divide-y">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <CheckCircle className="w-8 h-8 opacity-30 text-green-500" />
              <p className="text-sm font-medium">Nenhum alerta no momento ✓</p>
              <p className="text-xs opacity-70">Tudo em ordem por aqui!</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const cfg = TYPE_CONFIG[alert.type];
              const Icon = cfg.Icon;
              return (
                <Link key={alert.id} href={alert.actionHref}>
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.className}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{alert.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{alert.category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">{alert.description}</p>
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${cfg.labelClass}`}>Ver →</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {alerts.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/30">
            <p className="text-[11px] text-muted-foreground text-center">
              Atualizado automaticamente a cada 5 minutos
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
