import { useState } from "react";
import { useAdminUsers } from "@/hooks/use-admin";
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
import { Search, AlertCircle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  agencia: "Admin Agência",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  superadmin: "default",
  agencia: "secondary",
  vendedor: "outline",
  cliente: "outline",
};

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");

  const { data: users = [], isLoading, isError } = useAdminUsers({
    tenantId: tenantFilter !== "all" ? tenantFilter : undefined,
    role: roleFilter !== "all" ? roleFilter : undefined,
  });
  const { data: tenants = [] } = useListTenants();

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuários da Plataforma</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todos os usuários de todas as agências · {filtered.length} encontrados
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os perfis</SelectItem>
            <SelectItem value="superadmin">Super Admin</SelectItem>
            <SelectItem value="agencia">Admin Agência</SelectItem>
            <SelectItem value="vendedor">Vendedor</SelectItem>
            <SelectItem value="cliente">Cliente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tenantFilter} onValueChange={setTenantFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Agência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as agências</SelectItem>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || roleFilter !== "all" || tenantFilter !== "all") && (
          <Button variant="ghost" onClick={() => { setSearch(""); setRoleFilter("all"); setTenantFilter("all"); }}>
            Limpar
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Carregando...</div>
          ) : isError ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive opacity-60" />
              <p className="text-sm">Erro ao carregar usuários. Verifique suas permissões.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum usuário encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Agência</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Perfil</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Cadastro</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Último login</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{u.name}</td>
                      <td className="py-2 text-muted-foreground">{u.email}</td>
                      <td className="py-2 text-muted-foreground">{u.tenantName ?? "—"}</td>
                      <td className="py-2">
                        <Badge variant={ROLE_VARIANTS[u.role] ?? "outline"} className="text-xs">
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                          {u.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-2 text-muted-foreground">{fmt(u.createdAt)}</td>
                      <td className="py-2 text-muted-foreground">{fmt(u.lastLoginAt)}</td>
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
