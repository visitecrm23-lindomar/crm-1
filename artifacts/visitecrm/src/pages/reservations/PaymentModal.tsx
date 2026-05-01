import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePayment } from "@workspace/api-client-react";
import type { Reservation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "./constants";

export function PaymentModal({ reservation, open, onClose, onSuccess }: {
  reservation: Reservation | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const createPayment = useCreatePayment();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState("pix");

  if (!reservation) return null;

  const remaining = reservation.balance;

  const handlePay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = parseFloat(fd.get("amount") as string || "0");
    const now = new Date().toISOString();
    await createPayment.mutateAsync({
      data: {
        reservationId: reservation.id,
        clientId: reservation.clientId,
        type: "receivable",
        category: "reservation",
        amount,
        paymentMethod: method,
        dueDate: now.split("T")[0],
        description: `Pagamento reserva ${reservation.voucherCode}`,
        installments: parseInt(fd.get("installments") as string || "1"),
        status: "paid",
        paidAt: now,
      }
    });
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations/stats"] });
    await queryClient.invalidateQueries({ queryKey: ["reservation", reservation.id] });
    await queryClient.invalidateQueries({ queryKey: ["reservation-edit", reservation.id] });
    await queryClient.invalidateQueries({ queryKey: ["voucher", reservation.id] });
    await queryClient.invalidateQueries({ queryKey: ["payments", reservation.id] });
    await queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
        <div className="mb-4 p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">Reserva: <span className="font-mono font-medium">{reservation.voucherCode}</span></p>
          <p className="text-sm text-muted-foreground">Cliente: <span className="font-medium">{reservation.client?.name}</span></p>
          <p className="text-sm text-muted-foreground">Saldo devedor: <span className="font-semibold text-destructive">{fmt(remaining)}</span></p>
        </div>
        <form onSubmit={handlePay} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Valor (R$)</label>
            <Input name="amount" type="number" step="0.01" max={remaining} defaultValue={remaining.toFixed(2)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Forma de Pagamento</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Parcelas</label>
              <Input name="installments" type="number" defaultValue="1" min="1" max="12" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={createPayment.isPending}>
              {createPayment.isPending ? "Registrando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
