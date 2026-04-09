import { useState, useMemo, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import {
  useListReservations,
  useGetReservation,
  useCreateReservation,
  useUpdateReservation,
  useCheckInReservation,
  useCreatePayment,
  useListPayments,
  useListTrips,
  useListClients,
  useListUsers,
  useListBoardingLocations,
  useListPassengers,
  useCreatePassenger,
  useUpdatePassenger,
  useDeletePassenger,
} from "@workspace/api-client-react";
import type { Reservation, Passenger } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Plus, Search, MoreHorizontal, Eye, DollarSign, QrCode, CheckCircle, XCircle,
  CalendarCheck, Clock, Users, Tag, Pencil, Trash2, UserPlus,
} from "lucide-react";

const AGE_CATEGORY_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  senior: "Sênior",
  baby: "Bebê (< 2 anos)",
};

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
};
const METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência",
  cash: "Dinheiro",
  boleto: "Boleto",
};

function StatCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`mt-1 p-2 rounded-md bg-muted ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function PassengerForm({
  defaultValues,
  onSubmit,
  onCancel,
  isPending,
  isEdit,
}: {
  defaultValues?: { name?: string; cpf?: string; rg?: string; birthDate?: string; ageCategory?: string; seatNumber?: string };
  onSubmit: (fd: FormData, ageCategory: string) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
  isEdit?: boolean;
}) {
  const [ageCategory, setAgeCategory] = useState(defaultValues?.ageCategory ?? "adult");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSubmit(new FormData(e.currentTarget), ageCategory);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className="text-sm font-medium">Nome completo *</label>
          <Input name="name" required defaultValue={defaultValues?.name ?? ""} placeholder="Nome do passageiro" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">CPF</label>
          <Input name="cpf" defaultValue={defaultValues?.cpf ?? ""} placeholder="000.000.000-00" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">RG</label>
          <Input name="rg" defaultValue={defaultValues?.rg ?? ""} placeholder="0000000" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Data de Nascimento</label>
          <Input name="birthDate" type="date" defaultValue={defaultValues?.birthDate?.slice(0, 10) ?? ""} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Assento</label>
          <Input name="seatNumber" defaultValue={defaultValues?.seatNumber ?? ""} placeholder="Ex: 12" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <label className="text-sm font-medium">Categoria de Idade *</label>
          <Select value={ageCategory} onValueChange={setAgeCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(AGE_CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Salvando..." : isEdit ? "Salvar Alterações" : "Adicionar Passageiro"}
        </Button>
      </div>
    </form>
  );
}

function ReservationPassengersTab({ reservationId }: { reservationId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingPassenger, setEditingPassenger] = useState<Passenger | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: passengers, refetch } = useListPassengers(reservationId, {
    query: { queryKey: ["passengers", reservationId] },
  });
  const createPassenger = useCreatePassenger();
  const updatePassenger = useUpdatePassenger();
  const deletePassenger = useDeletePassenger();

  const handleAdd = async (fd: FormData, ageCategory: string) => {
    await createPassenger.mutateAsync({
      reservationId,
      data: {
        name: fd.get("name") as string,
        cpf: (fd.get("cpf") as string) || undefined,
        ageCategory,
        seatNumber: (fd.get("seatNumber") as string) || undefined,
        isChildUnder7: ageCategory === "baby",
      },
    });
    await refetch();
    setAddOpen(false);
  };

  const handleEdit = async (fd: FormData, ageCategory: string) => {
    if (!editingPassenger) return;
    await updatePassenger.mutateAsync({
      reservationId,
      id: editingPassenger.id,
      data: {
        name: (fd.get("name") as string) || undefined,
        cpf: (fd.get("cpf") as string) || null,
        ageCategory,
        seatNumber: (fd.get("seatNumber") as string) || null,
      },
    });
    await refetch();
    setEditingPassenger(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deletePassenger.mutateAsync({ reservationId, id: deleteId });
    await refetch();
    setDeleteId(null);
  };

  const list = (passengers ?? []) as Passenger[];

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{list.length} passageiro(s) cadastrado(s)</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Adicionar Passageiro
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum passageiro cadastrado</p>
          <p className="text-xs mt-1">Adicione passageiros com CPF/RG para controle de embarque e lista ANTT.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div>
                <p className="font-medium text-sm">{p.name}</p>
                <div className="flex gap-3 mt-0.5 flex-wrap">
                  {p.cpf && <span className="text-xs text-muted-foreground">CPF: {p.cpf}</span>}
                  {p.seatNumber && <span className="text-xs text-muted-foreground">Assento: {p.seatNumber}</span>}
                  {p.birthDate && <span className="text-xs text-muted-foreground">{new Date(p.birthDate as string).toLocaleDateString("pt-BR")}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    p.ageCategory === "adult" ? "bg-blue-100 text-blue-700" :
                    p.ageCategory === "child" ? "bg-amber-100 text-amber-700" :
                    p.ageCategory === "senior" ? "bg-purple-100 text-purple-700" :
                    "bg-pink-100 text-pink-700"
                  }`}>
                    {AGE_CATEGORY_LABELS[p.ageCategory] ?? p.ageCategory}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setEditingPassenger(p)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteId(p.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Passageiro</DialogTitle></DialogHeader>
          <div className="mt-2">
            <PassengerForm
              onSubmit={handleAdd}
              onCancel={() => setAddOpen(false)}
              isPending={createPassenger.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPassenger} onOpenChange={(o) => { if (!o) setEditingPassenger(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Passageiro</DialogTitle></DialogHeader>
          {editingPassenger && (
            <div className="mt-2">
              <PassengerForm
                isEdit
                defaultValues={{
                  name: editingPassenger.name,
                  cpf: editingPassenger.cpf ?? "",
                  ageCategory: editingPassenger.ageCategory,
                  seatNumber: editingPassenger.seatNumber ?? "",
                }}
                onSubmit={handleEdit}
                onCancel={() => setEditingPassenger(null)}
                isPending={updatePassenger.isPending}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Passageiro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este passageiro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deletePassenger.isPending}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReservationDetailModal({ reservationId, open, onClose }: { reservationId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGetReservation(reservationId, {
    query: {
      queryKey: ["reservation", reservationId],
      enabled: open && !!reservationId,
    },
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
                  <p className="font-medium">{data.client?.name}</p>
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
                  <p className={`font-semibold text-lg ${data.balance > 0 ? "text-destructive" : "text-green-600"}`}>
                    {fmt(data.balance)}
                  </p>
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
                        <p className={`font-semibold text-base ${p.status === "paid" ? "text-green-600" : ""}`}>
                          {fmt(parseFloat(String(p.amount)))}
                        </p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${p.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {p.status === "paid" ? "Pago" : "Pendente"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-3 bg-muted/30 rounded-lg border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total cobrado:</span>
                  <span className="font-semibold">{fmt(data.totalValue)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Total recebido:</span>
                  <span className="font-semibold text-green-600">{fmt(data.paidValue)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Saldo pendente:</span>
                  <span className={`font-semibold ${data.balance > 0 ? "text-destructive" : "text-green-600"}`}>{fmt(data.balance)}</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-muted-foreground py-4">Reserva não encontrada.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentModal({ reservation, open, onClose, onSuccess }: { reservation: Reservation | null; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const createPayment = useCreatePayment();
  const updateReservation = useUpdateReservation();
  const [method, setMethod] = useState("pix");

  if (!reservation) return null;

  const remaining = reservation.balance;

  const handlePay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = parseFloat(fd.get("amount") as string || "0");
    await createPayment.mutateAsync({
      data: {
        reservationId: reservation.id,
        clientId: reservation.clientId,
        type: "receivable",
        category: "reservation",
        amount,
        paymentMethod: method,
        dueDate: new Date().toISOString().split("T")[0],
        description: `Pagamento reserva ${reservation.voucherCode}`,
        installments: parseInt(fd.get("installments") as string || "1"),
      }
    });
    if (amount >= remaining) {
      await updateReservation.mutateAsync({ id: reservation.id, data: { status: "confirmed" } });
    }
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
        </DialogHeader>
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
            <Button type="submit" disabled={createPayment.isPending || updateReservation.isPending}>
              {createPayment.isPending ? "Registrando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewReservationModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { data: tripsData } = useListTrips({ limit: 100, status: "published" });
  const { data: clientsData } = useListClients({ limit: 200 });
  const createReservation = useCreateReservation();
  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [clientSearch, setClientSearch] = useState("");
  const [tripSearch, setTripSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const filteredClients = useMemo(() =>
    (clientsData?.data ?? []).filter(c =>
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.whatsapp.includes(clientSearch)
    ),
    [clientsData, clientSearch]
  );
  const filteredTrips = useMemo(() =>
    (tripsData?.data ?? []).filter(t =>
      t.name.toLowerCase().includes(tripSearch.toLowerCase())
    ),
    [tripsData, tripSearch]
  );
  const selectedTrip = tripsData?.data.find(t => t.id === selectedTripId);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError(null);
    const fd = new FormData(e.currentTarget);
    const seatsRaw = (fd.get("seats") as string || "").trim();
    const seats = seatsRaw ? seatsRaw.split(",").map(s => s.trim()).filter(Boolean) : ["1"];
    try {
      await createReservation.mutateAsync({
        data: {
          tripId: selectedTripId,
          clientId: selectedClientId,
          seats,
          totalValue: parseFloat(fd.get("totalValue") as string || "0"),
          paymentMethod,
          installments: parseInt(fd.get("installments") as string || "1"),
          notes: (fd.get("notes") as string) || undefined,
          hasInsurance: fd.get("hasInsurance") === "on",
        }
      });
      setSelectedTripId("");
      setSelectedClientId("");
      setClientSearch("");
      setTripSearch("");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = (err as { data?: { error?: string } })?.data?.error;
      const msg = apiError ?? (err instanceof Error ? err.message : null) ?? "Erro ao criar reserva";
      setCreateError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setCreateError(null); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Reserva</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Viagem *</label>
            <Input placeholder="Buscar viagem..." value={tripSearch} onChange={e => setTripSearch(e.target.value)} className="mb-1" />
            <Select onValueChange={setSelectedTripId} value={selectedTripId}>
              <SelectTrigger><SelectValue placeholder="Selecionar viagem..." /></SelectTrigger>
              <SelectContent className="max-h-48">
                {filteredTrips.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.availableSeats} vagas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente *</label>
            <Input placeholder="Buscar cliente..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="mb-1" />
            <Select onValueChange={setSelectedClientId} value={selectedClientId}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente..." /></SelectTrigger>
              <SelectContent className="max-h-48">
                {filteredClients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} — {c.whatsapp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Assentos</label>
              <Input name="seats" placeholder="1,2,3 (separados por vírgula)" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor Total (R$) *</label>
              <Input
                name="totalValue"
                type="number"
                step="0.01"
                required
                placeholder={selectedTrip ? String(selectedTrip.availableSeats > 0 ? "0.00" : "—") : "0.00"}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Forma de Pagamento</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
          <div className="space-y-2">
            <label className="text-sm font-medium">Observações</label>
            <Input name="notes" placeholder="Observações sobre a reserva..." />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="hasInsurance" id="hasInsurance" className="rounded" />
            <label htmlFor="hasInsurance" className="text-sm">Incluir seguro de viagem</label>
          </div>
          {createError && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setCreateError(null); onClose(); }}>Cancelar</Button>
            <Button type="submit" disabled={createReservation.isPending || !selectedTripId || !selectedClientId}>
              {createReservation.isPending ? "Criando..." : "Criar Reserva"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Reservations() {
  const [, navigate] = useLocation();
  const [routeMatch, routeParams] = useRoute("/reservations/:id");
  const idFromRoute = routeMatch ? (routeParams as { id: string }).id : null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tripFilter, setTripFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [paymentRes, setPaymentRes] = useState<Reservation | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const activeDetailId = detailId ?? idFromRoute;

  const { data, isLoading, refetch } = useListReservations({
    status: statusFilter || undefined,
    tripId: tripFilter || undefined,
    search: search || undefined,
    page,
    limit: 20,
  });
  const { data: confirmedTotals } = useListReservations({ status: "confirmed", limit: 1 });
  const { data: pendingTotals } = useListReservations({ status: "pending", limit: 1 });
  const { data: cancelledTotals } = useListReservations({ status: "cancelled", limit: 1 });
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: usersRaw } = useListUsers();
  const { data: boardingRaw } = useListBoardingLocations();
  const updateReservation = useUpdateReservation();
  const checkInReservation = useCheckInReservation();

  const sellers = useMemo(() => (usersRaw ?? []).filter(u => u.role === "vendedor" || u.role === "agencia"), [usersRaw]);
  const boardingMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of (boardingRaw ?? [])) m[b.id] = b.name;
    return m;
  }, [boardingRaw]);

  const reservationsRaw = data?.data ?? [];
  const reservations = useMemo(() => {
    let all = reservationsRaw;
    if (dateFrom) all = all.filter(r => r.createdAt >= dateFrom);
    if (dateTo) all = all.filter(r => r.createdAt <= dateTo + "T23:59:59.999Z");
    if (sellerFilter) all = all.filter(r => (r as { sellerId?: string }).sellerId === sellerFilter);
    return all;
  }, [reservationsRaw, dateFrom, dateTo, sellerFilter]);
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const statCards = useMemo(() => {
    return {
      total: data?.total ?? 0,
      confirmed: confirmedTotals?.total ?? 0,
      pending: pendingTotals?.total ?? 0,
      cancelled: cancelledTotals?.total ?? 0,
    };
  }, [data, confirmedTotals, pendingTotals, cancelledTotals]);

  const handleCheckin = async (r: Reservation) => {
    await checkInReservation.mutateAsync({ id: r.id });
    refetch();
  };
  const handleCancel = async (id: string) => {
    await updateReservation.mutateAsync({ id, data: { status: "cancelled" } });
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground text-sm">Gerencie todas as reservas de excursões</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nova Reserva
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Total de Reservas" value={data?.total ?? "—"} color="text-blue-600" />
        <StatCard icon={CheckCircle} label="Confirmadas" value={statCards.confirmed} color="text-green-600" />
        <StatCard icon={Clock} label="Pendentes" value={statCards.pending} color="text-yellow-600" />
        <StatCard icon={XCircle} label="Canceladas" value={statCards.cancelled} color="text-red-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, voucher, CPF..."
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter || "all"} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="confirmed">Confirmada</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tripFilter || "all"} onValueChange={v => { setTripFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Viagem" /></SelectTrigger>
          <SelectContent className="max-h-48">
            <SelectItem value="all">Todas as viagens</SelectItem>
            {tripsData?.data.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sellers.length > 0 && (
          <Select value={sellerFilter || "all"} onValueChange={v => { setSellerFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent className="max-h-48">
              <SelectItem value="all">Todos</SelectItem>
              {sellers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-36" />
          <span className="text-muted-foreground text-xs">até</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-36" />
        </div>
        {(search || statusFilter || tripFilter || sellerFilter || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setTripFilter(""); setSellerFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Viagem</TableHead>
              <TableHead>Embarque</TableHead>
              <TableHead>Assentos</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <CalendarCheck className="w-8 h-8 opacity-30" />
                    <p>Nenhuma reserva encontrada</p>
                    {(search || statusFilter || tripFilter) && (
                      <p className="text-xs">Tente ajustar os filtros de busca</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reservations.map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs font-semibold">{r.voucherCode}</span>
                      </div>
                      {(r as { storeOrderId?: string | null }).storeOrderId && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 w-fit">
                          Vitrine
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{r.client?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.client?.whatsapp}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm truncate max-w-[140px]">{r.trip?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.trip?.departureDate ? new Date(r.trip.departureDate).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(r as { boardingLocationId?: string }).boardingLocationId
                      ? boardingMap[(r as { boardingLocationId?: string }).boardingLocationId!] ?? "—"
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-0.5">
                      {r.seats.slice(0, 3).map(s => (
                        <span key={s} className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{s}</span>
                      ))}
                      {r.seats.length > 3 && <span className="text-xs text-muted-foreground">+{r.seats.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{fmt(r.totalValue)}</TableCell>
                  <TableCell className="text-sm text-green-700">{fmt(r.paidValue)}</TableCell>
                  <TableCell className={`text-sm font-medium ${r.balance > 0 ? "text-destructive" : "text-green-700"}`}>
                    {fmt(r.balance)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-800"}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(r.id)}>
                          <Eye className="w-4 h-4 mr-2" /> Visualizar
                        </DropdownMenuItem>
                        {r.status !== "cancelled" && (
                          <DropdownMenuItem onClick={() => setEditId(r.id)}>
                            <Pencil className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                        )}
                        {r.balance > 0 && r.status !== "cancelled" && (
                          <DropdownMenuItem onClick={() => setPaymentRes(r)}>
                            <DollarSign className="w-4 h-4 mr-2" /> Registrar Pagamento
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDetailId(r.id)}>
                          <QrCode className="w-4 h-4 mr-2" /> Ver Voucher
                        </DropdownMenuItem>
                        {r.status !== "cancelled" && r.status !== "completed" && (
                          <DropdownMenuItem onClick={() => handleCheckin(r)}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Check-in
                          </DropdownMenuItem>
                        )}
                        {r.status !== "cancelled" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleCancel(r.id)}
                          >
                            <XCircle className="w-4 h-4 mr-2" /> Cancelar Reserva
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Exibindo {Math.min((page - 1) * 20 + 1, total)}–{Math.min(page * 20, total)} de {total} reservas
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <span className="flex items-center px-3 text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
          </div>
        </div>
      )}

      <ReservationDetailModal
        reservationId={activeDetailId ?? ""}
        open={!!activeDetailId}
        onClose={() => {
          if (idFromRoute) {
            navigate("/reservations");
          }
          setDetailId(null);
        }}
      />
      <PaymentModal
        reservation={paymentRes}
        open={!!paymentRes}
        onClose={() => setPaymentRes(null)}
        onSuccess={refetch}
      />
      <NewReservationModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={refetch}
      />
      {editId && (
        <EditReservationModal
          reservationId={editId}
          open={!!editId}
          onClose={() => setEditId(null)}
          onSuccess={() => { refetch(); setEditId(null); }}
        />
      )}
    </div>
  );
}

function EditReservationModal({ reservationId, open, onClose, onSuccess }: { reservationId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { data, isLoading } = useGetReservation(reservationId, {
    query: { queryKey: ["reservation-edit", reservationId], enabled: open && !!reservationId },
  });
  const updateReservation = useUpdateReservation();
  const [paymentMethod, setPaymentMethod] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");

  useEffect(() => {
    if (data?.status) setEditStatus(data.status);
  }, [data?.status]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateReservation.mutateAsync({
      id: reservationId,
      data: {
        status: (editStatus as "pending" | "confirmed" | "completed" | "cancelled") || undefined,
        paymentMethod: paymentMethod || undefined,
        notes: (fd.get("notes") as string) || undefined,
      }
    });
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar Reserva</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : data ? (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Forma de Pagamento</label>
              <Select value={paymentMethod || data.paymentMethod || ""} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Manter atual" /></SelectTrigger>
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
