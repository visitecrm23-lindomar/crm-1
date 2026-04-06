import { useState } from "react";
import {
  useListReservations,
  useGetReservation,
  useCheckInReservation,
} from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  QrCode,
  CheckCircle2,
  Clock,
  User,
  Map,
  CreditCard,
  ScanLine,
  Download,
} from "lucide-react";

function fmtCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  pending: "Pendente",
  cancelled: "Cancelada",
  waiting: "Aguardando",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
  overdue: "Em atraso",
};

function paymentStatus(r: Reservation): string {
  if (r.balance <= 0) return "paid";
  if (r.paidValue > 0) return "partial";
  return "pending";
}

function VoucherCard({ reservation }: { reservation: Reservation }) {
  const { toast } = useToast();
  const checkIn = useCheckInReservation();
  const isCheckedIn = !!reservation.checkedInAt;

  async function handleCheckIn() {
    try {
      await checkIn.mutateAsync({ id: reservation.id });
      toast({ title: "Check-in realizado com sucesso" });
    } catch {
      toast({ title: "Erro ao realizar check-in", variant: "destructive" });
    }
  }

  const pStatus = paymentStatus(reservation);

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-bold">{reservation.client.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{reservation.client.email}</p>
          </div>
          {isCheckedIn ? (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Check-in realizado
            </Badge>
          ) : (
            <Badge variant="outline">
              <Clock className="w-3 h-3 mr-1" />
              Aguardando check-in
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code placeholder */}
        <div className="flex gap-4">
          <div className="w-24 h-24 rounded-lg bg-muted border-2 border-dashed flex items-center justify-center shrink-0">
            <div className="text-center">
              <QrCode className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-1">QR Code</p>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Viagem</p>
                <p className="font-medium text-sm">{reservation.trip.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Assentos</p>
                <p className="font-medium text-sm">{reservation.seats.join(", ") || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Pagamento</p>
                <Badge
                  variant={pStatus === "paid" ? "default" : pStatus === "partial" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {PAYMENT_STATUS_LABELS[pStatus] ?? pStatus}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Financial summary */}
        <div className="grid grid-cols-3 gap-2 text-center p-3 bg-muted/40 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="font-bold text-sm">{fmtCurrency(reservation.totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="font-bold text-sm text-green-600">{fmtCurrency(reservation.paidValue)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo</p>
            <p className={`font-bold text-sm ${reservation.balance > 0 ? "text-red-500" : "text-green-600"}`}>
              {fmtCurrency(reservation.balance)}
            </p>
          </div>
        </div>

        {/* Voucher code + barcode */}
        <div className="rounded-lg border bg-muted/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Código do Voucher</p>
          <p className="font-mono text-lg font-bold tracking-widest">{reservation.voucherCode}</p>
          <div className="mt-2 h-8 bg-gradient-to-r from-transparent via-foreground/10 to-transparent rounded flex items-center justify-center">
            <span className="font-mono text-xs text-muted-foreground">|||||||||||||||||||||||||||</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!isCheckedIn && (
            <Button
              className="flex-1"
              onClick={handleCheckIn}
              disabled={checkIn.isPending}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {checkIn.isPending ? "Realizando..." : "Realizar Check-in"}
            </Button>
          )}
          <Button variant="outline" size="icon" title="Baixar voucher">
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {isCheckedIn && reservation.checkedInAt && (
          <p className="text-xs text-center text-muted-foreground">
            Check-in realizado em{" "}
            {new Date(reservation.checkedInAt).toLocaleString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Vouchers() {
  const [searchCode, setSearchCode] = useState("");
  const [filterTrip, setFilterTrip] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");

  const { data: reservationsData, refetch } = useListReservations({ limit: 200 });
  const reservations = reservationsData?.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: selectedReservation } = useGetReservation(selectedId ?? "", {
    query: { enabled: !!selectedId, queryKey: [`/api/reservations/${selectedId}`] },
  });

  const { toast } = useToast();

  const trips = Array.from(new Set(reservations.map((r) => r.trip.name)));

  const filtered = reservations.filter((r) => {
    const matchCode =
      !searchCode ||
      r.voucherCode.toLowerCase().includes(searchCode.toLowerCase()) ||
      r.client.name.toLowerCase().includes(searchCode.toLowerCase()) ||
      (r.client.cpf ?? "").includes(searchCode);
    const matchTrip = filterTrip === "__all__" || r.trip.name === filterTrip;
    const matchStatus = filterStatus === "__all__" || r.status === filterStatus;
    return matchCode && matchTrip && matchStatus;
  });

  const checkedIn = reservations.filter((r) => !!r.checkedInAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vouchers e Check-in</h1>
          <p className="text-sm text-muted-foreground">
            {checkedIn} de {reservations.length} passageiros realizaram check-in
          </p>
        </div>
        <Button variant="outline">
          <ScanLine className="w-4 h-4 mr-2" />
          Scanner QR (câmera)
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por voucher, nome ou CPF..."
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
          />
        </div>
        <Select value={filterTrip} onValueChange={setFilterTrip}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas as viagens" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as viagens</SelectItem>
            {trips.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Two column layout: table + card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table */}
        <div className="lg:col-span-2 rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher</TableHead>
                <TableHead>Passageiro</TableHead>
                <TableHead>Viagem</TableHead>
                <TableHead>Assentos</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Nenhum voucher encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${
                      selectedId === r.id ? "bg-primary/5" : "hover:bg-muted/40"
                    }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <TableCell className="font-mono text-sm">{r.voucherCode}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.client.name}</p>
                        <p className="text-xs text-muted-foreground">{r.client.cpf ?? ""}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.trip.name}</TableCell>
                    <TableCell className="text-sm">{r.seats.join(", ") || "—"}</TableCell>
                    <TableCell>
                      {r.checkedInAt ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "confirmed"
                            ? "default"
                            : r.status === "cancelled"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Voucher card */}
        <div>
          {selectedReservation ? (
            <VoucherCard key={selectedReservation.id} reservation={selectedReservation} />
          ) : (
            <div className="rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center">
              <QrCode className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Selecione uma reserva para ver o voucher</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
