import { useState, useEffect } from "react";
import { useGetReservation, useListBoardingLocations, useUpdateReservation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { z } from "zod";
import { RESERVATION_STATUS, type ReservationStatus } from "@workspace/permissions";
import { fmt } from "./constants";

const ReservationStatusSchema = z.enum([
  RESERVATION_STATUS.PENDING,
  RESERVATION_STATUS.CONFIRMED,
  RESERVATION_STATUS.CANCELLED,
  RESERVATION_STATUS.REFUNDED,
  RESERVATION_STATUS.COMPLETED,
  RESERVATION_STATUS.FAILED,
]);

const EDITABLE_STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: RESERVATION_STATUS.PENDING, label: "Pendente" },
  { value: RESERVATION_STATUS.CONFIRMED, label: "Confirmada" },
  { value: RESERVATION_STATUS.COMPLETED, label: "Concluída" },
  { value: RESERVATION_STATUS.CANCELLED, label: "Cancelada" },
];

function parseReservationStatus(v: string): ReservationStatus | undefined {
  const r = ReservationStatusSchema.safeParse(v);
  return r.success ? r.data : undefined;
}

export function EditReservationModal({ reservationId, open, onClose, onSuccess }: {
  reservationId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data, isLoading } = useGetReservation(reservationId, {
    query: { queryKey: ["reservation-edit", reservationId], enabled: open && !!reservationId },
  });
  const { data: boardingRaw } = useListBoardingLocations();
  const updateReservation = useUpdateReservation();
  const [paymentMethod, setPaymentMethod] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [boardingLocationId, setBoardingLocationId] = useState<string>("");

  useEffect(() => {
    if (data) {
      setEditStatus(data.status ?? "");
      setPaymentMethod(data.paymentMethod ?? "");
      setBoardingLocationId((data as { boardingLocationId?: string | null }).boardingLocationId ?? "");
    }
  }, [data]);

  const boardingLocations = boardingRaw ?? [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const totalValueRaw = fd.get("totalValue") as string;
    const installmentsRaw = fd.get("installments") as string;
    const firstDueDateRaw = (fd.get("firstDueDate") as string || "").trim();
    const seatsRaw = (fd.get("seats") as string || "").trim();
    await updateReservation.mutateAsync({
      id: reservationId,
      data: {
        status: parseReservationStatus(editStatus),
        paymentMethod: paymentMethod || undefined,
        notes: (fd.get("notes") as string) || undefined,
        totalValue: totalValueRaw ? parseFloat(totalValueRaw) : undefined,
        installments: installmentsRaw ? parseInt(installmentsRaw) : undefined,
        firstDueDate: firstDueDateRaw || undefined,
        seats: seatsRaw ? seatsRaw.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        boardingLocationId: boardingLocationId || null,
      }
    });
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Reserva</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : data ? (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <span className="text-muted-foreground">Reserva: </span>
              <span className="font-mono font-semibold">{data.voucherCode}</span>
              <span className="text-muted-foreground ml-3">Cliente: </span>
              <span className="font-medium">{data.client?.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Forma de Pagamento</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                    <SelectItem value="debit_card">Cartão de Débito</SelectItem>
                    <SelectItem value="bank_transfer">Transferência</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor Total (R$)</label>
                <Input name="totalValue" type="number" step="0.01" min="0" defaultValue={data.totalValue.toFixed(2)} />
                <p className="text-xs text-muted-foreground">Saldo atual: {fmt(data.balance)}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Parcelas</label>
                <Input name="installments" type="number" min="1" max="24" defaultValue={data.installments ?? 1} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">1ª data de vencimento</label>
              <Input name="firstDueDate" type="date" />
              <p className="text-xs text-muted-foreground">Preencha para regenerar o cronograma de parcelas (apenas parcelas não pagas serão recriadas).</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assentos</label>
              <Input name="seats" defaultValue={(data.seats ?? []).join(", ")} placeholder="Ex: 1, 2, 3 (separados por vírgula)" />
            </div>
            {boardingLocations.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Local de Embarque</label>
                <Select value={boardingLocationId || "none"} onValueChange={v => setBoardingLocationId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {boardingLocations.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <Input name="notes" defaultValue={data.notes ?? ""} placeholder="Observações sobre a reserva..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={updateReservation.isPending}>
                {updateReservation.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </form>
        ) : <p className="text-muted-foreground py-4">Reserva não encontrada.</p>}
      </DialogContent>
    </Dialog>
  );
}
