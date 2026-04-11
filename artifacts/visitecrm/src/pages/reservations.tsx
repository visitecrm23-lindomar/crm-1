import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import {
  useListReservations,
  useGetReservation,
  useGetReservationStats,
  useCreateReservation,
  useUpdateReservation,
  useCheckInReservation,
  useCreatePayment,
  useListPayments,
  useListTrips,
  useGetTrip,
  useListClients,
  useListUsers,
  useListBoardingLocations,
  useValidateReservationCoupon,
  useGetClientLoyalty,
  validateReferralCode,
  useListPassengers,
  useCreatePassenger,
  useUpdatePassenger,
  useDeletePassenger,
  useCheckInPassenger,
  useUndoCheckInPassenger,
} from "@workspace/api-client-react";
import type { Reservation, Passenger } from "@workspace/api-client-react";
import { SeatMapPicker } from "@/components/SeatMapPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, MoreHorizontal, Eye, DollarSign, QrCode, CheckCircle, XCircle,
  CalendarCheck, Clock, Users, Tag, Pencil, Trash2, UserPlus, TrendingDown,
  Download, Printer, LogIn, RotateCcw, Check, ChevronsUpDown,
} from "lucide-react";
import QRCodeLib from "qrcode";

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
  const { toast } = useToast();

  const { data: passengers, refetch } = useListPassengers(reservationId, {
    query: { queryKey: ["passengers", reservationId] },
  });
  const createPassenger = useCreatePassenger();
  const updatePassenger = useUpdatePassenger();
  const deletePassenger = useDeletePassenger();
  const checkInPassenger = useCheckInPassenger();
  const undoCheckInPassenger = useUndoCheckInPassenger();

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

  const handleCheckIn = async (passengerId: string) => {
    try {
      await checkInPassenger.mutateAsync({ reservationId, id: passengerId });
      await refetch();
      toast({ title: "Passageiro embarcado", description: "Check-in registrado com sucesso." });
    } catch {
      toast({ title: "Erro ao fazer check-in", variant: "destructive" });
    }
  };

  const handleUndoCheckIn = async (passengerId: string) => {
    try {
      await undoCheckInPassenger.mutateAsync({ reservationId, id: passengerId });
      await refetch();
      toast({ title: "Check-in desfeito" });
    } catch {
      toast({ title: "Erro ao desfazer check-in", variant: "destructive" });
    }
  };

  const list = (passengers ?? []) as Passenger[];
  const checkedInCount = list.filter(p => p.checkedInAt).length;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{list.length} passageiro(s) cadastrado(s)</p>
          {list.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-green-600 font-medium">{checkedInCount} embarcado(s)</span>
              {" · "}
              <span>{list.length - checkedInCount} pendente(s)</span>
            </p>
          )}
        </div>
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
          {list.map(p => {
            const isCheckedIn = !!p.checkedInAt;
            return (
              <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border ${isCheckedIn ? "bg-green-50 border-green-200" : "bg-muted/50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{p.name}</p>
                    {isCheckedIn && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">
                        <CheckCircle className="w-3 h-3" />
                        Embarcado {new Date(p.checkedInAt as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
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
                <div className="flex gap-1 shrink-0 ml-2">
                  {isCheckedIn ? (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs text-muted-foreground gap-1"
                      onClick={() => handleUndoCheckIn(p.id)}
                      disabled={undoCheckInPassenger.isPending}
                      title="Desfazer check-in"
                    >
                      <RotateCcw className="w-3 h-3" /> Desfazer
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 gap-1"
                      onClick={() => handleCheckIn(p.id)}
                      disabled={checkInPassenger.isPending}
                      title="Fazer check-in"
                    >
                      <LogIn className="w-3 h-3" /> Embarcar
                    </Button>
                  )}
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
            );
          })}
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

function VoucherContent({ r, qrDataUrl }: { r: Reservation | null | undefined; qrDataUrl: string }) {
  const trip = r?.trip;
  const client = r?.client;
  return (
    <div className="bg-white text-gray-900 font-sans" style={{ fontFamily: "system-ui, Arial, sans-serif" }}>
      <div className="flex items-center justify-between pb-3 border-b-2 border-gray-800 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white font-black text-sm">V</div>
          <div>
            <p className="font-black text-sm text-gray-900 leading-none">VisiteCRM</p>
            <p className="text-xs text-gray-500 leading-none">Gestão de Agência de Turismo</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Voucher de Viagem</p>
          <p className="text-xs text-gray-400">
            {new Date(r?.createdAt ?? "").toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 py-4 mb-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">Código do Voucher</p>
        <p className="text-3xl font-mono font-black tracking-wider text-gray-900">{r?.voucherCode}</p>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[r?.status ?? ""] ?? "bg-gray-100 text-gray-800"}`}>
          {STATUS_LABELS[r?.status ?? ""] ?? r?.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Passageiro</p>
          <p className="font-bold text-sm text-gray-900">{client?.name ?? "—"}</p>
          {client?.whatsapp && <p className="text-xs text-gray-500">{client.whatsapp}</p>}
          {client?.cpf && <p className="text-xs text-gray-500">CPF: {client.cpf}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Viagem</p>
          <p className="font-bold text-sm text-gray-900">{trip?.name ?? "—"}</p>
          {trip?.destination && <p className="text-xs text-gray-500">{trip.destination}</p>}
          {trip?.departureDate && (
            <p className="text-xs text-gray-500">
              Partida: {new Date(trip.departureDate).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      {(r?.seats?.length ?? 0) > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assentos</p>
          <div className="flex flex-wrap gap-1">
            {r!.seats.map(s => (
              <span key={s} className="font-mono text-xs bg-gray-100 border border-gray-300 text-gray-800 px-2 py-1 rounded font-bold">{s}</span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-dashed border-gray-300 pt-3 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Resumo Financeiro</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded p-2">
            <p className="text-xs text-gray-500 mb-0.5">Total</p>
            <p className="font-bold text-sm text-gray-900">{fmt(r?.totalValue ?? 0)}</p>
          </div>
          <div className="bg-green-50 rounded p-2">
            <p className="text-xs text-gray-500 mb-0.5">Pago</p>
            <p className="font-bold text-sm text-green-700">{fmt(r?.paidValue ?? 0)}</p>
          </div>
          <div className={`rounded p-2 ${(r?.balance ?? 0) > 0 ? "bg-red-50" : "bg-green-50"}`}>
            <p className="text-xs text-gray-500 mb-0.5">Saldo</p>
            <p className={`font-bold text-sm ${(r?.balance ?? 0) > 0 ? "text-red-600" : "text-green-700"}`}>
              {fmt(r?.balance ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {qrDataUrl && (
        <div className="flex flex-col items-center gap-1.5 border-t border-dashed border-gray-300 pt-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Verificação</p>
          <img src={qrDataUrl} alt="QR Code de verificação" className="w-24 h-24" />
          <p className="text-xs text-gray-400">Aponte a câmera para verificar o voucher</p>
        </div>
      )}

      <div className="border-t border-gray-200 pt-2 text-center">
        <p className="text-xs text-gray-400">
          Emitido em {new Date(r?.createdAt ?? "").toLocaleString("pt-BR")} · Este voucher é válido mediante apresentação de documento de identidade.
        </p>
      </div>
    </div>
  );
}

export function VoucherModal({ reservation, open, onClose, autoDownload }: { reservation: Reservation | null; open: boolean; onClose: () => void; autoDownload?: boolean }) {
  const reservationId = reservation?.id ?? "";
  const { data: fullData, isLoading } = useGetReservation(reservationId, {
    query: { queryKey: ["voucher", reservationId], enabled: open && !!reservationId },
  });
  const r = fullData ?? reservation;
  const voucherRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const hasAutoDownloaded = useRef(false);

  useEffect(() => {
    const code = r?.voucherCode ?? r?.id ?? "";
    if (code) {
      QRCodeLib.toDataURL(code, { width: 112, margin: 1 })
        .then(url => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [r?.voucherCode, r?.id]);

  const handleDownloadPDF = useCallback(async () => {
    if (!voucherRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const [html2canvas, { default: jsPDF }] = await Promise.all([
        import("html2canvas").then(m => m.default),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(voucherRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`voucher-${r?.voucherCode ?? reservationId}.pdf`);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [r?.voucherCode, reservationId]);

  useEffect(() => {
    if (autoDownload && open && !isLoading && r && qrDataUrl && !hasAutoDownloaded.current) {
      hasAutoDownloaded.current = true;
      setTimeout(() => handleDownloadPDF(), 100);
    }
    if (!open) {
      hasAutoDownloaded.current = false;
    }
  }, [autoDownload, open, isLoading, r, qrDataUrl, handleDownloadPDF]);

  const handlePrint = useCallback(() => {
    if (!voucherRef.current) { window.print(); return; }
    const printEl = document.createElement("div");
    printEl.setAttribute("data-voucher-print", "true");
    printEl.style.cssText = "display:none;position:fixed;inset:0;background:white;z-index:99999;padding:20mm;box-sizing:border-box;";
    printEl.innerHTML = voucherRef.current.outerHTML;
    document.body.appendChild(printEl);

    const styleEl = document.createElement("style");
    styleEl.textContent = `@media print { body > *:not([data-voucher-print]) { display: none !important; } [data-voucher-print] { display: block !important; } }`;
    document.head.appendChild(styleEl);

    const cleanup = () => {
      if (document.body.contains(printEl)) document.body.removeChild(printEl);
      if (document.head.contains(styleEl)) document.head.removeChild(styleEl);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    window.print();

    setTimeout(cleanup, 3000);
  }, []);

  if (!reservation) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Voucher de Reserva</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            <div ref={voucherRef} className="bg-white p-4 rounded-lg border">
              <VoucherContent r={r} qrDataUrl={qrDataUrl} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={isGeneratingPdf}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <Button className="flex-1" onClick={handleDownloadPDF} disabled={isGeneratingPdf}>
                <Download className="mr-2 h-4 w-4" />
                {isGeneratingPdf ? "Gerando..." : "Baixar PDF"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  bank_transfer: "Transferência",
  cash: "Dinheiro",
  boleto: "Boleto",
};

function WizardStepIndicator({ step }: { step: number }) {
  const steps = ["Seleção", "Pagamento", "Confirmação"];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done ? "bg-primary border-primary text-primary-foreground" :
                active ? "border-primary text-primary bg-primary/10" :
                "border-muted-foreground/30 text-muted-foreground"
              }`}>
                {done ? "✓" : n}
              </div>
              <span className={`text-xs whitespace-nowrap ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>{label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-[-12px] transition-colors ${done ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewReservationWizard({ open, onClose, onSuccess, initialTripId }: { open: boolean; onClose: () => void; onSuccess: () => void; initialTripId?: string }) {
  const { data: tripsData } = useListTrips({ limit: 200, status: "published" });
  const { data: clientsData } = useListClients({ limit: 300 });
  const { data: boardingRaw } = useListBoardingLocations();
  const createReservation = useCreateReservation();
  const updateReservation = useUpdateReservation();
  const { toast } = useToast();

  const [step, setStep] = useState(1);

  const [selectedTripId, setSelectedTripId] = useState(initialTripId ?? "");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [boardingLocationId, setBoardingLocationId] = useState("");
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [manualSeats, setManualSeats] = useState("");
  const [tripComboOpen, setTripComboOpen] = useState(false);
  const [clientComboOpen, setClientComboOpen] = useState(false);

  const [totalValue, setTotalValue] = useState<number>(0);
  const [paidValue, setPaidValue] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [installments, setInstallments] = useState(1);
  const [hasInsurance, setHasInsurance] = useState(false);
  const [notes, setNotes] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; amount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const [redeemLoyalty, setRedeemLoyalty] = useState(false);
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);
  const [loyaltyAmountApplied, setLoyaltyAmountApplied] = useState<number>(0);

  const [referralCode, setReferralCode] = useState("");
  const [referralApplied, setReferralApplied] = useState<{ id: string; code: string; amount: number } | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  const [discountsOpen, setDiscountsOpen] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

  const validateCoupon = useValidateReservationCoupon();

  const { data: selectedTripFull } = useGetTrip(selectedTripId, {
    query: { queryKey: ["wizard-trip", selectedTripId], enabled: !!selectedTripId },
  });

  const { data: loyaltyInfo } = useGetClientLoyalty(selectedClientId, {
    query: { queryKey: ["wizard-loyalty", selectedClientId], enabled: !!selectedClientId, retry: false },
  });

  const allTrips = tripsData?.data ?? [];
  const allClients = clientsData?.data ?? [];

  const selectedTrip = tripsData?.data.find(t => t.id === selectedTripId);
  const selectedClient = clientsData?.data.find(c => c.id === selectedClientId);
  const selectedBoarding = (boardingRaw ?? []).find(b => b.id === boardingLocationId);

  const effectiveSeats = useMemo(() => {
    if (selectedSeats.length > 0) return selectedSeats;
    if (manualSeats.trim()) return manualSeats.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }, [selectedSeats, manualSeats]);

  useEffect(() => {
    if (selectedTripFull) {
      const price = selectedTripFull.priceAdult ?? 0;
      setTotalValue(price * effectiveSeats.length);
    }
  }, [selectedTripFull, effectiveSeats.length]);

  useEffect(() => {
    if (open) {
      setSelectedTripId(initialTripId ?? "");
    }
  }, [open, initialTripId]);

  // Mirror backend sequential cap: coupon → loyalty → referral, each capped to remaining
  const uiRemaining0 = totalValue;
  const uiCouponApplied = Math.round(Math.min(couponApplied?.amount ?? 0, uiRemaining0) * 100) / 100;
  const uiRemaining1 = Math.round((uiRemaining0 - uiCouponApplied) * 100) / 100;
  const uiLoyaltyApplied = Math.round(Math.min(loyaltyAmountApplied, uiRemaining1) * 100) / 100;
  const uiRemaining2 = Math.round((uiRemaining1 - uiLoyaltyApplied) * 100) / 100;
  const uiReferralApplied = Math.round(Math.min(referralApplied?.amount ?? 0, uiRemaining2) * 100) / 100;
  const totalDiscount = Math.round((uiCouponApplied + uiLoyaltyApplied + uiReferralApplied) * 100) / 100;
  const finalTotal = Math.max(0, Math.round((totalValue - totalDiscount) * 100) / 100);

  const resetWizard = () => {
    setStep(1);
    setSelectedTripId(""); setSelectedClientId(""); setBoardingLocationId("");
    setSelectedSeats([]); setManualSeats(""); setTripComboOpen(false); setClientComboOpen(false);
    setTotalValue(0); setPaidValue(0); setPaymentMethod("pix"); setInstallments(1);
    setHasInsurance(false); setNotes(""); setCreateError(null);
    setCouponCode(""); setCouponApplied(null); setCouponError(null);
    setRedeemLoyalty(false); setLoyaltyPointsToRedeem(0); setLoyaltyAmountApplied(0);
    setReferralCode(""); setReferralApplied(null); setReferralError(null);
    setDiscountsOpen(false);
  };

  const handleClose = () => { resetWizard(); onClose(); };

  const canGoNext1 = !!selectedTripId && !!selectedClientId && effectiveSeats.length > 0;

  const handleCouponApply = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true); setCouponError(null);
    try {
      const result = await validateCoupon.mutateAsync({ data: { code: couponCode.trim(), subtotal: totalValue } });
      if (result.valid) {
        setCouponApplied({ code: result.couponCode, amount: result.discountAmount });
        setCouponError(null);
      } else {
        setCouponError(result.message ?? "Cupom inválido");
        setCouponApplied(null);
      }
    } catch {
      setCouponError("Erro ao validar cupom");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleReferralApply = async () => {
    if (!referralCode.trim()) return;
    setReferralLoading(true); setReferralError(null);
    try {
      const result = await validateReferralCode(referralCode.trim());
      if (result.valid) {
        setReferralApplied({ id: result.referralId ?? "", code: referralCode.trim(), amount: result.bonusAmount });
        setReferralError(null);
      } else {
        setReferralError(result.message ?? "Código inválido");
        setReferralApplied(null);
      }
    } catch {
      setReferralError("Erro ao validar código de indicação");
    } finally {
      setReferralLoading(false);
    }
  };

  const handleConfirm = async () => {
    setCreateError(null);
    if (effectiveSeats.length === 0) {
      setCreateError("Selecione pelo menos um assento antes de confirmar.");
      return;
    }
    const seats = effectiveSeats;
    try {
      const created = await createReservation.mutateAsync({
        data: {
          tripId: selectedTripId,
          clientId: selectedClientId,
          seats,
          totalValue,
          paidValue: paidValue || undefined,
          paymentMethod,
          installments,
          notes: notes || undefined,
          hasInsurance,
          discountCouponCode: couponApplied?.code ?? null,
          discountCouponAmount: null,
          discountLoyaltyPoints: loyaltyPointsToRedeem > 0 ? loyaltyPointsToRedeem : null,
          discountLoyaltyAmount: null,
          discountReferralCode: referralApplied?.code ?? null,
          discountReferralAmount: null,
          discountTotal: null,
        },
      });
      const effectiveBoardingId = boardingLocationId && boardingLocationId !== "__none__" ? boardingLocationId : null;
      if (effectiveBoardingId && created?.id) {
        try {
          await updateReservation.mutateAsync({
            id: created.id,
            data: { boardingLocationId: effectiveBoardingId },
          });
        } catch {
          toast({ title: "Reserva criada", description: "Não foi possível salvar o ponto de embarque. Edite a reserva para ajustar.", variant: "default" });
        }
      }
      resetWizard();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = (err as { data?: { error?: string } })?.data?.error;
      setCreateError(apiError ?? (err instanceof Error ? err.message : null) ?? "Erro ao criar reserva");
    }
  };

  const balance = Math.max(0, finalTotal - paidValue);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Reserva</DialogTitle>
        </DialogHeader>

        <WizardStepIndicator step={step} />

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Viagem *</label>
                <Popover open={tripComboOpen} onOpenChange={setTripComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tripComboOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedTripId
                          ? (allTrips.find(t => t.id === selectedTripId)?.name ?? "Viagem não encontrada")
                          : "Selecionar viagem..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar viagem..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma viagem encontrada.</CommandEmpty>
                        <CommandGroup>
                          {allTrips.map(t => (
                            <CommandItem
                              key={t.id}
                              value={`${t.name} ${t.availableSeats ?? ""}`}
                              onSelect={() => {
                                setSelectedTripId(t.id);
                                setSelectedSeats([]);
                                setManualSeats("");
                                setTripComboOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedTripId === t.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="flex-1">{t.name}</span>
                              {t.availableSeats != null && (
                                <span className="text-xs text-muted-foreground ml-2">{t.availableSeats} vagas</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente *</label>
                <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientComboOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedClientId
                          ? (() => {
                              const cl = allClients.find(c => c.id === selectedClientId);
                              return cl ? `${cl.name} — ${cl.whatsapp}` : "Cliente não encontrado";
                            })()
                          : "Selecionar cliente..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por nome ou whatsapp..." />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {allClients.map(c => (
                            <CommandItem
                              key={c.id}
                              value={`${c.name} ${c.whatsapp}`}
                              onSelect={() => {
                                setSelectedClientId(c.id);
                                setClientComboOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedClientId === c.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="flex-1">{c.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{c.whatsapp}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(boardingRaw ?? []).length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Ponto de Embarque</label>
                <Select onValueChange={setBoardingLocationId} value={boardingLocationId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar ponto de embarque..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {(boardingRaw ?? []).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">Seleção de Assentos * <span className="font-normal text-muted-foreground">(obrigatório)</span></label>
              {selectedTripId ? (
                <SeatMapPicker
                  tripId={selectedTripId}
                  selectedSeats={selectedSeats}
                  onSeatsChange={seats => { setSelectedSeats(seats); setManualSeats(""); }}
                />
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/20">
                  Selecione uma viagem para ver o mapa de assentos.
                </div>
              )}
              <div className="mt-2">
                <label className="text-xs text-muted-foreground">Ou informe manualmente (separados por vírgula)</label>
                <Input
                  placeholder="Ex: 12, 13, 14"
                  value={manualSeats}
                  onChange={e => { setManualSeats(e.target.value); setSelectedSeats([]); }}
                  className="mt-1"
                  disabled={selectedSeats.length > 0}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => setStep(2)} disabled={!canGoNext1}>Próximo →</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor Total (R$) *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalValue}
                  onChange={e => setTotalValue(parseFloat(e.target.value) || 0)}
                />
                {selectedTripFull && (
                  <p className="text-xs text-muted-foreground">
                    Preço base: R$ {(selectedTripFull.priceAdult ?? 0).toFixed(2)}/pessoa × {effectiveSeats.length || 1} assento(s)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Valor Pago (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidValue}
                  onChange={e => setPaidValue(parseFloat(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">Valor já recebido no ato</p>
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
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Observações</label>
              <Input
                placeholder="Observações sobre a reserva..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hasInsuranceWizard"
                className="rounded"
                checked={hasInsurance}
                onChange={e => setHasInsurance(e.target.checked)}
              />
              <label htmlFor="hasInsuranceWizard" className="text-sm">Incluir seguro de viagem</label>
            </div>

            <div className="border rounded-lg bg-muted/20">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
                onClick={() => setDiscountsOpen(v => !v)}
              >
                <span className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" />
                  Descontos e Benefícios
                  {totalDiscount > 0 && (
                    <span className="text-xs font-normal text-green-600 ml-1">−R$ {totalDiscount.toFixed(2)}</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{discountsOpen ? "▲" : "▼"}</span>
              </button>

              {discountsOpen && (
                <div className="px-4 pb-4 space-y-4 border-t pt-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cupom de Desconto</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Código do cupom"
                    value={couponCode}
                    onChange={e => { setCouponCode(e.target.value); setCouponApplied(null); setCouponError(null); }}
                    disabled={!!couponApplied}
                    className="flex-1"
                  />
                  {couponApplied ? (
                    <Button variant="outline" size="sm" onClick={() => { setCouponApplied(null); setCouponCode(""); }}>Remover</Button>
                  ) : (
                    <Button size="sm" onClick={handleCouponApply} disabled={couponLoading || !couponCode.trim() || totalValue <= 0}>
                      {couponLoading ? "..." : "Aplicar"}
                    </Button>
                  )}
                </div>
                {couponApplied && (
                  <p className="text-xs text-green-600 font-medium">✓ Cupom aplicado: −R$ {uiCouponApplied.toFixed(2)}</p>
                )}
                {couponError && <p className="text-xs text-destructive">{couponError}</p>}
              </div>

              {loyaltyInfo ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      id="redeemLoyaltyCheck"
                      type="checkbox"
                      checked={redeemLoyalty}
                      onChange={e => {
                        setRedeemLoyalty(e.target.checked);
                        if (!e.target.checked) { setLoyaltyPointsToRedeem(0); setLoyaltyAmountApplied(0); }
                      }}
                    />
                    <label htmlFor="redeemLoyaltyCheck" className="text-xs font-medium cursor-pointer">
                      Resgatar pontos de fidelidade
                      <span className="ml-2 text-primary font-semibold">{loyaltyInfo.availablePoints} pts disponíveis</span>
                    </label>
                  </div>
                  {redeemLoyalty && (
                    <>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          min={loyaltyInfo.minRedeemPoints}
                          max={loyaltyInfo.availablePoints}
                          step={loyaltyInfo.minRedeemPoints}
                          placeholder={`Mín. ${loyaltyInfo.minRedeemPoints} pts`}
                          value={loyaltyPointsToRedeem || ""}
                          onChange={e => {
                            const pts = parseInt(e.target.value) || 0;
                            const capped = Math.min(pts, loyaltyInfo.availablePoints);
                            setLoyaltyPointsToRedeem(capped);
                            setLoyaltyAmountApplied(Math.round(capped * loyaltyInfo.realPerPoint * 100) / 100);
                          }}
                          className="flex-1"
                        />
                        {loyaltyPointsToRedeem > 0 && (
                          <Button variant="outline" size="sm" onClick={() => { setLoyaltyPointsToRedeem(0); setLoyaltyAmountApplied(0); }}>Limpar</Button>
                        )}
                      </div>
                      {uiLoyaltyApplied > 0 && (
                        <p className="text-xs text-green-600 font-medium">✓ Desconto fidelidade: −R$ {uiLoyaltyApplied.toFixed(2)}</p>
                      )}
                      {loyaltyPointsToRedeem > 0 && loyaltyPointsToRedeem < loyaltyInfo.minRedeemPoints && (
                        <p className="text-xs text-destructive">Mínimo de {loyaltyInfo.minRedeemPoints} pontos para resgate</p>
                      )}
                    </>
                  )}
                </div>
              ) : selectedClientId ? (
                <p className="text-xs text-muted-foreground italic">Este cliente não possui cadastro no programa de fidelidade.</p>
              ) : null}

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Código de Indicação</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Código de indicação"
                    value={referralCode}
                    onChange={e => { setReferralCode(e.target.value); setReferralApplied(null); setReferralError(null); }}
                    disabled={!!referralApplied}
                    className="flex-1"
                  />
                  {referralApplied ? (
                    <Button variant="outline" size="sm" onClick={() => { setReferralApplied(null); setReferralCode(""); }}>Remover</Button>
                  ) : (
                    <Button size="sm" onClick={handleReferralApply} disabled={referralLoading || !referralCode.trim()}>
                      {referralLoading ? "..." : "Validar"}
                    </Button>
                  )}
                </div>
                {referralApplied && (
                  <p className="text-xs text-green-600 font-medium">✓ Indicação aplicada: −R$ {uiReferralApplied.toFixed(2)}</p>
                )}
                {referralError && <p className="text-xs text-destructive">{referralError}</p>}
              </div>

              {totalDiscount > 0 && (
                <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                  <span>Total com desconto:</span>
                  <span className="text-primary">R$ {finalTotal.toFixed(2)} <span className="text-muted-foreground line-through text-xs font-normal ml-1">R$ {totalValue.toFixed(2)}</span></span>
                </div>
              )}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Anterior</Button>
              <Button onClick={() => setStep(3)} disabled={totalValue <= 0}>Próximo →</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-xl border p-4 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Resumo da Reserva</h3>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Viagem</p>
                  <p className="font-semibold">{selectedTrip?.name ?? "—"}</p>
                  {selectedTrip?.destination && <p className="text-xs text-muted-foreground">{selectedTrip.destination}</p>}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Cliente</p>
                  <p className="font-semibold">{selectedClient?.name ?? "—"}</p>
                  {selectedClient?.whatsapp && <p className="text-xs text-muted-foreground">{selectedClient.whatsapp}</p>}
                </div>
                {selectedBoarding && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Ponto de Embarque</p>
                    <p className="font-semibold">{selectedBoarding.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Assentos</p>
                  <p className="font-semibold">{effectiveSeats.length > 0 ? effectiveSeats.join(", ") : "A definir"}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs mb-0.5">Valor Base</p>
                  <p className={`font-bold text-base ${totalDiscount > 0 ? "line-through text-muted-foreground" : ""}`}>R$ {totalValue.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs mb-0.5">Valor Pago</p>
                  <p className="font-bold text-base text-green-600">R$ {paidValue.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs mb-0.5">Saldo</p>
                  <p className={`font-bold text-base ${balance > 0 ? "text-destructive" : "text-green-600"}`}>
                    R$ {balance.toFixed(2)}
                  </p>
                </div>
              </div>

              {totalDiscount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1.5 text-sm">
                  <p className="font-semibold text-green-800 text-xs uppercase tracking-wide">Descontos Aplicados</p>
                  {uiCouponApplied > 0 && couponApplied && (
                    <div className="flex justify-between text-green-700">
                      <span>Cupom ({couponApplied.code})</span>
                      <span>−R$ {uiCouponApplied.toFixed(2)}</span>
                    </div>
                  )}
                  {uiLoyaltyApplied > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Fidelidade ({loyaltyPointsToRedeem} pts)</span>
                      <span>−R$ {uiLoyaltyApplied.toFixed(2)}</span>
                    </div>
                  )}
                  {uiReferralApplied > 0 && referralApplied && (
                    <div className="flex justify-between text-green-700">
                      <span>Indicação ({referralApplied.code})</span>
                      <span>−R$ {uiReferralApplied.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-green-800 pt-1 border-t border-green-200">
                    <span>Total com Desconto</span>
                    <span>R$ {finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Forma de Pagamento</p>
                  <p className="font-semibold">{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Parcelas</p>
                  <p className="font-semibold">{installments}×</p>
                </div>
                {hasInsurance && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Seguro</p>
                    <p className="font-semibold">Incluso</p>
                  </div>
                )}
                {notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-0.5">Observações</p>
                    <p className="font-semibold">{notes}</p>
                  </div>
                )}
              </div>
            </div>

            {createError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>← Anterior</Button>
              <Button onClick={handleConfirm} disabled={createReservation.isPending}>
                {createReservation.isPending ? "Criando..." : "Confirmar Reserva"}
              </Button>
            </div>
          </div>
        )}
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
  const [voucherRes, setVoucherRes] = useState<Reservation | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [initialTripId, setInitialTripId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tripId = params.get("tripId") ?? undefined;
    const openNew = params.get("new") === "true";
    if (openNew || tripId) {
      setInitialTripId(tripId);
      setIsCreateOpen(true);
      params.delete("tripId");
      params.delete("new");
      const remaining = params.toString();
      history.replaceState(null, "", window.location.pathname + (remaining ? `?${remaining}` : ""));
    }
  }, []);

  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [confirmCheckinRes, setConfirmCheckinRes] = useState<Reservation | null>(null);

  const activeDetailId = detailId ?? idFromRoute;

  const { data, isLoading, refetch } = useListReservations({
    status: statusFilter || undefined,
    tripId: tripFilter || undefined,
    search: search || undefined,
    createdById: sellerFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: 20,
  });
  const { data: stats, refetch: refetchStats } = useGetReservationStats();
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: usersRaw } = useListUsers();
  const { data: boardingRaw } = useListBoardingLocations();
  const updateReservation = useUpdateReservation();
  const checkInReservation = useCheckInReservation();
  const { toast } = useToast();

  const sellers = useMemo(() => (usersRaw ?? []).filter(u => u.role === "vendedor" || u.role === "agencia"), [usersRaw]);
  const boardingMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of (boardingRaw ?? [])) m[b.id] = b.name;
    return m;
  }, [boardingRaw]);

  const reservations = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const handleCheckin = async (r: Reservation) => {
    try {
      await checkInReservation.mutateAsync({ id: r.id });
      refetch();
      refetchStats();
    } catch {
      toast({ title: "Não foi possível confirmar o check-in", description: "Tente novamente ou contate o suporte.", variant: "destructive" });
    }
  };
  const handleCancel = async (id: string) => {
    try {
      await updateReservation.mutateAsync({ id, data: { status: "cancelled" } });
      refetch();
      refetchStats();
    } catch {
      toast({ title: "Não foi possível cancelar a reserva", description: "Tente novamente ou contate o suporte.", variant: "destructive" });
    }
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
        <StatCard icon={CalendarCheck} label="Total de Reservas" value={stats?.total ?? "—"} color="text-blue-600" />
        <StatCard icon={CheckCircle} label="Confirmadas" value={stats?.confirmed ?? "—"} color="text-green-600" />
        <StatCard icon={Clock} label="Pendentes" value={stats?.pending ?? "—"} color="text-yellow-600" />
        <StatCard icon={TrendingDown} label="Valor a Receber" value={stats ? fmt(stats.totalOutstanding) : "—"} color="text-orange-600" sub="Saldo em aberto" />
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
                        <DropdownMenuItem onClick={() => setVoucherRes(r)}>
                          <QrCode className="w-4 h-4 mr-2" /> Ver Voucher
                        </DropdownMenuItem>
                        {r.status !== "cancelled" && r.status !== "completed" && (
                          <DropdownMenuItem onClick={() => setConfirmCheckinRes(r)}>
                            <CheckCircle className="w-4 h-4 mr-2" /> Check-in
                          </DropdownMenuItem>
                        )}
                        {r.status !== "cancelled" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setConfirmCancelId(r.id)}
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
        onSuccess={() => { refetch(); refetchStats(); }}
      />
      <NewReservationWizard
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setInitialTripId(undefined); }}
        onSuccess={() => { refetch(); refetchStats(); setInitialTripId(undefined); }}
        initialTripId={initialTripId}
      />
      {editId && (
        <EditReservationModal
          reservationId={editId}
          open={!!editId}
          onClose={() => setEditId(null)}
          onSuccess={() => { refetch(); refetchStats(); setEditId(null); }}
        />
      )}
      <VoucherModal
        reservation={voucherRes}
        open={!!voucherRes}
        onClose={() => setVoucherRes(null)}
      />

      <AlertDialog open={!!confirmCancelId} onOpenChange={o => { if (!o) setConfirmCancelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Reserva</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta reserva? As vagas serão devolvidas para a viagem. Esta ação não pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmCancelId) handleCancel(confirmCancelId); setConfirmCancelId(null); }}
            >
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCheckinRes} onOpenChange={o => { if (!o) setConfirmCheckinRes(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-in</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar check-in para <strong>{confirmCheckinRes?.client?.name}</strong>? Voucher: <span className="font-mono font-semibold">{confirmCheckinRes?.voucherCode}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmCheckinRes) { handleCheckin(confirmCheckinRes); setConfirmCheckinRes(null); } }}
            >
              Confirmar Check-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditReservationModal({ reservationId, open, onClose, onSuccess }: { reservationId: string; open: boolean; onClose: () => void; onSuccess: () => void }) {
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
    const seatsRaw = (fd.get("seats") as string || "").trim();
    await updateReservation.mutateAsync({
      id: reservationId,
      data: {
        status: (editStatus as "pending" | "confirmed" | "completed" | "cancelled") || undefined,
        paymentMethod: paymentMethod || undefined,
        notes: (fd.get("notes") as string) || undefined,
        totalValue: totalValueRaw ? parseFloat(totalValueRaw) : undefined,
        installments: installmentsRaw ? parseInt(installmentsRaw) : undefined,
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
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="confirmed">Confirmada</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
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
              <label className="text-sm font-medium">Assentos</label>
              <Input
                name="seats"
                defaultValue={(data.seats ?? []).join(", ")}
                placeholder="Ex: 1, 2, 3 (separados por vírgula)"
              />
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
