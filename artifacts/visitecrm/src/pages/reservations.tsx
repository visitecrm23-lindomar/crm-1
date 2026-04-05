import { useState } from "react";
import { Link } from "wouter";
import { useListReservations, useCreateReservation, useListTrips, useListClients } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Tag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export default function Reservations() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");

  const { data, isLoading, refetch } = useListReservations({ status: status || undefined, page, limit: 20 });
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: clientsData } = useListClients({ limit: 100 });
  const createReservation = useCreateReservation();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await createReservation.mutateAsync({
      data: {
        tripId: selectedTripId,
        clientId: selectedClientId,
        seats: [(formData.get("seat") as string) || "1"],
        totalValue: parseFloat(formData.get("totalValue") as string || "0"),
        paymentMethod: formData.get("paymentMethod") as string || "pix",
        installments: parseInt(formData.get("installments") as string || "1"),
        notes: formData.get("notes") as string || undefined,
      }
    });
    setIsCreateOpen(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground mt-1">Gerencie todas as reservas de excursões.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Nova Reserva</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Criar Reserva</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Viagem</label>
                <Select onValueChange={setSelectedTripId} value={selectedTripId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar viagem..." /></SelectTrigger>
                  <SelectContent>
                    {tripsData?.data?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente</label>
                <Select onValueChange={setSelectedClientId} value={selectedClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
                  <SelectContent>
                    {clientsData?.data?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assento</label>
                  <Input name="seat" placeholder="1" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor Total (R$)</label>
                  <Input name="totalValue" type="number" step="0.01" required placeholder="1500.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Forma de Pagamento</label>
                  <Select name="paymentMethod" defaultValue="pix">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                      <SelectItem value="bank_transfer">Transferência</SelectItem>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parcelas</label>
                  <Input name="installments" type="number" defaultValue="1" min="1" max="12" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <Input name="notes" placeholder="Informações adicionais..." />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createReservation.isPending || !selectedTripId || !selectedClientId}>
                  {createReservation.isPending ? "Criando..." : "Criar Reserva"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos os status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Viagem</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-6 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma reserva encontrada.
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono text-sm font-medium">{r.voucherCode}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.client?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.client?.whatsapp}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.trip?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.trip?.departureDate ? new Date(r.trip.departureDate).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">R$ {r.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">
                      Pago: R$ {r.paidValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status] ?? "bg-gray-100 text-gray-800"}`}>
                      {statusLabels[r.status] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/reservations/${r.id}`}>
                      <Button variant="ghost" size="sm">Detalhes</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page * data.limit >= data.total} onClick={() => setPage(p => p + 1)}>Próximo</Button>
        </div>
      )}
    </div>
  );
}
