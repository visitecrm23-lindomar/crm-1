import { useState } from "react";
import { useAdminAuditLogs } from "@/hooks/use-admin";
import { useListTenants } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Download } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800",
  update: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  login: "bg-purple-100 text-purple-800",
  suspend: "bg-orange-100 text-orange-800",
  activate: "bg-emerald-100 text-emerald-800",
};

const ENTITY_LABELS: Record<string, string> = {
  client: "Cliente",
  trip: "Viagem",
  reservation: "Reserva",
  user: "Usuário",
  tenant: "Agência",
  payment: "Pagamento",
};

function fmtDate(date: string) {
  return new Date(date).toLocaleString("pt-BR");
}

export default function AdminLogsPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");

  const { data: logs = [], isLoading } = useAdminAuditLogs({
    tenantId: tenantFilter || undefined,
    entityType: entityFilter || undefined,
    action: actionFilter || undefined,
  });
  const { data: tenants = [] } = useListTenants();

  const filtered = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.entityId.toLowerCase().includes(s) ||
      (l.userName ?? "").toLowerCase().includes(s) ||
      (l.tenantName ?? "").toLowerCase().includes(s)
    );
  });

  function handleExport() {
    const headers = ["Data", "Ação", "Entidade", "ID Entidade", "Usuário", "Agência"];
    const rows = filtered.map(l => [
      fmtDate(l.createdAt),
      l.action,
      l.entityType,
      l.entityId,
      l.userName ?? "",
      l.tenantName ?? l.tenantId,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logs de Auditoria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico global de ações na plataforma · {filtered.length} registros
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por usuário, entidade ou ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas</SelectItem>
            <SelectItem value="create">Criar</SelectItem>
            <SelectItem value="update">Atualizar</SelectItem>
            <SelectItem value="delete">Excluir</SelectItem>
            <SelectItem value="login">Login</SelectItem>
            <SelectItem value="suspend">Suspender</SelectItem>
            <SelectItem value="activate">Ativar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Entidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas</SelectItem>
            <SelectItem value="client">Cliente</SelectItem>
            <SelectItem value="trip">Viagem</SelectItem>
            <SelectItem value="reservation">Reserva</SelectItem>
            <SelectItem value="user">Usuário</SelectItem>
            <SelectItem value="tenant">Agência</SelectItem>
            <SelectItem value="payment">Pagamento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tenantFilter} onValueChange={setTenantFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas</SelectItem>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || actionFilter || entityFilter || tenantFilter) && (
          <Button variant="ghost" onClick={() => { setSearch(""); setActionFilter(""); setEntityFilter(""); setTenantFilter(""); }}>
            Limpar
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum log encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Data</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Ação</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Entidade</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">ID</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Usuário</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Agência</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(log => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
                      <td className="py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-xs">
                          {ENTITY_LABELS[log.entityType] ?? log.entityType}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground truncate max-w-[120px]">{log.entityId}</td>
                      <td className="py-2 text-muted-foreground">{log.userName ?? "—"}</td>
                      <td className="py-2 text-muted-foreground">{log.tenantName ?? log.tenantId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
