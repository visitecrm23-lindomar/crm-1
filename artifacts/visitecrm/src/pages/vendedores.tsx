import { useState } from "react";
import {
  useListUsers,
  useListCommissions,
  useListReservations,
} from "@workspace/api-client-react";
import type { UserProfile, Commission } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, DollarSign, TrendingUp, Award, ChevronRight } from "lucide-react";

function fmtCurrency(v: number | string | null | undefined) {
  if (v == null) return "R$ 0,00";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SellerStats {
  user: UserProfile;
  salesCount: number;
  revenue: number;
  commission: number;
  conversionRate: number;
}

export default function Vendedores() {
  const { data: users = [] } = useListUsers();
  const { data: allCommissions = [] } = useListCommissions();
  const { data: reservationsData } = useListReservations({ limit: 500 });
  const reservations = reservationsData?.data ?? [];

  const [selectedSeller, setSelectedSeller] = useState<SellerStats | null>(null);

  const sellers = users.filter(
    (u) => u.role === "vendedor" || u.role === "agencia" || u.role === "superadmin"
  );

  const stats: SellerStats[] = sellers.map((user) => {
    const userCommissions: Commission[] = allCommissions.filter(
      (c) => c.userId === user.id
    );
    const commission = userCommissions.reduce(
      (sum, c) => sum + parseFloat(c.commissionAmount ?? "0"),
      0
    );
    const revenue = userCommissions.reduce(
      (sum, c) => sum + parseFloat(c.baseAmount ?? "0"),
      0
    );
    const salesCount = userCommissions.length;
    const conversionRate = salesCount > 0 ? Math.min(100, salesCount * 12) : 0;
    return { user, salesCount, revenue, commission, conversionRate };
  });

  const totalSellers = stats.length;
  const totalSales = stats.reduce((s, x) => s + x.salesCount, 0);
  const totalCommission = stats.reduce((s, x) => s + x.commission, 0);
  const totalRevenue = stats.reduce((s, x) => s + x.revenue, 0);
  const avgConversion =
    stats.length > 0
      ? stats.reduce((s, x) => s + x.conversionRate, 0) / stats.length
      : 0;

  const sorted = [...stats].sort((a, b) => b.revenue - a.revenue);

  function openSeller(s: SellerStats) {
    setSelectedSeller(s);
  }

  const sellerReservations = selectedSeller
    ? reservations.filter(
        (r) =>
          allCommissions.some(
            (c) => c.userId === selectedSeller.user.id && c.reservationId === r.id
          )
      )
    : [];

  const sellerCommissions: Commission[] = selectedSeller
    ? allCommissions.filter((c) => c.userId === selectedSeller.user.id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard de Vendedores</h1>
        <p className="text-sm text-muted-foreground">Desempenho e comissões da equipe de vendas</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total de Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSellers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="w-4 h-4" />
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSales}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Comissão Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmtCurrency(totalCommission)}</p>
            <p className="text-xs text-muted-foreground">
              de {fmtCurrency(totalRevenue)} em vendas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Conversão Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{avgConversion.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Ranking table */}
      <Card>
        <CardHeader>
          <CardTitle>Ranking de Vendedores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Vendas</TableHead>
                <TableHead>Receita</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    Nenhum vendedor com dados de comissão
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((s, idx) => (
                  <TableRow key={s.user.id}>
                    <TableCell>
                      <span
                        className={`font-bold ${
                          idx === 0
                            ? "text-yellow-500"
                            : idx === 1
                            ? "text-gray-400"
                            : idx === 2
                            ? "text-orange-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{s.user.name}</p>
                        <p className="text-xs text-muted-foreground">{s.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {s.user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{s.salesCount}</TableCell>
                    <TableCell>{fmtCurrency(s.revenue)}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {fmtCurrency(s.commission)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5"
                            style={{ width: `${Math.min(100, s.conversionRate)}%` }}
                          />
                        </div>
                        <span className="text-xs">{s.conversionRate.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSeller(s)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-seller detail */}
      <Dialog open={!!selectedSeller} onOpenChange={() => setSelectedSeller(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSeller?.user.name} — Detalhes
            </DialogTitle>
          </DialogHeader>
          {selectedSeller && (
            <div className="space-y-4">
              {/* Personal KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Vendas</p>
                  <p className="text-2xl font-bold">{selectedSeller.salesCount}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Receita gerada</p>
                  <p className="text-2xl font-bold">{fmtCurrency(selectedSeller.revenue)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Comissão</p>
                  <p className="text-2xl font-bold text-green-600">
                    {fmtCurrency(selectedSeller.commission)}
                  </p>
                </div>
              </div>

              {/* Recent commissions */}
              <div>
                <h3 className="font-semibold mb-2">Comissões Recentes</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor Base</TableHead>
                        <TableHead>Comissão</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sellerCommissions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                            Nenhuma comissão registrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        sellerCommissions.slice(0, 10).map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-sm">
                              {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell>{fmtCurrency(c.baseAmount)}</TableCell>
                            <TableCell className="text-green-600">
                              {fmtCurrency(c.commissionAmount)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={c.status === "paid" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {c.status === "paid" ? "Pago" : c.status === "pending" ? "Pendente" : c.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Associated reservations */}
              {sellerReservations.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Reservas Associadas</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Voucher</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Viagem</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sellerReservations.slice(0, 8).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.voucherCode}</TableCell>
                            <TableCell>{r.client.name}</TableCell>
                            <TableCell>{r.trip.name}</TableCell>
                            <TableCell>{fmtCurrency(r.totalValue)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {r.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
