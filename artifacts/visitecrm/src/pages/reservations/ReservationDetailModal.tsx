import { useState } from "react";
import { useGetReservation, useListPayments } from "@workspace/api-client-react";
import { PAYMENT_STATUS } from "@workspace/permissions";
import { Client360Modal } from "@/components/client360-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, DollarSign, Tag } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, METHOD_LABELS, fmt } from "./constants";
import { ReservationPassengersTab } from "./ReservationPassengersTab";

export function ReservationDetailModal({ reservationId, open, onClose }: {
  reservationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const { data, isLoading } = useGetReservation(reservationId, {
    query: { queryKey: ["reservation", reservationId], enabled: open && !!reservationId },
  });
  const { data: paymentsData } = useListPayments(
    { reservationId, limit: 50 },
    { query: { queryKey: ["payments", reservationId], enabled: open && !!reservationId } }
  );
  const payments = paymentsData?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data ? (
              <span className="flex items-center gap-2">
                Reserva <code className="text-base font-mono bg-muted px-1.5 py-0.5 rounded">{data.voucherCode}</code>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[data.status] ?? "bg-gray-100 text-gray-800"}`}>
                  {STATUS_LABELS[data.status] ?? data.status}
                </span>
              </span>
            ) : "Detalhes da Reserva"}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : data ? (
          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Detalhes</TabsTrigger>
              <TabsTrigger value="passengers">Passageiros</TabsTrigger>
              <TabsTrigger value="payments">Pagamentos</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                  {data.client?.id ? (
                    <button className="font-medium hover:underline text-left" onClick={() => setClient360Id(data.client!.id)}>
                      {data.client?.name}
                    </button>
                  ) : (
                    <p className="font-medium">{data.client?.name}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{data.client?.email}</p>
                  <p className="text-sm text-muted-foreground">{data.client?.whatsapp}</p>
                  {data.client?.cpf && <p className="text-sm text-muted-foreground">CPF: {data.client.cpf}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Viagem</p>
                  <p className="font-medium">{data.trip?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.trip?.departureDate ? new Date(data.trip.departureDate).toLocaleDateString("pt-BR") : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">{data.trip?.destination}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valor Total</p>
                  <p className="font-semibold text-lg">{fmt(data.totalValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Valor Pago</p>
                  <p className="font-semibold text-lg text-green-600">{fmt(data.paidValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Saldo</p>
                  <p className={`font-semibold text-lg ${data.balance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(data.balance)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Forma de Pagamento</p>
                  <p className="font-medium">{METHOD_LABELS[data.paymentMethod ?? ""] ?? data.paymentMethod ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Parcelas</p>
                  <p className="font-medium">{data.installments}x</p>
                </div>
              </div>
              {data.seats?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assentos Reservados</p>
                  <div className="flex flex-wrap gap-1">
                    {data.seats.map(s => (
                      <span key={s} className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-sm font-mono">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{data.notes}</p>
                </div>
              )}
              {(data as { storeOrderId?: string | null }).storeOrderId && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Origem: Vitrine Online</p>
                    <p className="text-sm text-blue-700">
                      N° do pedido: <span className="font-mono font-semibold">{(data as { storeOrderId?: string | null }).storeOrderId}</span>
                    </p>
                  </div>
                </div>
              )}
              {data.checkedInAt && (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm text-green-700">Check-in realizado em {new Date(data.checkedInAt).toLocaleString("pt-BR")}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Criada em</p>
                <p className="text-sm">{new Date(data.createdAt).toLocaleString("pt-BR")}</p>
              </div>
            </TabsContent>

            <TabsContent value="passengers">
              <ReservationPassengersTab reservationId={reservationId} />
            </TabsContent>

            <TabsContent value="payments" className="space-y-4 mt-4">
              {payments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum pagamento registrado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border text-sm">
                      <div>
                        <p className="font-medium">{METHOD_LABELS[p.paymentMethod ?? ""] ?? p.paymentMethod ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Venc: {new Date(p.dueDate).toLocaleDateString("pt-BR")}
                          {p.description && ` · ${p.description}`}
                        </p>
                        {p.paidAt && <p className="text-xs text-green-600 mt-0.5">Pago em {new Date(p.paidAt).toLocaleDateString("pt-BR")}</p>}
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold text-base ${p.status === PAYMENT_STATUS.PAID ? "text-green-600" : ""}`}>
                          {fmt(parseFloat(String(p.amount)))}
                        </p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${p.status === PAYMENT_STATUS.PAID ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {p.status === PAYMENT_STATUS.PAID ? "Pago" : "Pendente"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total cobrado:</span><span className="font-semibold">{fmt(data.totalValue)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Total recebido:</span><span className="font-semibold text-green-600">{fmt(data.paidValue)}</span></div>
                <div className="flex justify-between text-sm mt-1"><span className="text-muted-foreground">Saldo pendente:</span><span className={`font-semibold ${data.balance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(data.balance)}</span></div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-muted-foreground py-4">Reserva não encontrada.</p>
        )}
      </DialogContent>
      <Client360Modal open={!!client360Id} onClose={() => setClient360Id(null)} clientId={client360Id} />
    </Dialog>
  );
}
