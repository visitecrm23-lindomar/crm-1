import { useGetMe, useListUsers } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Shield, Users } from "lucide-react";

const roleLabels: Record<string, string> = {
  superadmin: "Super Admin",
  agencia: "Agência",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

const roleColors: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-800",
  agencia: "bg-blue-100 text-blue-800",
  vendedor: "bg-green-100 text-green-800",
  cliente: "bg-gray-100 text-gray-800",
};

export default function Settings() {
  const { user: clerkUser } = useUser();
  const { data: me, isLoading: loadingMe } = useGetMe();
  const { data: users, isLoading: loadingUsers } = useListUsers();

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie sua conta e usuários da agência.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Perfil do Usuário
            </CardTitle>
            <CardDescription>Suas informações de conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingMe ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center">
                    {clerkUser?.imageUrl ? (
                      <img src={clerkUser.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-7 h-7 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-lg">{me?.name}</p>
                    <p className="text-sm text-muted-foreground">{me?.email}</p>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Função</span>
                    <Badge className={roleColors[me?.role ?? "agencia"] ?? ""}>{roleLabels[me?.role ?? "agencia"] ?? me?.role}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={me?.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {me?.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Código de indicação</span>
                    <span className="font-mono font-medium">{me?.referralCode}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo de bônus</span>
                    <span className="font-medium text-green-600">
                      R$ {(me?.referralBalance ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Sobre o VisiteCRM
            </CardTitle>
            <CardDescription>Informações sobre o sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium capitalize">{me?.tenantId ? "Starter" : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Suporte</span>
              <span className="font-medium">suporte@visitecrm.com.br</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Usuários da Agência
              </CardTitle>
              <CardDescription>Equipe com acesso ao sistema.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsers ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !users || users.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum usuário.</TableCell></TableRow>
                ) : users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge className={roleColors[u.role] ?? ""}>{roleLabels[u.role] ?? u.role}</Badge></TableCell>
                    <TableCell>
                      <Badge className={u.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {u.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
