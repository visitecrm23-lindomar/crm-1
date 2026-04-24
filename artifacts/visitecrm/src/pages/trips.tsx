import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListTrips, useCreateTrip, useGetTrip, useUpdateTrip, useDeleteTrip,
  useGetTripSeatMap, getGetTripSeatMapQueryKey, useGetDashboardUpcomingTrips, useListReservations, useListClients, useCreateReservation, useUpdateReservation, useCreateClient,
  useGetTripBoardingPanel, useCheckInPassenger, useUndoCheckInPassenger, useSyncTripPassengers,
  useUpdatePassengerBoarding,
  useListLayouts, useGetMe,
  useListTripCosts, useCreateTripCost, useUpdateTripCost, useDeleteTripCost,
} from "@workspace/api-client-react";
import type { Trip, Seat, BoardingPassenger, VehicleLayout, LayoutCell, TripCost, TripCostSummary } from "@workspace/api-client-react";
import { storeApi } from "@/lib/storeApi";
import { Client360Modal } from "@/components/client360-modal";
import { PlanLimitWall, usePlanLimitError } from "@/components/plan-limit-wall";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getSeatColor, getCellIcon } from "@/components/SeatMapPicker";
import {
  Plus, Search, MapPin, Calendar, Users, Bus, Edit, Trash2, Eye, ChevronsLeft, ChevronsRight,
  LayoutGrid, List, ChevronLeft, ChevronRight, ChevronDown, ArrowLeft, Check, X, Download, Send, Copy,
  AlertCircle, DollarSign, ClipboardList, LogIn, RotateCcw, CheckCircle, UserRound, RefreshCw,
  ShoppingBag, Loader2, Clock, Star, CheckCircle2, XCircle, MessageSquare, Pencil, Phone,
  TrendingUp, TrendingDown, Receipt, Banknote, PiggyBank, Wallet,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CoverImageUpload } from "@/components/cover-image-upload";
import { GalleryUpload } from "@/components/gallery-upload";
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isToday, startOfWeek, addDays,
  addWeeks, subWeeks, differenceInHours, differenceInMinutes,
} from "date-fns";
import { calculateTripDuration } from "@/lib/tripDuration";
import { ptBR } from "date-fns/locale";

function TiptapEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value && value !== undefined) {
      editor.commands.setContent(value);
    }
  }, [value]);

  if (!editor) return null;
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex gap-1 border-b bg-muted/50 p-1 flex-wrap">
        {[
          { label: "N", cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold"), title: "Negrito" },
          { label: "I", cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic"), title: "Itálico" },
          { label: "S̶", cmd: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive("strike"), title: "Tachado" },
        ].map(btn => (
          <button key={btn.title} title={btn.title} type="button"
            className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${btn.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={btn.cmd}
          >
            {btn.label}
          </button>
        ))}
        <div className="w-px bg-border mx-0.5" />
        {[
          { label: "H1", cmd: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }), title: "Título 1" },
          { label: "H2", cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }), title: "Título 2" },
        ].map(btn => (
          <button key={btn.title} title={btn.title} type="button"
            className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${btn.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={btn.cmd}
          >
            {btn.label}
          </button>
        ))}
        <div className="w-px bg-border mx-0.5" />
        <button title="Lista com marcadores" type="button"
          className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${editor.isActive("bulletList") ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Lista
        </button>
        <button title="Lista numerada" type="button"
          className={`px-2.5 py-1 text-sm rounded font-medium transition-colors ${editor.isActive("orderedList") ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Lista
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[120px] focus-within:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]"
      />
    </div>
  );
}

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string) {
  try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return d; }
}

function getCountdownLabel(date: string) {
  try {
    const target = parseISO(date);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs < 0) return "Encerrado";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (hours < 1) return "Em breve";
    if (hours < 24) return `${hours} horas`;
    if (days === 1) return "Amanhã";
    if (days < 14) return `${days} dias`;
    return `${Math.round(days / 7)} semanas`;
  } catch {
    return "";
  }
}

function TripCountdown({ date }: { date: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 60000);
    return () => window.clearInterval(id);
  }, []);
  const label = getCountdownLabel(date);
  const urgent = (() => {
    try {
      const diff = parseISO(date).getTime() - Date.now();
      return diff >= 0 && diff < 1000 * 60 * 60 * 24;
    } catch {
      return false;
    }
  })();
  return (
    <Badge variant={label === "Encerrado" || urgent ? "destructive" : "secondary"} className="text-xs">
      {label || "Em breve"}
    </Badge>
  );
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:      { label: "Rascunho",   color: "bg-gray-100 text-gray-600" },
  active:     { label: "Ativa",      color: "bg-green-100 text-green-700" },
  confirmed:  { label: "Confirmada", color: "bg-blue-100 text-blue-700" },
  completed:  { label: "Concluída",  color: "bg-purple-100 text-purple-700" },
  cancelled:  { label: "Cancelada",  color: "bg-red-100 text-red-700" },
};
const VEHICLE_TYPES = ["Ônibus", "Micro-ônibus", "Van", "Carro", "Outro"];
const TRIP_TYPES = ["excursao", "bate_volta", "trilha", "rota", "transfer", "pacote_fechado", "personalizada"];
const TRIP_TYPE_LABELS: Record<string, string> = {
  excursao: "Excursão", bate_volta: "Bate-Volta", trilha: "Trilha", rota: "Rota",
  transfer: "Transfer", pacote_fechado: "Pacote Fechado", personalizada: "Viagem Personalizada",
  excursion: "Excursão", package: "Pacote", custom: "Personalizado",
};

function OccupancyBar({ reserved, confirmed, total }: { reserved: number; confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((reserved + confirmed) / total * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{reserved + confirmed}/{total} assentos</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const DOCUMENT_TYPES = ["RG", "CNH", "PASSAPORTE", "Certidão de Nascimento"] as const;

function PassengerObsModal({ passenger, tripId, open, onClose, onSaved }: {
  passenger: BoardingPassenger | null;
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const updateBoarding = useUpdatePassengerBoarding();
  const [form, setForm] = useState({ passengerPhone: "", documentType: "", specialNeeds: "", observations: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (passenger) {
      setForm({
        passengerPhone: passenger.passengerPhone ?? "",
        documentType: passenger.documentType ?? "",
        specialNeeds: passenger.specialNeeds ?? "",
        observations: passenger.observations ?? "",
      });
    }
  }, [passenger]);

  const handleSave = async () => {
    if (!passenger) return;
    setSaving(true);
    try {
      await updateBoarding.mutateAsync({
        tripId,
        passengerId: passenger.id,
        data: {
          passengerPhone: form.passengerPhone || null,
          documentType: form.documentType || null,
          specialNeeds: form.specialNeeds || null,
          observations: form.observations || null,
        },
      });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Erro ao salvar observações", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Informações do Passageiro
          </DialogTitle>
        </DialogHeader>
        {passenger && (
          <div className="space-y-4 py-1">
            <div className="bg-muted/50 rounded p-2 text-sm font-medium">{passenger.name}</div>
            <div className="space-y-1">
              <Label htmlFor="obs-phone" className="text-xs">Telefone do passageiro</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input id="obs-phone" placeholder="(00) 00000-0000" value={form.passengerPhone} className="pl-8"
                  onChange={e => setForm(f => ({ ...f, passengerPhone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-doctype" className="text-xs">Tipo de documento</Label>
              <Select value={form.documentType || "__none__"} onValueChange={v => setForm(f => ({ ...f, documentType: v === "__none__" ? "" : v }))}>
                <SelectTrigger id="obs-doctype"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Não informado —</SelectItem>
                  {DOCUMENT_TYPES.map(dt => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-special" className="text-xs">Necessidades especiais</Label>
              <Input id="obs-special" placeholder="Ex: cadeirante, gestante, alergia..." value={form.specialNeeds}
                onChange={e => setForm(f => ({ ...f, specialNeeds: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-notes" className="text-xs">Observações gerais</Label>
              <Textarea id="obs-notes" placeholder="Anotações, restrições alimentares, medicamentos..." rows={3} value={form.observations}
                onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Salvando...</> : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BoardingPanelModal({ tripId, tripName, open, onClose }: { tripId: string; tripName: string; open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: panel, isLoading, refetch } = useGetTripBoardingPanel(tripId, {
    query: { queryKey: ["boarding-panel", tripId], enabled: open && !!tripId },
  });

  const { data: reservationsData } = useListReservations({ tripId, limit: 200 }, {
    query: { queryKey: ["reservations-boarding", tripId], enabled: open && !!tripId },
  });

  const reservationClientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reservationsData?.data ?? []) {
      if (r.clientId) map.set(r.id, r.clientId);
    }
    return map;
  }, [reservationsData]);

  const checkIn = useCheckInPassenger();
  const undoCheckIn = useUndoCheckInPassenger();
  const syncPassengers = useSyncTripPassengers();
  const updateBoarding = useUpdatePassengerBoarding();
  const [syncing, setSyncing] = useState(false);
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(null);
  const [editingPassenger, setEditingPassenger] = useState<BoardingPassenger | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPassengers.mutateAsync({ id: tripId });
      await refetch();
      if (result.created > 0) {
        toast({ title: `${result.created} passageiro(s) sincronizado(s)`, description: "O painel foi atualizado." });
      } else {
        toast({ title: "Tudo sincronizado", description: "Nenhum passageiro novo a adicionar." });
      }
    } catch {
      toast({ title: "Erro ao sincronizar passageiros", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckIn = async (p: BoardingPassenger) => {
    try {
      await checkIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: `${p.name} embarcou`, description: "Check-in individual registrado." });
    } catch {
      toast({ title: "Erro ao fazer check-in", variant: "destructive" });
    }
  };

  const handleUndoCheckIn = async (p: BoardingPassenger) => {
    try {
      await undoCheckIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: "Check-in desfeito" });
    } catch {
      toast({ title: "Erro ao desfazer check-in", variant: "destructive" });
    }
  };

  const handleBoardingLocationChange = async (p: BoardingPassenger, locationId: string | null) => {
    setUpdatingLocationId(p.id);
    try {
      await updateBoarding.mutateAsync({ tripId, passengerId: p.id, data: { boardingLocationId: locationId } });
      await refetch();
    } catch {
      toast({ title: "Erro ao atualizar local de embarque", variant: "destructive" });
    } finally {
      setUpdatingLocationId(null);
    }
  };

  const boardingPoints: BoardingPoint[] = panel?.boardingPoints ?? [];
  const passengers = panel?.passengers ?? [];
  const filtered = search
    ? passengers.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.seatNumber?.toLowerCase().includes(search.toLowerCase()) ||
        (p.reservationNumber ?? p.voucherCode).toLowerCase().includes(search.toLowerCase()) ||
        p.clientName.toLowerCase().includes(search.toLowerCase())
      )
    : passengers;

  const pct = panel && panel.totalPassengers > 0
    ? Math.round((panel.checkedIn / panel.totalPassengers) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Painel de Embarque — {tripName}
              </DialogTitle>
              {panel?.manifestNumber && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">Manifesto: {panel.manifestNumber}</p>
              )}
            </div>
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5 mr-2"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-700">{panel?.checkedIn ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Embarcados</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{(panel?.totalPassengers ?? 0) - (panel?.checkedIn ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Pendentes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{panel?.totalPassengers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{pct}%</p>
                  <p className="text-xs text-muted-foreground">embarque</p>
                </div>
              </div>
              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, assento ou nº de reserva..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{passengers.length === 0 ? "Nenhum passageiro cadastrado nesta viagem" : "Nenhum resultado encontrado"}</p>
                </div>
              ) : filtered.map(p => {
                const isCheckedIn = !!p.checkedInAt;
                const currentLocationId = p.boardingLocationId ?? "";
                const isUpdatingThis = updatingLocationId === p.id;
                const hasObs = !!(p.observations || p.specialNeeds);
                return (
                  <div key={p.id} className={`p-3 rounded-lg border ${isCheckedIn ? "bg-green-50 border-green-200" : "bg-muted/30"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.seatNumber && (
                            <span className="font-mono text-xs bg-gray-100 border border-gray-300 px-2 py-0.5 rounded font-bold">{p.seatNumber}</span>
                          )}
                          <span className="font-medium text-sm">{p.name}</span>
                          {hasObs && (
                            <span title={[p.specialNeeds, p.observations].filter(Boolean).join(" | ")}
                              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 cursor-help">
                              <MessageSquare className="w-3 h-3" />
                            </span>
                          )}
                          {isCheckedIn && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold border border-green-200">
                              <CheckCircle className="w-3 h-3" />
                              {new Date(p.checkedInAt!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                          <span>{p.clientName}</span>
                          {p.cpf && <span>CPF: {p.cpf}</span>}
                          <span className="font-mono opacity-70">{p.reservationNumber ?? p.voucherCode}</span>
                        </div>
                      </div>
                      <div className="shrink-0 ml-2 flex items-center gap-1">
                        <Button
                          size="sm" variant="outline" className={`h-8 w-8 p-0 ${hasObs ? "text-amber-600 border-amber-300" : ""}`}
                          onClick={() => setEditingPassenger(p)}
                          title="Editar informações do passageiro"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {reservationClientMap.get(p.reservationId) && (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs gap-1"
                            onClick={() => setClient360Id(reservationClientMap.get(p.reservationId)!)}
                          >
                            <UserRound className="w-3.5 h-3.5" /> Perfil 360°
                          </Button>
                        )}
                        {isCheckedIn ? (
                          <Button
                            size="sm" variant="outline" className="h-8 text-xs text-muted-foreground gap-1"
                            onClick={() => handleUndoCheckIn(p)}
                            disabled={undoCheckIn.isPending}
                          >
                            <RotateCcw className="w-3 h-3" /> Desfazer
                          </Button>
                        ) : (
                          <Button
                            size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                            onClick={() => handleCheckIn(p)}
                            disabled={checkIn.isPending}
                          >
                            <LogIn className="w-3 h-3" /> Embarcar
                          </Button>
                        )}
                      </div>
                    </div>
                    {boardingPoints.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Select
                          value={currentLocationId || "__none__"}
                          onValueChange={v => handleBoardingLocationChange(p, v === "__none__" ? null : v)}
                          disabled={isUpdatingThis}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1 max-w-xs">
                            <SelectValue placeholder="Ponto de embarque..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Não definido —</SelectItem>
                            {boardingPoints.map(bp => (
                              <SelectItem key={bp.id} value={bp.id}>
                                {bp.name}{bp.time ? ` (${bp.time})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isUpdatingThis && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
      <Client360Modal open={!!client360Id} onClose={() => setClient360Id(null)} clientId={client360Id} />
      <PassengerObsModal
        passenger={editingPassenger}
        tripId={tripId}
        open={!!editingPassenger}
        onClose={() => setEditingPassenger(null)}
        onSaved={() => refetch()}
      />
    </Dialog>
  );
}

export function TripList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [boardingTrip, setBoardingTrip] = useState<{ id: string; name: string } | null>(null);
  const [publishingTrip, setPublishingTrip] = useState<Trip | null>(null);
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
  const isVendedor = me?.role === "vendedor";

  const { data: tripsData, isLoading, refetch } = useListTrips({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page, limit: 12,
  });
  const createTrip = useCreateTrip();
  const deleteTrip = useDeleteTrip();
  const { data: upcomingTrips = [] } = useGetDashboardUpcomingTrips();

  const { data: allTrips } = useListTrips({ limit: 100 });

  const trips = useMemo(() => {
    let data = tripsData?.data ?? [];
    if (typeFilter !== "all") data = data.filter(t => t.type === typeFilter);
    if (dateFilter) {
      const from = new Date(dateFilter);
      data = data.filter(t => { try { return parseISO(t.departureDate) >= from; } catch { return true; } });
    }
    return data;
  }, [tripsData, typeFilter, dateFilter]);

  const stats = useMemo(() => {
    const all = allTrips?.data ?? [];
    const active = all.filter(t => t.status === "active" || t.status === "confirmed");
    const totalSeats = active.reduce((acc, t) => acc + t.totalCapacity, 0);
    const occupiedSeats = active.reduce((acc, t) => acc + t.reservedSeats + t.confirmedSeats, 0);
    const totalRevenue = active.reduce((acc, t) => acc + (t.reservedSeats + t.confirmedSeats) * t.priceAdult, 0);
    return { total: all.length, active: active.length, occupancyRate: totalSeats > 0 ? Math.round(occupiedSeats / totalSeats * 100) : 0, totalRevenue };
  }, [allTrips]);

  const handleDelete = async (id: string) => {
    await deleteTrip.mutateAsync({ id });
    setDeletingId(null);
    refetch();
  };

  const handleDuplicate = async (trip: Trip) => {
    await createTrip.mutateAsync({
      data: {
        name: `${trip.name} (cópia)`,
        description: trip.description ?? undefined,
        destination: trip.destination,
        destinationCity: trip.destinationCity,
        destinationState: trip.destinationState,
        type: trip.type,
        category: trip.category,
        departureDate: trip.departureDate.split("T")[0],
        returnDate: trip.returnDate?.split("T")[0],
        totalCapacity: trip.totalCapacity,
        priceAdult: trip.priceAdult,
        priceChild: trip.priceChild ?? undefined,
        priceSenior: trip.priceSenior ?? undefined,
        inclusions: trip.inclusions,
        exclusions: trip.exclusions,
        seatLayout: trip.seatLayout ?? "2x2",
        vehicleType: trip.vehicleType ?? undefined,
        vehiclePlate: trip.vehiclePlate ?? undefined,
        driverName: trip.driverName ?? undefined,
        coverImage: trip.coverImage ?? undefined,
        boardingPoints: trip.boardingPoints ?? [],
        itinerary: trip.itinerary ?? undefined,
        fixedCosts: trip.fixedCosts ?? undefined,
        variableCosts: trip.variableCosts ?? undefined,
        gallery: trip.gallery ?? [],
      },
    });
    refetch();
  };

  const totalPages = Math.ceil((tripsData?.total ?? 0) / 12);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Viagens</h1>
          <p className="text-muted-foreground text-sm">
            {isVendedor ? "Visualize as excursões e pacotes disponíveis" : "Gerencie excursões e pacotes da agência"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/trips/calendar"><Button variant="outline"><Calendar className="w-4 h-4 mr-2" />Calendário</Button></Link>
          {!isVendedor && (
            <Link href="/trips/new"><Button><Plus className="w-4 h-4 mr-2" />Nova Viagem</Button></Link>
          )}
        </div>
      </div>

      {isVendedor && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Você está no modo visualização. Apenas a agência pode criar ou editar viagens.</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total de Viagens", value: stats.total, icon: MapPin, color: "text-blue-600" },
          { label: "Viagens Ativas", value: stats.active, icon: Calendar, color: "text-green-600" },
          { label: "Taxa de Ocupação", value: `${stats.occupancyRate}%`, icon: Users, color: "text-amber-600" },
          { label: "Receita Estimada", value: formatCurrency(stats.totalRevenue), icon: DollarSign, color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2" />
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Próximas Partidas</h2>
            <Badge variant="outline" className="text-xs">{upcomingTrips.length}</Badge>
          </div>
          <div className="space-y-3">
            {upcomingTrips.slice(0, 3).map((trip) => (
              <div key={trip.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{trip.name}</p>
                    <p className="text-xs text-muted-foreground">{trip.destination}</p>
                  </div>
                  <TripCountdown date={trip.departureDate} />
                </div>
                <OccupancyBar reserved={trip.totalCapacity - trip.availableSeats} confirmed={0} total={trip.totalCapacity} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar viagens..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{TRIP_TYPE_LABELS[t] ?? t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setPage(1); }} className="w-40" title="Filtrar por data de saída (a partir de)" />
        {(search || statusFilter !== "all" || typeFilter !== "all" || dateFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setDateFilter(""); setPage(1); }}>
            <X className="w-4 h-4 mr-1" />Limpar
          </Button>
        )}
        <div className="flex border rounded-md overflow-hidden ml-auto">
          <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="rounded-none h-9 w-9" onClick={() => setViewMode("grid")}><LayoutGrid className="w-4 h-4" /></Button>
          <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="rounded-none h-9 w-9" onClick={() => setViewMode("list")}><List className="w-4 h-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma viagem encontrada</p>
          <p className="text-sm mt-1">{isVendedor ? "Nenhuma viagem disponível no momento" : "Crie sua primeira viagem para começar"}</p>
          {!isVendedor && <Link href="/trips/new"><Button className="mt-4">Nova Viagem</Button></Link>}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} isVendedor={isVendedor} onDelete={() => setDeletingId(trip.id)} onDuplicate={() => handleDuplicate(trip)} onBoarding={() => setBoardingTrip({ id: trip.id, name: trip.name })} navigate={navigate} />
          ))}
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          {trips.map((trip, i) => (
            <div key={trip.id} className={`flex items-center gap-4 p-4 ${i > 0 ? "border-t" : ""}`}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{trip.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                  {trip.originCity && <><span className="text-blue-600 font-medium">{trip.originCity}</span><span>→</span></>}
                  <span>{trip.destinationCity}, {trip.destinationState}</span>
                  <span>·</span>
                  <span>{formatDate(trip.departureDate)}{trip.departureTime ? ` às ${trip.departureTime}` : ""}</span>
                  <TripCountdown date={trip.departureDate} />
                </p>
              </div>
              <div className="hidden md:block w-40">
                <OccupancyBar reserved={trip.reservedSeats} confirmed={trip.confirmedSeats} total={trip.totalCapacity} />
              </div>
              <Badge className={STATUS_MAP[trip.status]?.color}>{STATUS_MAP[trip.status]?.label ?? trip.status}</Badge>
              <div className="flex gap-1">
                <Link href={`/trips/${trip.id}/passengers-overview`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Visão Geral"><Eye className="w-4 h-4" /></Button></Link>
                <Link href={`/trips/${trip.id}/passengers`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Passageiros"><Users className="w-4 h-4" /></Button></Link>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-700" onClick={() => setBoardingTrip({ id: trip.id, name: trip.name })} title="Painel de Embarque"><ClipboardList className="w-4 h-4" /></Button>
                <Link href={`/trips/${trip.id}/seat-map`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Mapa de Assentos"><Bus className="w-4 h-4" /></Button></Link>
                {!isVendedor && <Link href={`/trips/${trip.id}/edit`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Editar"><Edit className="w-4 h-4" /></Button></Link>}
                {!isVendedor && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDuplicate(trip)} title="Duplicar"><Copy className="w-4 h-4" /></Button>}
                {!isVendedor && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeletingId(trip.id)} title="Excluir"><Trash2 className="w-4 h-4" /></Button>}
                {!isVendedor && <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => setPublishingTrip(trip)} title="Publicar na Loja"><ShoppingBag className="w-4 h-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(1)}><ChevronsLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="w-4 h-4" /></Button>
        </div>
      )}

      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja excluir esta viagem? Esta ação não pode ser desfeita.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)} disabled={deleteTrip.isPending}>
              {deleteTrip.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {boardingTrip && (
        <BoardingPanelModal
          tripId={boardingTrip.id}
          tripName={boardingTrip.name}
          open={!!boardingTrip}
          onClose={() => setBoardingTrip(null)}
        />
      )}
      {publishingTrip && (
        <PublishToStoreDialog
          trip={publishingTrip}
          open={!!publishingTrip}
          onClose={() => setPublishingTrip(null)}
        />
      )}
    </div>
  );
}

function generateProductSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    + "-" + Math.random().toString(36).slice(2, 7);
}

function buildTripProductPayload(trip: Trip) {
  const t = trip as unknown as Record<string, unknown>;
  const images = [
    ...(trip.coverImage ? [trip.coverImage] : []),
    ...(Array.isArray(trip.gallery) ? trip.gallery : []),
  ];

  let durationDays: number | undefined;
  let durationNights: number | undefined;
  if (trip.departureDate && trip.returnDate) {
    const dur = calculateTripDuration(
      trip.departureDate,
      trip.returnDate,
      trip.departureTime ?? null,
      trip.returnTime ?? null,
    );
    if (dur && dur.totalMinutes > 0) {
      durationDays = dur.days;
      durationNights = dur.days > 0 ? dur.days - 1 : 0;
    }
  }

  const shortDescription = (typeof t.shortDescription === "string" && t.shortDescription)
    ? t.shortDescription
    : (trip.description ? trip.description.slice(0, 200) : undefined);

  const metaTitle = (typeof t.metaTitle === "string" && t.metaTitle)
    ? t.metaTitle
    : trip.name;

  const metaDescription = (typeof t.metaDescription === "string" && t.metaDescription)
    ? t.metaDescription
    : (trip.description ? trip.description.slice(0, 160) : undefined);

  const country = (typeof t.destinationCountry === "string" && t.destinationCountry)
    ? t.destinationCountry
    : "Brasil";

  return {
    name: trip.name,
    shortDescription,
    description: trip.description ?? "",
    type: trip.type,
    price: String(trip.priceAdult),
    thumbnail: trip.coverImage || undefined,
    images: images.length > 0 ? images : undefined,
    gallery: trip.gallery?.length > 0 ? trip.gallery : undefined,
    destination: `${trip.destinationCity}, ${trip.destinationState}`,
    productCity: trip.destinationCity,
    productState: trip.destinationState,
    country,
    hasDates: true,
    startDate: trip.departureDate,
    endDate: trip.returnDate ?? undefined,
    originCity: trip.originCity || undefined,
    originState: trip.originState || undefined,
    departureTime: trip.departureTime || undefined,
    returnTime: trip.returnTime || undefined,
    durationDays,
    durationNights,
    includes: trip.inclusions?.length > 0 ? trip.inclusions : undefined,
    excludes: trip.exclusions?.length > 0 ? trip.exclusions : undefined,
    trackInventory: true,
    stockQuantity: trip.availableSeats,
    isFeatured: trip.isFeatured,
    metaTitle,
    metaDescription,
    status: "active" as const,
  };
}

function PublishToStoreDialog({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    setChecking(true);
    setStoreError(null);
    storeApi.getSettings()
      .then(() => storeApi.getProducts())
      .then((products) => {
        const linked = products.find((p) => p.tripId === trip.id);
        setExistingProductId(linked ? linked.id : null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not initialized") || msg.toLowerCase().includes("404")) {
          setStoreError("Loja não configurada. Vá em Loja → Configurações para criar sua vitrine antes de publicar.");
        } else {
          setExistingProductId(null);
        }
      })
      .finally(() => setChecking(false));
  }, [open, trip.id]);

  async function publish() {
    setLoading(true);
    try {
      const slug = generateProductSlug(trip.name);
      await storeApi.createProduct({ ...buildTripProductPayload(trip), slug, tripId: trip.id });
      toast({ title: "Publicado na loja!", description: `${trip.name} já está disponível na vitrine.` });
      onClose();
      navigate("/loja/produtos");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    if (!existingProductId) return;
    setLoading(true);
    try {
      await storeApi.updateProduct(existingProductId, buildTripProductPayload(trip));
      toast({ title: "Dados sincronizados com sucesso!", description: `${trip.name} foi atualizado na vitrine com os dados mais recentes.` });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
      toast({ title: "Erro ao sincronizar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function goToProduct() {
    navigate("/loja/produtos");
    onClose();
  }

  const payload = buildTripProductPayload(trip);
  const durationLabel = payload.durationDays
    ? `${payload.durationDays} dia${payload.durationDays > 1 ? "s" : ""}${payload.durationNights ? ` / ${payload.durationNights} noite${payload.durationNights > 1 ? "s" : ""}` : ""}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            {existingProductId ? "Sincronizar com a Loja" : "Publicar na Loja"}
          </DialogTitle>
        </DialogHeader>
        {checking ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : storeError ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{storeError}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button onClick={() => { navigate("/loja/configuracoes"); onClose(); }}>Ir para Configurações</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {existingProductId && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <ShoppingBag className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  Esta viagem já está publicada. Clique em <strong>Sincronizar Dados</strong> para atualizar o produto com as informações atuais.
                </p>
              </div>
            )}

            {trip.coverImage && (
              <img src={trip.coverImage} alt={trip.name} className="w-full h-36 object-cover rounded-lg" />
            )}

            <div className="rounded-lg border p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{trip.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {trip.destinationCity}, {trip.destinationState}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary whitespace-nowrap">
                  R$ {Number(trip.priceAdult).toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/pessoa</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>
                    {new Date(trip.departureDate).toLocaleDateString("pt-BR")}
                    {trip.returnDate && ` → ${new Date(trip.returnDate).toLocaleDateString("pt-BR")}`}
                  </span>
                </div>
                {durationLabel && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{durationLabel}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 shrink-0" />
                  <span>{trip.availableSeats} vagas disponíveis</span>
                </div>
                {trip.isFeatured && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <Star className="w-3 h-3 shrink-0" />
                    <span>Destaque na loja</span>
                  </div>
                )}
                {(trip.originCity || trip.originState) && (
                  <div className="flex items-center gap-1 col-span-2">
                    <MapPin className="w-3 h-3 shrink-0 text-blue-500" />
                    <span>Saída de {[trip.originCity, trip.originState].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {trip.departureTime && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Partida: {trip.departureTime}{trip.returnTime ? ` · Volta: ${trip.returnTime}` : ""}</span>
                  </div>
                )}
                {((Number(trip.freeOrganizers) || 0) + (Number(trip.freeGuides) || 0) > 0) && (
                  <div className="flex items-center gap-1 text-emerald-600">
                    <UserRound className="w-3 h-3 shrink-0" />
                    <span>
                      {Number(trip.freeOrganizers) > 0 ? `${trip.freeOrganizers} org.` : ""}
                      {Number(trip.freeOrganizers) > 0 && Number(trip.freeGuides) > 0 ? " · " : ""}
                      {Number(trip.freeGuides) > 0 ? `${trip.freeGuides} guia(s) grátis` : ""}
                    </span>
                  </div>
                )}
              </div>

              {(trip.inclusions?.length > 0 || trip.exclusions?.length > 0) && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                  {trip.inclusions?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-1">Incluso ({trip.inclusions.length})</p>
                      <ul className="space-y-0.5">
                        {trip.inclusions.slice(0, 4).map((inc, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-green-500 shrink-0 mt-0.5" />
                            <span className="truncate">{inc}</span>
                          </li>
                        ))}
                        {trip.inclusions.length > 4 && (
                          <li className="text-xs text-muted-foreground">+{trip.inclusions.length - 4} itens</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {trip.exclusions?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-700 mb-1">Não incluso ({trip.exclusions.length})</p>
                      <ul className="space-y-0.5">
                        {trip.exclusions.slice(0, 4).map((exc, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <XCircle className="w-2.5 h-2.5 text-red-400 shrink-0 mt-0.5" />
                            <span className="truncate">{exc}</span>
                          </li>
                        ))}
                        {trip.exclusions.length > 4 && (
                          <li className="text-xs text-muted-foreground">+{trip.exclusions.length - 4} itens</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {trip.gallery?.length > 0 && (
                <div className="flex gap-1 pt-1 border-t overflow-x-auto">
                  {trip.gallery.slice(0, 5).map((img, i) => (
                    <img key={i} src={img} alt="" className="w-12 h-12 object-cover rounded shrink-0" />
                  ))}
                  {trip.gallery.length > 5 && (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0 text-xs text-muted-foreground">
                      +{trip.gallery.length - 5}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!existingProductId && (
              <p className="text-xs text-muted-foreground">
                Todos os dados acima serão publicados automaticamente na sua vitrine pública. Você pode ajustar detalhes adicionais depois em Loja → Produtos.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                {existingProductId ? "Fechar" : "Cancelar"}
              </Button>
              {existingProductId ? (
                <>
                  <Button variant="outline" onClick={goToProduct} disabled={loading}>
                    Ver na Loja
                  </Button>
                  <Button onClick={sync} disabled={loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sincronizando...</> : "Sincronizar Dados"}
                  </Button>
                </>
              ) : (
                <Button onClick={publish} disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Publicando...</> : "Publicar na Loja"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TripCard({ trip, isVendedor, onDelete, onDuplicate, onBoarding, navigate }: { trip: Trip; isVendedor?: boolean; onDelete: () => void; onDuplicate: () => void; onBoarding: () => void; navigate: (to: string) => void }) {
  const pct = trip.totalCapacity > 0 ? Math.round((trip.reservedSeats + trip.confirmedSeats) / trip.totalCapacity * 100) : 0;
  const statusInfo = STATUS_MAP[trip.status] ?? { label: trip.status, color: "bg-gray-100 text-gray-600" };
  const [publishOpen, setPublishOpen] = useState(false);
  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-36 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        {trip.coverImage ? <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" /> : <MapPin className="w-12 h-12 text-primary/30" />}
        <div className="absolute top-3 right-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span></div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold truncate">{trip.name}</h3>
          {trip.originCity ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span>De: </span>
              <span className="font-medium text-blue-600">{trip.originCity}{trip.originState ? ` (${trip.originState})` : ""}</span>
              <span>→</span>
              <span>{trip.destinationCity}, {trip.destinationState}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.destinationCity}, {trip.destinationState}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>{formatDate(trip.departureDate)}{trip.departureTime ? ` às ${trip.departureTime}` : ""}</span>
          {trip.returnDate && <><span>—</span><span>{formatDate(trip.returnDate)}{trip.returnTime ? ` às ${trip.returnTime}` : ""}</span></>}
        </div>
        <TripCountdown date={trip.departureDate} />
        <OccupancyBar reserved={trip.reservedSeats} confirmed={trip.confirmedSeats} total={trip.totalCapacity} />
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-primary">{formatCurrency(trip.priceAdult)}<span className="text-xs text-muted-foreground font-normal">/pessoa</span></span>
          <span className="text-muted-foreground text-xs">{pct}% ocupado</span>
        </div>
        <div className="flex gap-1 pt-1 flex-wrap">
          <Link href={`/trips/${trip.id}/passengers-overview`}>
            <Button variant="outline" size="sm" className="text-xs"><Eye className="w-3 h-3 mr-1" />Visão Geral</Button>
          </Link>
          <Link href={`/trips/${trip.id}/passengers`}>
            <Button variant="outline" size="sm" className="text-xs"><Users className="w-3 h-3 mr-1" />Passageiros</Button>
          </Link>
          <Button variant="outline" size="sm" className="text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={onBoarding} title="Painel de Embarque">
            <ClipboardList className="w-3 h-3 mr-1" />Embarque
          </Button>
          <Link href={`/trips/${trip.id}/seat-map`}>
            <Button variant="outline" size="sm" className="text-xs"><Bus className="w-3 h-3 mr-1" />Mapa</Button>
          </Link>
          {!isVendedor && (
            <Link href={`/trips/${trip.id}/edit`}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Editar"><Edit className="w-4 h-4" /></Button>
            </Link>
          )}
          {!isVendedor && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onDuplicate} title="Duplicar">
              <Copy className="w-4 h-4" />
            </Button>
          )}
          {!isVendedor && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} title="Excluir"><Trash2 className="w-4 h-4" /></Button>}
          {!isVendedor && <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setPublishOpen(true)} title="Publicar na Loja"><ShoppingBag className="w-4 h-4" /></Button>}
        </div>
      </div>
      <PublishToStoreDialog trip={trip} open={publishOpen} onClose={() => setPublishOpen(false)} />
    </div>
  );
}

interface BoardingPoint { id: string; name: string; time?: string; address?: string; }
interface ItineraryDay { day: number; title: string; description: string; }
interface FixedCostItem { id: string; category: string; description: string; value: number; }
interface VariableCostItem { id: string; category: string; description: string; valuePax: number; }
interface TripFormData {
  name: string; description: string;
  destination: string; destinationCity: string; destinationState: string;
  originCity: string; originState: string;
  type: string; category: string;
  departureDate: string; returnDate: string;
  departureTime: string; returnTime: string;
  totalCapacity: string; seatLayout: string;
  layoutId: string;
  priceAdult: string; priceChild: string; priceSenior: string;
  inclusions: string; exclusions: string;
  coverImage: string;
  vehicleType: string; vehiclePlate: string; driverName: string; tourGuide: string; tripOrganizer: string;
  driver1Cpf: string; driver1Cnh: string; driver1CnhCategory: string; driver1CnhExpiry: string;
  driver2Name: string; driver2Cpf: string; driver2Cnh: string; driver2CnhCategory: string; driver2CnhExpiry: string;
  tourGuideCpf: string; tourGuideRegistration: string;
  status: string;
  boardingPoints: BoardingPoint[];
  itinerary: ItineraryDay[];
  fixedCostItems: FixedCostItem[];
  variableCostItems: VariableCostItem[];
  gallery: string[];
  freeOrganizers: string;
  freeGuides: string;
}

const FIXED_COST_CATEGORIES: Record<string, string[]> = {
  "Transporte": ["Fretamento", "Combustível", "Manutenção", "Seguro do veículo", "Outro"],
  "Equipe": ["Motorista (diária)", "Guia turístico", "Coordenador de viagem", "Outro"],
  "Estrutura": ["Hospedagem da equipe", "Alimentação da equipe", "Outro"],
  "Obrigações": ["Seguro da viagem", "Licenças e autorizações", "Taxas administrativas", "Outro"],
  "Marketing": ["Tráfego pago", "Design", "Comissões de vendedores", "Divulgação", "Outro"],
  "Operacional": ["Sistema de som", "Kit primeiros socorros", "Uniformes", "Estacionamentos e pedágios", "Outro"],
};
const VARIABLE_COST_CATEGORIES: Record<string, string[]> = {
  "Alimentação": ["Alimentação dos passageiros", "Água e lanches", "Kits de viagem", "Outro"],
  "Experiência": ["Ingressos (parques/atrações)", "Passeios opcionais", "Guias locais", "Outro"],
  "Hospedagem": ["Hospedagem por pessoa", "Outro"],
  "Logística": ["Transportes adicionais", "Transfers internos", "Outro"],
  "Extras": ["Brindes", "Taxas ambientais/locais", "Consumos extras", "Outro"],
};

const newBP = (): BoardingPoint => ({ id: crypto.randomUUID(), name: "", time: "", address: "" });
const newDay = (day: number): ItineraryDay => ({ day, title: "", description: "" });
const EMPTY_FORM: TripFormData = {
  name: "", description: "", destination: "", destinationCity: "", destinationState: "",
  originCity: "", originState: "",
  type: "excursao", category: "standard", departureDate: "", returnDate: "",
  departureTime: "", returnTime: "",
  totalCapacity: "46", seatLayout: "2x2", layoutId: "",
  priceAdult: "", priceChild: "", priceSenior: "",
  inclusions: "", exclusions: "", coverImage: "",
  vehicleType: "", vehiclePlate: "", driverName: "", tourGuide: "", tripOrganizer: "", status: "draft",
  driver1Cpf: "", driver1Cnh: "", driver1CnhCategory: "", driver1CnhExpiry: "",
  driver2Name: "", driver2Cpf: "", driver2Cnh: "", driver2CnhCategory: "", driver2CnhExpiry: "",
  tourGuideCpf: "", tourGuideRegistration: "",
  boardingPoints: [newBP()], itinerary: [newDay(1)], fixedCostItems: [], variableCostItems: [], gallery: [],
  freeOrganizers: "0", freeGuides: "0",
};
const toTripFormData = (trip: Trip): TripFormData => ({
  name: trip.name,
  description: trip.description ?? "",
  destination: trip.destination,
  destinationCity: trip.destinationCity,
  destinationState: trip.destinationState,
  originCity: trip.originCity ?? "",
  originState: trip.originState ?? "",
  type: trip.type,
  category: trip.category,
  departureDate: trip.departureDate.split("T")[0],
  returnDate: trip.returnDate?.split("T")[0] ?? "",
  departureTime: trip.departureTime ?? "",
  returnTime: trip.returnTime ?? "",
  totalCapacity: String(trip.totalCapacity),
  seatLayout: trip.seatLayout ?? "2x2",
  layoutId: trip.layoutId ?? "",
  priceAdult: String(trip.priceAdult),
  priceChild: trip.priceChild ? String(trip.priceChild) : "",
  priceSenior: trip.priceSenior ? String(trip.priceSenior) : "",
  inclusions: (trip.inclusions ?? []).join("\n"),
  exclusions: (trip.exclusions ?? []).join("\n"),
  coverImage: trip.coverImage ?? "",
  vehicleType: trip.vehicleType ?? "",
  vehiclePlate: trip.vehiclePlate ?? "",
  driverName: trip.driverName ?? "",
  tourGuide: trip.tourGuide ?? "",
  tripOrganizer: trip.tripOrganizer ?? "",
  driver1Cpf: trip.driver1Cpf ?? "",
  driver1Cnh: trip.driver1Cnh ?? "",
  driver1CnhCategory: trip.driver1CnhCategory ?? "",
  driver1CnhExpiry: trip.driver1CnhExpiry ?? "",
  driver2Name: trip.driver2Name ?? "",
  driver2Cpf: trip.driver2Cpf ?? "",
  driver2Cnh: trip.driver2Cnh ?? "",
  driver2CnhCategory: trip.driver2CnhCategory ?? "",
  driver2CnhExpiry: trip.driver2CnhExpiry ?? "",
  tourGuideCpf: trip.tourGuideCpf ?? "",
  tourGuideRegistration: trip.tourGuideRegistration ?? "",
  status: trip.status,
  boardingPoints: trip.boardingPoints?.length ? (trip.boardingPoints as BoardingPoint[]) : [newBP()],
  itinerary: trip.itinerary?.length ? (trip.itinerary as unknown as ItineraryDay[]) : [newDay(1)],
  fixedCostItems: Array.isArray(trip.fixedCosts) ? (trip.fixedCosts as unknown as FixedCostItem[]) : [],
  variableCostItems: Array.isArray(trip.variableCosts) ? (trip.variableCosts as unknown as VariableCostItem[]) : [],
  gallery: trip.gallery ?? [],
  freeOrganizers: String(trip.freeOrganizers ?? 0),
  freeGuides: String(trip.freeGuides ?? 0),
});

const CELL_COLORS: Record<string, string> = {
  seat: "bg-blue-200",
  vip: "bg-amber-300",
  accessible: "bg-green-300",
  wc: "bg-cyan-200",
  stairs: "bg-purple-200",
  fridge: "bg-sky-200",
  blocked: "bg-gray-200",
  empty: "bg-transparent",
};

function LayoutMiniPreview({ cells, rows, cols }: { cells: { row: number; col: number; floor?: number; type: string }[]; rows: number; cols: number }) {
  const floor1 = cells.filter(c => (c.floor ?? 1) === 1);
  const cellMap = new Map(floor1.map(c => [`${c.row}-${c.col}`, c.type]));
  const size = Math.max(4, Math.min(10, Math.floor(120 / Math.max(rows, cols))));
  return (
    <div className="flex flex-col gap-0.5 mt-1">
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-0.5">
          {Array.from({ length: cols }).map((_, ci) => {
            const type = cellMap.get(`${ri + 1}-${ci + 1}`) ?? "empty";
            return (
              <div
                key={ci}
                className={`rounded-sm ${CELL_COLORS[type] ?? "bg-gray-100"}`}
                style={{ width: size, height: size }}
                title={type}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const COST_CATEGORIES = ["Transporte", "Hospedagem", "Alimentação", "Guia", "Marketing", "Seguro", "Taxas", "Outros"] as const;
const COST_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  paid:    { label: "Pago",     color: "bg-green-100 text-green-700 border-green-200" },
  overdue: { label: "Vencido",  color: "bg-red-100 text-red-700 border-red-200" },
};

const costFormSchema = z.object({
  category: z.enum(["Transporte", "Hospedagem", "Alimentação", "Guia", "Marketing", "Seguro", "Taxas", "Outros"] as const, {
    required_error: "Selecione uma categoria",
    invalid_type_error: "Categoria inválida",
  }),
  description: z.string().min(1, "Descrição obrigatória").max(200, "Máximo 200 caracteres"),
  supplierName: z.string().max(100).optional(),
  amount: z.number({ invalid_type_error: "Valor inválido" }).positive("Valor deve ser maior que zero"),
  status: z.enum(["pending", "paid", "overdue"] as const).default("pending"),
  dueDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type CostFormValues = z.infer<typeof costFormSchema>;

function TripCostModal({ tripId, cost, open, onClose, onSaved }: {
  tripId: string;
  cost: TripCost | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createCost = useCreateTripCost();
  const updateCost = useUpdateTripCost();

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<CostFormValues>({
    resolver: zodResolver(costFormSchema),
    defaultValues: { status: "pending", amount: 0 },
  });

  useEffect(() => {
    if (open) {
      if (cost) {
        reset({
          category: cost.category as CostFormValues["category"],
          description: cost.description,
          supplierName: cost.supplierName ?? "",
          amount: cost.amount,
          status: cost.status as CostFormValues["status"],
          dueDate: cost.dueDate ? cost.dueDate.substring(0, 10) : "",
          notes: cost.notes ?? "",
        });
      } else {
        reset({ category: undefined, description: "", supplierName: "", amount: 0, status: "pending", dueDate: "", notes: "" });
      }
    }
  }, [cost, open, reset]);

  const onSubmit = async (values: CostFormValues) => {
    try {
      const payload = {
        category: values.category,
        description: values.description,
        supplierName: values.supplierName || null,
        amount: values.amount,
        status: values.status,
        dueDate: values.dueDate || null,
        notes: values.notes || null,
      };
      if (cost) {
        await updateCost.mutateAsync({ tripId, costId: cost.id, data: payload });
        toast({ title: "Custo atualizado" });
      } else {
        await createCost.mutateAsync({ tripId, data: payload });
        toast({ title: "Custo adicionado" });
      }
      onSaved();
      onClose();
    } catch {
      toast({ title: "Erro ao salvar custo", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            {cost ? "Editar Custo" : "Novo Custo"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoria *</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className={errors.category ? "border-destructive" : ""}>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.category && <p className="text-[10px] text-destructive">{errors.category.message}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="overdue">Vencido</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição *</Label>
            <Input
              placeholder="Ex: Locação do ônibus"
              className={errors.description ? "border-destructive" : ""}
              {...register("description")}
            />
            {errors.description && <p className="text-[10px] text-destructive">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$) *</Label>
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className={errors.amount ? "border-destructive" : ""}
                    value={field.value ?? ""}
                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
              {errors.amount && <p className="text-[10px] text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" {...register("dueDate")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fornecedor</Label>
            <Input placeholder="Nome do fornecedor (opcional)" {...register("supplierName")} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} placeholder="Anotações adicionais..." {...register("notes")} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Salvando...</> : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TripCostsTab({ tripId }: { tripId: string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useListTripCosts(tripId, {
    query: { queryKey: ["trip-costs", tripId], enabled: !!tripId },
  });
  const deleteCost = useDeleteTripCost();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<TripCost | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const costs = data?.costs ?? [];
  const summary = data?.summary;

  const filtered = costs.filter(c => {
    if (filterCategory !== "all" && c.category !== filterCategory) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este custo?")) return;
    setDeletingId(id);
    try {
      await deleteCost.mutateAsync({ tripId, costId: id });
      toast({ title: "Custo removido" });
      refetch();
    } catch {
      toast({ title: "Erro ao remover custo", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const groupedByCategory = COST_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = costs.filter(c => c.category === cat).reduce((s, c) => s + c.amount, 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-600 font-medium">Receita Prevista</span>
            </div>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(summary.expectedRevenue)}</p>
            <p className="text-xs text-blue-500 mt-0.5">{summary.confirmedSeats} passageiros</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-red-600" />
              <span className="text-xs text-red-600 font-medium">Custos Reais</span>
            </div>
            <p className="text-lg font-bold text-red-700">{formatCurrency(summary.totalRealCosts)}</p>
            <p className="text-xs text-red-500 mt-0.5">Pagos: {formatCurrency(summary.totalPaidCosts)}</p>
          </div>
          <div className={`border rounded-lg p-4 ${summary.profit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              {summary.profit >= 0
                ? <TrendingUp className="w-4 h-4 text-green-600" />
                : <TrendingDown className="w-4 h-4 text-red-600" />}
              <span className={`text-xs font-medium ${summary.profit >= 0 ? "text-green-600" : "text-red-600"}`}>Lucro Líquido</span>
            </div>
            <p className={`text-lg font-bold ${summary.profit >= 0 ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(summary.profit)}
            </p>
            <p className={`text-xs mt-0.5 ${summary.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
              Margem: {summary.margin.toFixed(1)}%
            </p>
          </div>
          <div className={`border rounded-lg p-4 ${summary.budgetVariance <= 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              <PiggyBank className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-amber-700 font-medium">Orçado vs Real</span>
            </div>
            <p className={`text-lg font-bold ${summary.budgetVariance <= 0 ? "text-green-700" : "text-amber-700"}`}>
              {summary.budgetVariance <= 0
                ? `${formatCurrency(Math.abs(summary.budgetVariance))} abaixo`
                : `${formatCurrency(summary.budgetVariance)} acima`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Orçado: {formatCurrency(summary.plannedBudget)}</p>
          </div>
        </div>
      )}

      {/* Pending costs alert */}
      {summary && summary.totalPendingCosts > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Há <strong>{formatCurrency(summary.totalPendingCosts)}</strong> em custos pendentes de pagamento.
          </span>
        </div>
      )}

      {/* Cost List */}
      <div className="bg-card border rounded-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm">Custos da Viagem</h3>
            <Badge variant="secondary">{costs.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {COST_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { setEditingCost(null); setModalOpen(true); }}>
              <Plus className="w-3.5 h-3.5" />
              Adicionar
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-sm">{costs.length === 0 ? "Nenhum custo registrado ainda" : "Nenhum custo com esses filtros"}</p>
            {costs.length === 0 && (
              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => { setEditingCost(null); setModalOpen(true); }}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Adicionar primeiro custo
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(cost => {
              const statusInfo = COST_STATUS_MAP[cost.status] ?? COST_STATUS_MAP.pending;
              return (
                <div key={cost.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{cost.description}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{cost.category}</Badge>
                      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {cost.supplierName && <span>{cost.supplierName}</span>}
                      {cost.dueDate && <span>Vence: {formatDate(cost.dueDate)}</span>}
                      {cost.paidAt && <span>Pago em: {formatDate(cost.paidAt)}</span>}
                      {cost.notes && <span className="italic truncate max-w-[200px]">{cost.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${cost.status === "paid" ? "text-green-700" : cost.status === "overdue" ? "text-red-600" : ""}`}>
                      {formatCurrency(cost.amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => { setEditingCost(cost); setModalOpen(true); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      disabled={deletingId === cost.id}
                      onClick={() => handleDelete(cost.id)}>
                      {deletingId === cost.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Category summary footer */}
        {costs.length > 0 && (
          <div className="border-t p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Resumo por categoria</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COST_CATEGORIES.filter(cat => groupedByCategory[cat] > 0).map(cat => (
                <div key={cat} className="text-xs">
                  <span className="text-muted-foreground">{cat}: </span>
                  <span className="font-medium">{formatCurrency(groupedByCategory[cat])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TripCostModal
        tripId={tripId}
        cost={editingCost}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}

export function TripForm({ tripId }: { tripId?: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState("basico");
  const [form, setForm] = useState<TripFormData>(EMPTY_FORM);
  const [tripLimitError, setTripLimitError] = useState<{ resource: string; current?: number; limit?: number } | null>(null);

  const { data: existingTrip } = useGetTrip(tripId ?? "", { query: { enabled: !!tripId, queryKey: ["/api/trips", tripId] } });
  const { data: layouts = [] } = useListLayouts({ query: { queryKey: ["layouts"] } });
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const isPending = createTrip.isPending || updateTrip.isPending;
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const isUploading = uploadingCount > 0;
  const handleUploadingChange = (uploading: boolean) =>
    setUploadingCount((prev) => (uploading ? prev + 1 : Math.max(0, prev - 1)));

  const EMPTY_NEW_FIXED = { category: "", description: "", customDesc: "", value: "" };
  const EMPTY_NEW_VARIABLE = { category: "", description: "", customDesc: "", valuePax: "" };
  const [newFixed, setNewFixed] = useState(EMPTY_NEW_FIXED);
  const [newVariable, setNewVariable] = useState(EMPTY_NEW_VARIABLE);

  const selectedLayout = layouts.find(l => l.id === form.layoutId) ?? null;

  useEffect(() => {
    if (!existingTrip || !tripId) return;
    setForm(toTripFormData(existingTrip));
  }, [existingTrip?.id, tripId]);

  useEffect(() => {
    if (!selectedLayout) return;
    setForm(prev => ({ ...prev, totalCapacity: String(selectedLayout.seatCount) }));
  }, [form.layoutId, selectedLayout?.seatCount]);

  const set = (k: keyof TripFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  const setVal = (k: keyof TripFormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const cap = parseInt(form.totalCapacity || "0");
  const freeSeats = Math.min(parseInt(form.freeOrganizers || "0") + parseInt(form.freeGuides || "0"), cap);
  const paidCap = Math.max(0, cap - freeSeats);
  const grossRevenue = parseFloat(form.priceAdult || "0") * paidCap;
  const totalFixed = form.fixedCostItems.reduce((s, c) => s + c.value, 0);
  const totalVariablePax = form.variableCostItems.reduce((s, c) => s + c.valuePax, 0);
  const totalVariable = totalVariablePax * cap;
  const totalOperational = totalFixed + totalVariable;
  const costPerPax = paidCap > 0 ? totalOperational / paidCap : 0;
  const profit = grossRevenue - totalOperational;
  const marginPct = grossRevenue > 0 ? Math.round(profit / grossRevenue * 100) : 0;

  const handleSave = async (publish = false) => {
    if (!form.name || !form.destination || !form.destinationCity || !form.destinationState || !form.departureDate || !form.priceAdult) {
      toast({ title: "Preencha os campos obrigatórios: nome, destino, cidade, estado, data de saída e preço adulto", variant: "destructive" });
      return;
    }
    const inclArr = form.inclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const exclArr = form.exclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const statusToSave = publish ? "active" : form.status;
    const itineraryToSave = form.itinerary.filter(d => d.title || d.description);
    const boardingPointsToSave = form.boardingPoints.filter(bp => bp.name);
    try {
      if (tripId) {
        await updateTrip.mutateAsync({
          id: tripId,
          data: {
            name: form.name, description: form.description || undefined,
            destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
            originCity: form.originCity || undefined, originState: form.originState || undefined,
            type: form.type, category: form.category,
            departureDate: form.departureDate, returnDate: form.returnDate || undefined,
            departureTime: form.departureTime || undefined, returnTime: form.returnTime || undefined,
            totalCapacity: parseInt(form.totalCapacity),
            priceAdult: parseFloat(form.priceAdult),
            priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
            priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
            inclusions: inclArr, exclusions: exclArr,
            coverImage: form.coverImage || undefined,
            seatLayout: form.layoutId ? undefined : form.seatLayout,
            layoutId: form.layoutId || null,
            vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined, tourGuide: form.tourGuide || undefined, tripOrganizer: form.tripOrganizer || undefined,
            driver1Cpf: form.driver1Cpf || null, driver1Cnh: form.driver1Cnh || null, driver1CnhCategory: form.driver1CnhCategory || null, driver1CnhExpiry: form.driver1CnhExpiry || null,
            driver2Name: form.driver2Name || null, driver2Cpf: form.driver2Cpf || null, driver2Cnh: form.driver2Cnh || null, driver2CnhCategory: form.driver2CnhCategory || null, driver2CnhExpiry: form.driver2CnhExpiry || null,
            tourGuideCpf: form.tourGuideCpf || null, tourGuideRegistration: form.tourGuideRegistration || null,
            freeOrganizers: parseInt(form.freeOrganizers || "0"),
            freeGuides: parseInt(form.freeGuides || "0"),
            status: statusToSave,
            itinerary: itineraryToSave.length ? itineraryToSave : undefined,
            boardingPoints: boardingPointsToSave.length ? boardingPointsToSave : undefined,
            fixedCosts: form.fixedCostItems,
            variableCosts: form.variableCostItems,
            gallery: form.gallery.length ? form.gallery : undefined,
          },
        });
      } else {
        await createTrip.mutateAsync({
          data: {
            name: form.name, description: form.description || undefined,
            destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
            originCity: form.originCity || undefined, originState: form.originState || undefined,
            type: form.type, category: form.category,
            departureDate: form.departureDate, returnDate: form.returnDate || undefined,
            departureTime: form.departureTime || undefined, returnTime: form.returnTime || undefined,
            totalCapacity: parseInt(form.totalCapacity),
            priceAdult: parseFloat(form.priceAdult),
            priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
            priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
            inclusions: inclArr, exclusions: exclArr,
            coverImage: form.coverImage || undefined,
            seatLayout: form.layoutId ? undefined : form.seatLayout,
            layoutId: form.layoutId || null,
            vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined, tourGuide: form.tourGuide || undefined, tripOrganizer: form.tripOrganizer || undefined,
            driver1Cpf: form.driver1Cpf || null, driver1Cnh: form.driver1Cnh || null, driver1CnhCategory: form.driver1CnhCategory || null, driver1CnhExpiry: form.driver1CnhExpiry || null,
            driver2Name: form.driver2Name || null, driver2Cpf: form.driver2Cpf || null, driver2Cnh: form.driver2Cnh || null, driver2CnhCategory: form.driver2CnhCategory || null, driver2CnhExpiry: form.driver2CnhExpiry || null,
            tourGuideCpf: form.tourGuideCpf || null, tourGuideRegistration: form.tourGuideRegistration || null,
            freeOrganizers: parseInt(form.freeOrganizers || "0"),
            freeGuides: parseInt(form.freeGuides || "0"),
            status: statusToSave,
            itinerary: itineraryToSave.length ? itineraryToSave : undefined,
            boardingPoints: boardingPointsToSave.length ? boardingPointsToSave : undefined,
            fixedCosts: form.fixedCostItems,
            variableCosts: form.variableCostItems,
            gallery: form.gallery.length ? form.gallery : undefined,
          },
        });
      }
      navigate("/trips");
    } catch (err: unknown) {
      const responseData = (err as { response?: { data?: Record<string, unknown> } })?.response?.data ?? {};
      const limitInfo = usePlanLimitError(responseData);
      if (limitInfo.isLimitError) {
        setTripLimitError({ resource: limitInfo.resource ?? "trips", current: limitInfo.current, limit: limitInfo.limit });
        return;
      }
      const msg = (responseData["error"] as string)
        || (err as { message?: string })?.message
        || "Erro ao salvar viagem";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleSaveCosts = async () => {
    if (!tripId) return;
    setIsSavingCosts(true);
    try {
      await updateTrip.mutateAsync({
        id: tripId,
        data: {
          fixedCosts: form.fixedCostItems,
          variableCosts: form.variableCostItems,
        },
      });
      toast({ title: "Custos salvos com sucesso" });
    } catch {
      toast({ title: "Erro ao salvar custos", variant: "destructive" });
    } finally {
      setIsSavingCosts(false);
    }
  };

  const TABS = [
    { id: "basico", label: "Informações Básicas" },
    { id: "precos", label: "Preços" },
    { id: "pontos", label: "Pontos de Embarque" },
    { id: "roteiro", label: "Roteiro" },
    { id: "inclusoes", label: "Inclusões / Exclusões" },
    { id: "transporte", label: "Transporte e Hospedagem" },
    { id: "midia", label: "Mídia" },
    ...(tripId ? [{ id: "custos", label: "Custos" }] : []),
  ];

  const canSave = !!form.name && !!form.destination && !!form.destinationCity && !!form.destinationState && !!form.departureDate && !!form.priceAdult;

  if (tripLimitError) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
          <h1 className="text-2xl font-bold tracking-tight">Nova Viagem</h1>
        </div>
        <PlanLimitWall
          resource={tripLimitError.resource as "clients" | "users" | "trips"}
          current={tripLimitError.current}
          limit={tripLimitError.limit}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tripId ? "Editar Viagem" : "Nova Viagem"}</h1>
          <p className="text-muted-foreground text-sm">{tripId ? "Atualize as informações da viagem" : "Preencha as informações para criar uma nova viagem"}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {TABS.map(t => <TabsTrigger key={t.id} value={t.id} className="text-xs">{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="basico" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="space-y-2">
              <Label>Nome da Viagem *</Label>
              <Input placeholder="Ex: Maravilhas do Nordeste" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <TiptapEditor value={form.description} onChange={v => setForm(prev => ({ ...prev, description: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cidade de Origem</Label>
                <Input placeholder="São Paulo" value={form.originCity} onChange={set("originCity")} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF) de Origem</Label>
                <Input placeholder="SP" maxLength={2} value={form.originState} onChange={set("originState")} />
              </div>
              <div className="space-y-2">
                <Label>Destino / Título *</Label>
                <Input placeholder="Nordeste Brasileiro" value={form.destination} onChange={set("destination")} />
              </div>
              <div className="space-y-2">
                <Label>Cidade de Destino *</Label>
                <Input placeholder="Natal" value={form.destinationCity} onChange={set("destinationCity")} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF) de Destino *</Label>
                <Input placeholder="RN" maxLength={2} value={form.destinationState} onChange={set("destinationState")} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={setVal("type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.type && !TRIP_TYPES.includes(form.type) && <SelectItem value={form.type}>{TRIP_TYPE_LABELS[form.type] ?? form.type}</SelectItem>}
                    {TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{TRIP_TYPE_LABELS[t] ?? t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Saída *</Label>
                <Input type="date" value={form.departureDate} onChange={set("departureDate")} />
              </div>
              <div className="space-y-2">
                <Label>Horário de Saída</Label>
                <Input type="time" value={form.departureTime} onChange={set("departureTime")} />
              </div>
              <div className="space-y-2">
                <Label>Data de Retorno</Label>
                <Input type="date" value={form.returnDate} onChange={set("returnDate")} />
              </div>
              <div className="space-y-2">
                <Label>Horário de Retorno</Label>
                <Input type="time" value={form.returnTime} onChange={set("returnTime")} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Layout de Assentos</Label>
                <Select
                  value={form.layoutId || `__std_${form.seatLayout}`}
                  onValueChange={v => {
                    if (v.startsWith("__std_")) {
                      setForm(prev => ({ ...prev, layoutId: "", seatLayout: v.replace("__std_", "") }));
                    } else {
                      setForm(prev => ({ ...prev, layoutId: v }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um layout..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__std_2x2">Padrão 2x2 (automático)</SelectItem>
                    <SelectItem value="__std_2x1">Premium 2x1 (automático)</SelectItem>
                    {layouts.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t mt-1 pt-2">
                          Layouts personalizados
                        </div>
                        {layouts.map(l => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} — {l.seatCount} assentos
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {selectedLayout && (
                  <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0">
                        <LayoutMiniPreview cells={selectedLayout.cells} rows={selectedLayout.rows} cols={selectedLayout.cols} />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium text-indigo-800 truncate">✓ {selectedLayout.name}</p>
                        <p className="text-indigo-600 text-xs">
                          {selectedLayout.rows} fil. × {selectedLayout.cols} col. · {selectedLayout.seatCount} assentos
                        </p>
                        <p className="text-indigo-500 text-xs">
                          {selectedLayout.floors > 1 ? `${selectedLayout.floors} andares · ` : ""}
                          Numeração: {selectedLayout.numberingType === "by_row" ? "por fileira" : "sequencial"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Capacidade Total (assentos) *</Label>
                <Input
                  type="number" min="1" max="500"
                  value={form.totalCapacity}
                  onChange={set("totalCapacity")}
                  disabled={!!selectedLayout}
                  title={selectedLayout ? "Calculado automaticamente a partir do layout" : undefined}
                />
                {selectedLayout && (
                  <p className="text-xs text-muted-foreground">Calculado automaticamente ({selectedLayout.seatCount} assentos)</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="precos" className="space-y-4 mt-6">
          {/* Preços por Categoria */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Preços por Categoria</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Preço Adulto (R$) *</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.priceAdult} onChange={set("priceAdult")} />
              </div>
              <div className="space-y-2">
                <Label>Preço Criança (R$)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.priceChild} onChange={set("priceChild")} />
              </div>
              <div className="space-y-2">
                <Label>Preço Idoso (R$)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.priceSenior} onChange={set("priceSenior")} />
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-sm">Faixas de Preço Dinâmico</h4>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Preço de Lançamento (–20%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 0.8) : "—" },
                  { label: "Preço Antecipado (–10%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 0.9) : "—" },
                  { label: "Preço Padrão", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult)) : "—" },
                  { label: "Preço de Última Hora (+10%)", value: form.priceAdult ? formatCurrency(parseFloat(form.priceAdult) * 1.1) : "—" },
                ].map(tier => (
                  <div key={tier.label} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg text-sm">
                    <span className="text-muted-foreground">{tier.label}</span>
                    <span className="font-medium">{tier.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Controle de Gratuidades */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold">Controle de Gratuidades</h3>
              <p className="text-sm text-muted-foreground">Assentos gratuitos não contabilizados na receita bruta</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Responsável da Viagem gratuito</Label>
                <Input
                  type="number" min="0" max="2" step="1"
                  value={form.freeOrganizers}
                  onChange={e => setForm(prev => ({ ...prev, freeOrganizers: String(Math.min(2, Math.max(0, parseInt(e.target.value) || 0))) }))}
                />
                <p className="text-xs text-muted-foreground">Limite: até 2</p>
              </div>
              <div className="space-y-2">
                <Label>Guia de turismo gratuito</Label>
                <Input
                  type="number" min="0" max="2" step="1"
                  value={form.freeGuides}
                  onChange={e => setForm(prev => ({ ...prev, freeGuides: String(Math.min(2, Math.max(0, parseInt(e.target.value) || 0))) }))}
                />
                <p className="text-xs text-muted-foreground">Limite: até 2</p>
              </div>
            </div>
            {freeSeats > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm dark:bg-amber-950/20 dark:border-amber-800">
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {freeSeats} assento{freeSeats > 1 ? "s" : ""} gratuito{freeSeats > 1 ? "s" : ""} — receita calculada sobre {paidCap} pagante{paidCap !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Custos Fixos */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold">Custos Fixos</h3>
              <p className="text-sm text-muted-foreground">Valores que não dependem do número de passageiros</p>
            </div>
            {form.fixedCostItems.length > 0 && (
              <div className="space-y-2">
                {form.fixedCostItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">{item.category}</span>
                      <span className="truncate">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="font-semibold text-sm">{formatCurrency(item.value)}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => setForm(prev => ({ ...prev, fixedCostItems: prev.fixedCostItems.filter(c => c.id !== item.id) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1 text-sm font-semibold border-t">
                  <span>Total Fixo</span>
                  <span>{formatCurrency(totalFixed)}</span>
                </div>
              </div>
            )}
            {/* Add new fixed cost form */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar Custo Fixo</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={newFixed.category}
                    onChange={e => setNewFixed(prev => ({ ...prev, category: e.target.value, description: "", customDesc: "" }))}>
                    <option value="">Selecione...</option>
                    {Object.keys(FIXED_COST_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  {newFixed.category && newFixed.description !== "Outro" ? (
                    <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newFixed.description}
                      onChange={e => setNewFixed(prev => ({ ...prev, description: e.target.value, customDesc: "" }))}>
                      <option value="">Selecione...</option>
                      {(FIXED_COST_CATEGORIES[newFixed.category] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : newFixed.description === "Outro" ? (
                    <Input placeholder="Descreva o custo..." value={newFixed.customDesc}
                      onChange={e => setNewFixed(prev => ({ ...prev, customDesc: e.target.value }))} />
                  ) : (
                    <Input disabled placeholder="Selecione uma categoria primeiro" className="bg-muted/30" />
                  )}
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Valor Total (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={newFixed.value}
                    onChange={e => setNewFixed(prev => ({ ...prev, value: e.target.value }))} />
                </div>
                <Button size="sm" variant="outline"
                  disabled={!newFixed.category || !newFixed.description || (newFixed.description === "Outro" && !newFixed.customDesc) || !newFixed.value}
                  onClick={() => {
                    const desc = newFixed.description === "Outro" ? newFixed.customDesc : newFixed.description;
                    setForm(prev => ({
                      ...prev,
                      fixedCostItems: [...prev.fixedCostItems, { id: crypto.randomUUID(), category: newFixed.category, description: desc, value: parseFloat(newFixed.value) || 0 }],
                    }));
                    setNewFixed(EMPTY_NEW_FIXED);
                  }}>
                  <Plus className="w-4 h-4 mr-1" />Adicionar
                </Button>
              </div>
            </div>
          </div>

          {/* Custos Variáveis */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold">Custos Variáveis</h3>
              <p className="text-sm text-muted-foreground">Valores por passageiro — multiplicados pela capacidade total</p>
            </div>
            {form.variableCostItems.length > 0 && (
              <div className="space-y-2">
                {form.variableCostItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">{item.category}</span>
                      <span className="truncate">{item.description}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="text-muted-foreground text-xs">{formatCurrency(item.valuePax)}/pax</span>
                      <span className="font-semibold text-sm">{cap > 0 ? formatCurrency(item.valuePax * cap) : "—"}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => setForm(prev => ({ ...prev, variableCostItems: prev.variableCostItems.filter(c => c.id !== item.id) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-1 text-sm font-semibold border-t">
                  <span>Total Variável ({cap} pax)</span>
                  <span>{formatCurrency(totalVariable)}</span>
                </div>
              </div>
            )}
            {/* Add new variable cost form */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar Custo Variável</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Categoria</Label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={newVariable.category}
                    onChange={e => setNewVariable(prev => ({ ...prev, category: e.target.value, description: "", customDesc: "" }))}>
                    <option value="">Selecione...</option>
                    {Object.keys(VARIABLE_COST_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  {newVariable.category && newVariable.description !== "Outro" ? (
                    <select className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={newVariable.description}
                      onChange={e => setNewVariable(prev => ({ ...prev, description: e.target.value, customDesc: "" }))}>
                      <option value="">Selecione...</option>
                      {(VARIABLE_COST_CATEGORIES[newVariable.category] ?? []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : newVariable.description === "Outro" ? (
                    <Input placeholder="Descreva o custo..." value={newVariable.customDesc}
                      onChange={e => setNewVariable(prev => ({ ...prev, customDesc: e.target.value }))} />
                  ) : (
                    <Input disabled placeholder="Selecione uma categoria primeiro" className="bg-muted/30" />
                  )}
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Valor por Passageiro (R$)</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={newVariable.valuePax}
                    onChange={e => setNewVariable(prev => ({ ...prev, valuePax: e.target.value }))} />
                </div>
                <Button size="sm" variant="outline"
                  disabled={!newVariable.category || !newVariable.description || (newVariable.description === "Outro" && !newVariable.customDesc) || !newVariable.valuePax}
                  onClick={() => {
                    const desc = newVariable.description === "Outro" ? newVariable.customDesc : newVariable.description;
                    setForm(prev => ({
                      ...prev,
                      variableCostItems: [...prev.variableCostItems, { id: crypto.randomUUID(), category: newVariable.category, description: desc, valuePax: parseFloat(newVariable.valuePax) || 0 }],
                    }));
                    setNewVariable(EMPTY_NEW_VARIABLE);
                  }}>
                  <Plus className="w-4 h-4 mr-1" />Adicionar
                </Button>
              </div>
            </div>
          </div>

          {/* Resumo Financeiro */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Resumo Financeiro</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Total Custos Fixos", value: formatCurrency(totalFixed), muted: false },
                { label: `Total Custos Variáveis (${cap} pax)`, value: formatCurrency(totalVariable), muted: false },
                { label: "Custo Operacional Total", value: formatCurrency(totalOperational), muted: false },
                { label: freeSeats > 0 ? "Custo por Pagante" : "Custo por Passageiro", value: formatCurrency(costPerPax), muted: false },
                { label: `Receita Bruta (${paidCap} pagantes, 100%)`, value: formatCurrency(grossRevenue), muted: false },
                { label: `Receita Bruta (${paidCap} pagantes, 80%)`, value: formatCurrency(grossRevenue * 0.8), muted: true },
              ].map(row => (
                <div key={row.label} className={`flex justify-between p-3 rounded-lg ${row.muted ? "bg-muted/20" : "bg-muted/40"}`}>
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.value}</span>
                </div>
              ))}
            </div>
            <div className={`flex justify-between items-center p-4 rounded-lg border-2 text-sm font-semibold ${profit >= 0 ? "border-green-500/40 bg-green-50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50 dark:bg-red-950/20"}`}>
              <span className={profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                {profit >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}
              </span>
              <div className="text-right">
                <span className={`text-lg ${profit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(Math.abs(profit))}</span>
                <span className="ml-2 text-xs text-muted-foreground">({marginPct}% margem)</span>
              </div>
            </div>
          </div>

          {tripId && (
            <div className="flex justify-end">
              <Button onClick={handleSaveCosts} disabled={isSavingCosts || isPending} className="gap-2">
                {isSavingCosts
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando Custos...</>
                  : <><Check className="w-4 h-4" />Salvar Custos</>}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pontos" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Pontos de Embarque</h3>
                <p className="text-sm text-muted-foreground">Cadastre os pontos e horários de coleta da viagem.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, boardingPoints: [...prev.boardingPoints, newBP()] }))}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Ponto
              </Button>
            </div>
            <div className="space-y-3">
              {form.boardingPoints.map((bp, idx) => (
                <div key={bp.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Ponto {idx + 1}</span>
                    {form.boardingPoints.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.filter(b => b.id !== bp.id) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do Ponto</Label>
                      <Input placeholder="Terminal Rodoviário" value={bp.name} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, name: e.target.value } : b) }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Horário</Label>
                      <Input type="time" value={bp.time} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, time: e.target.value } : b) }))} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Endereço / Referência</Label>
                      <Input placeholder="Av. Principal, 100 — Em frente ao posto Shell" value={bp.address} onChange={e => setForm(prev => ({ ...prev, boardingPoints: prev.boardingPoints.map(b => b.id === bp.id ? { ...b, address: e.target.value } : b) }))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="roteiro" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Roteiro por Dia</h3>
              <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, itinerary: [...prev.itinerary, newDay(prev.itinerary.length + 1)] }))}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Dia
              </Button>
            </div>
            <div className="space-y-3">
              {form.itinerary.map((day, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Dia {day.day}</span>
                    {form.itinerary.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setForm(prev => ({ ...prev, itinerary: prev.itinerary.filter((_, i) => i !== idx).map((d, i) => ({ ...d, day: i + 1 })) }))}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Input placeholder="Título do dia (ex: Chegada em Natal)" value={day.title} onChange={e => setForm(prev => ({ ...prev, itinerary: prev.itinerary.map((d, i) => i === idx ? { ...d, title: e.target.value } : d) }))} />
                    <Textarea placeholder="Descreva as atividades do dia..." rows={3} value={day.description} onChange={e => setForm(prev => ({ ...prev, itinerary: prev.itinerary.map((d, i) => i === idx ? { ...d, description: e.target.value } : d) }))} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inclusoes" className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border rounded-lg p-6 space-y-3">
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" /><h3 className="font-semibold">O que está incluso</h3></div>
              <Textarea placeholder={"Transporte ida e volta\nCafé da manhã\nGuia turístico\nSeguro de viagem"} value={form.inclusions} onChange={set("inclusions")} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Um item por linha</p>
            </div>
            <div className="bg-card border rounded-lg p-6 space-y-3">
              <div className="flex items-center gap-2"><X className="w-4 h-4 text-red-600" /><h3 className="font-semibold">O que não está incluso</h3></div>
              <Textarea placeholder={"Despesas pessoais\nAlmoço e jantar\nIngresso para atrações opcionais"} value={form.exclusions} onChange={set("exclusions")} rows={8} className="font-mono text-sm" />
              <p className="text-xs text-muted-foreground">Um item por linha</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transporte" className="space-y-4 mt-6">
          {(form.originCity || form.originState || form.departureTime || form.returnTime) && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Origem e Horários</h3>
              <div className="flex flex-wrap gap-4 text-sm text-blue-700 dark:text-blue-300">
                {(form.originCity || form.originState) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <span>Saída de <strong>{[form.originCity, form.originState].filter(Boolean).join(", ")}</strong></span>
                  </div>
                )}
                {form.departureTime && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>Saída: <strong>{form.departureTime}</strong></span>
                  </div>
                )}
                {form.returnTime && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>Retorno: <strong>{form.returnTime}</strong></span>
                  </div>
                )}
              </div>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">Esses campos podem ser editados na aba "Básico".</p>
            </div>
          )}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Veículo</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Veículo</Label>
                <Select value={form.vehicleType || "none"} onValueChange={v => setVal("vehicleType")(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Placa do Veículo</Label>
                <Input placeholder="ABC-1234" value={form.vehiclePlate} onChange={set("vehiclePlate")} />
              </div>
            </div>
          </div>
          <div className="bg-card border rounded-lg p-6 space-y-5">
            <h3 className="font-semibold">Tripulação Completa</h3>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motorista 1</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Motorista</Label>
                  <Input placeholder="João da Silva" value={form.driverName} onChange={set("driverName")} />
                </div>
                <div className="space-y-2">
                  <Label>CPF do Motorista</Label>
                  <Input placeholder="000.000.000-00" value={form.driver1Cpf} onChange={set("driver1Cpf")} />
                </div>
                <div className="space-y-2">
                  <Label>Nº CNH</Label>
                  <Input placeholder="00000000000" value={form.driver1Cnh} onChange={set("driver1Cnh")} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria CNH</Label>
                  <Select value={form.driver1CnhCategory || "none"} onValueChange={v => setVal("driver1CnhCategory")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não informado</SelectItem>
                      {["D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Validade CNH</Label>
                  <Input type="date" value={form.driver1CnhExpiry} onChange={set("driver1CnhExpiry")} />
                </div>
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motorista 2 (opcional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input placeholder="Nome do 2º motorista" value={form.driver2Name} onChange={set("driver2Name")} />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input placeholder="000.000.000-00" value={form.driver2Cpf} onChange={set("driver2Cpf")} />
                </div>
                <div className="space-y-2">
                  <Label>Nº CNH</Label>
                  <Input placeholder="00000000000" value={form.driver2Cnh} onChange={set("driver2Cnh")} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria CNH</Label>
                  <Select value={form.driver2CnhCategory || "none"} onValueChange={v => setVal("driver2CnhCategory")(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não informado</SelectItem>
                      {["D", "E"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Validade CNH</Label>
                  <Input type="date" value={form.driver2CnhExpiry} onChange={set("driver2CnhExpiry")} />
                </div>
              </div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guia de Turismo</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Guia</Label>
                  <Input placeholder="Maria Costa" value={form.tourGuide} onChange={set("tourGuide")} />
                </div>
                <div className="space-y-2">
                  <Label>CPF do Guia</Label>
                  <Input placeholder="000.000.000-00" value={form.tourGuideCpf} onChange={set("tourGuideCpf")} />
                </div>
                <div className="space-y-2">
                  <Label>Nº Registro CADASTUR</Label>
                  <Input placeholder="00000/00" value={form.tourGuideRegistration} onChange={set("tourGuideRegistration")} />
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="space-y-2">
                <Label>Responsável da Viagem</Label>
                <Input placeholder="Nome do responsável" value={form.tripOrganizer} onChange={set("tripOrganizer")} />
              </div>
            </div>
          </div>
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Hospedagem</h3>
            <p className="text-sm text-muted-foreground">Integração com cadastro de hospedagens disponível em módulo futuro.</p>
          </div>
        </TabsContent>

        <TabsContent value="midia" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold">Imagem de Capa</h3>
              <p className="text-xs text-muted-foreground">Envie 1 imagem para a capa da viagem (PNG, JPG, WEBP · máx. 4 MB)</p>
              <CoverImageUpload
                value={form.coverImage}
                onChange={(url) => setForm(prev => ({ ...prev, coverImage: url }))}
                onUploadingChange={handleUploadingChange}
                disabled={isPending}
                objectFit="cover"
              />
            </div>
            <div className="border-t pt-5 space-y-3">
              <h3 className="font-semibold">Galeria de Imagens</h3>
              <p className="text-xs text-muted-foreground">Envie até 3 imagens para a galeria da viagem (PNG, JPG, WEBP · máx. 4 MB cada)</p>
              <GalleryUpload
                value={form.gallery}
                onChange={(urls) => setForm(prev => ({ ...prev, gallery: urls }))}
                onUploadingChange={handleUploadingChange}
                disabled={isPending}
              />
            </div>
          </div>
        </TabsContent>

        {tripId && (
          <TabsContent value="custos" className="space-y-4 mt-6">
            <TripCostsTab tripId={tripId} />
          </TabsContent>
        )}
      </Tabs>

      <div className="flex items-center justify-between bg-card border rounded-lg p-4">
        <Button variant="ghost" onClick={() => navigate("/trips")}>Cancelar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isPending || isUploading || !canSave}>
            {isPending ? "Salvando..." : "Salvar como Rascunho"}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isPending || isUploading || !canSave}>
            {isPending ? "Publicando..." : isUploading ? "Aguardando upload..." : "Publicar Viagem"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SeatMap({ tripId: initialTripId }: { tripId: string }) {
  const [, navigate] = useLocation();
  const [tripId, setTripId] = useState(initialTripId);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [assignMode, setAssignMode] = useState<"search" | "manual">("search");
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualCpf, setManualCpf] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [optimisticSeats, setOptimisticSeats] = useState<Record<string, string>>({});

  const { data: allTripsData } = useListTrips({ limit: 100 });
  const { data: trip } = useGetTrip(tripId, { query: { queryKey: ["/api/trips", tripId] } });
  const { data: seatMap, dataUpdatedAt } = useGetTripSeatMap(tripId, {
    query: { queryKey: getGetTripSeatMapQueryKey(tripId), refetchInterval: 5000 },
  });
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((v) => v + 1), 60000);
    return () => window.clearInterval(id);
  }, []);
  const lastUpdatedMinutes = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 60000));
  const { data: reservations } = useListReservations({ tripId });
  const { data: clientsData } = useListClients({ search: clientSearch || undefined, limit: 8 });
  const createReservation = useCreateReservation();
  const createClient = useCreateClient();

  const seats = useMemo(() => {
    if (!seatMap?.seats) return [];
    return [...seatMap.seats].sort((a, b) => {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });
  }, [seatMap]);

  const maxRow = useMemo(() => Math.max(...seats.map(s => s.row), 0), [seats]);
  const maxCol = useMemo(() => Math.max(...seats.map(s => s.col), 4), [seats]);
  const aisleAfterCol = Math.ceil(maxCol / 2);

  const seatCounts = useMemo(() => {
    const statusList = seats.map(s => optimisticSeats[s.number] ?? s.status);
    return {
      available: statusList.filter(st => st === "available").length,
      reserved: statusList.filter(st => st === "reserved" || st === "occupied").length,
      confirmed: statusList.filter(st => st === "confirmed").length,
      blocked: statusList.filter(st => st === "blocked").length,
    };
  }, [seats, optimisticSeats]);

  const getEffectiveStatus = (seat: Seat) => optimisticSeats[seat.number] ?? seat.status;

  const handleSeatClick = (seat: Seat) => {
    if (getEffectiveStatus(seat) !== "available") return;
    setSelectedSeat(seat);
    setAssignMode("search");
    setClientSearch("");
    setSelectedClientId(null);
    setManualName(""); setManualCpf(""); setManualPhone(""); setManualEmail("");
    setAssignError(null);
    setShowModal(true);
  };

  const handleAssign = async () => {
    if (!selectedSeat) return;
    setAssignError(null);
    setIsSaving(true);
    try {
      if (assignMode === "search") {
        if (!selectedClientId) { setAssignError("Selecione um cliente para continuar."); setIsSaving(false); return; }
        await createReservation.mutateAsync({
          data: {
            tripId,
            clientId: selectedClientId,
            seats: [selectedSeat.number],
            totalValue: trip?.priceAdult ?? 0,
            installments: 1,
          },
        });
        setOptimisticSeats(prev => ({ ...prev, [selectedSeat.number]: "reserved" }));
        setShowModal(false);
        setSelectedSeat(null);
      } else {
        if (!manualName) { setAssignError("Informe o nome do passageiro."); setIsSaving(false); return; }
        if (!manualEmail) { setAssignError("Informe o e-mail do passageiro."); setIsSaving(false); return; }
        const newClient = await createClient.mutateAsync({
          data: {
            name: manualName,
            email: manualEmail,
            whatsapp: manualPhone || "00000000000",
            cpf: manualCpf || "",
          },
        });
        await createReservation.mutateAsync({
          data: {
            tripId,
            clientId: newClient.id,
            seats: [selectedSeat.number],
            totalValue: trip?.priceAdult ?? 0,
            installments: 1,
          },
        });
        setOptimisticSeats(prev => ({ ...prev, [selectedSeat.number]: "reserved" }));
        setShowModal(false);
        setSelectedSeat(null);
      }
    } catch {
      setAssignError("Erro ao salvar reserva. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedClient = clientsData?.data?.find(c => c.id === selectedClientId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Mapa de Assentos</h1>
          <p className="text-muted-foreground text-sm">{trip?.name}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {lastUpdatedMinutes < 1 ? "Atualizado agora" : `Atualizado há ${lastUpdatedMinutes} min`}
        </Badge>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={tripId} onValueChange={v => { setTripId(v); setOptimisticSeats({}); }}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecionar viagem" />
            </SelectTrigger>
            <SelectContent>
              {(allTripsData?.data ?? []).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href={`/trips/${tripId}/passengers`}><Button variant="outline"><Users className="w-4 h-4 mr-2" />Lista ANTT</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-card border rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between text-sm">
              <span>Layout: <strong>{seatMap?.layout === "2x1" ? "2x1 Premium" : "2x2 Padrão"}</strong></span>
              <span className="text-muted-foreground">{seatMap?.totalSeats ?? 0} assentos no total</span>
            </div>

            <div className="bg-gray-800 text-white text-center py-3 rounded-lg text-sm font-medium">FRENTE DO ONIBUS</div>

            <div className="space-y-2 max-w-xs mx-auto">
              {Array.from({ length: maxRow }).map((_, rowIdx) => {
                const rowNum = rowIdx + 1;
                const rowSeats = seats.filter(s => s.row === rowNum);
                const leftSeats = rowSeats.filter(s => s.col <= aisleAfterCol);
                const rightSeats = rowSeats.filter(s => s.col > aisleAfterCol);

                const renderSeat = (seat: Seat) => {
                  const seatType = (seat as Seat & { type?: string }).type;
                  const isNonSeat = ["wc", "stairs", "fridge", "blocked", "empty"].includes(seatType ?? "");
                  const effectiveStatus = getEffectiveStatus(seat);
                  const cellClass = `w-10 h-10 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(effectiveStatus, false, seatType)}`;
                  if (isNonSeat) {
                    const labels: Record<string, string> = { wc: "Banheiro", stairs: "Escada", fridge: "Frigobar", blocked: "Bloqueado", empty: "" };
                    return (
                      <div key={seat.number} className={cellClass} title={labels[seatType ?? ""] ?? seatType ?? ""} aria-label={labels[seatType ?? ""] ?? seatType ?? ""}>
                        {getCellIcon(seatType)}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={seat.number}
                      className={cellClass}
                      onClick={() => handleSeatClick(seat)}
                      title={`Assento ${seat.number} (${seatType ?? "padrão"}) — ${effectiveStatus}`}
                      disabled={effectiveStatus !== "available"}
                    >
                      {getCellIcon(seatType, seat.number)}
                    </button>
                  );
                };

                return (
                  <div key={rowNum} className="flex items-center gap-2 justify-center">
                    <div className="flex gap-1">{leftSeats.map(renderSeat)}</div>
                    <div className="w-5 text-center text-xs text-muted-foreground shrink-0">|</div>
                    <div className="flex gap-1">{rightSeats.map(renderSeat)}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 justify-center text-xs flex-wrap">
              {[
                { color: "bg-white border-2 border-gray-200", label: "Disponível" },
                { color: "bg-yellow-50 border-2 border-yellow-500", label: "VIP ★" },
                { color: "bg-blue-50 border-2 border-blue-400", label: "Acessível ♿" },
                { color: "bg-orange-400", label: "Reservado" },
                { color: "bg-green-500", label: "Confirmado" },
                { color: "bg-gray-300", label: "Bloqueado" },
                { color: "bg-cyan-100 border-2 border-cyan-300", label: "Banheiro 🚽" },
                { color: "bg-purple-100 border-2 border-purple-300", label: "Escada 🪜" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded ${l.color}`} />
                  <span className="text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Resumo dos Assentos</h3>
            {[
              { label: "Disponíveis", count: seatCounts.available, color: "text-green-600" },
              { label: "Reservados", count: seatCounts.reserved, color: "text-orange-600" },
              { label: "Confirmados", count: seatCounts.confirmed, color: "text-primary" },
              { label: "Bloqueados", count: seatCounts.blocked, color: "text-gray-600" },
              { label: "Total", count: seats.length, color: "text-foreground" },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className={`font-bold ${s.color}`}>{s.count}</span>
              </div>
            ))}
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ocupação</span>
                <span className="font-semibold">{seats.length > 0 ? Math.round((seatCounts.reserved + seatCounts.confirmed) / seats.length * 100) : 0}%</span>
              </div>
              <div className="mt-1 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: seats.length > 0 ? `${(seatCounts.reserved + seatCounts.confirmed) / seats.length * 100}%` : "0%" }} />
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Reservas Recentes</h3>
            {(reservations?.data ?? []).slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                  <Users className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{r.client.name}</p>
                  <p className="text-xs text-muted-foreground">Assento(s): {r.seats.join(", ")}</p>
                </div>
              </div>
            ))}
            {(!reservations?.data?.length) && <p className="text-sm text-muted-foreground text-center py-2">Sem reservas ainda</p>}
          </div>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={() => { setShowModal(false); setSelectedSeat(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assento {selectedSeat?.number} — Atribuir Passageiro</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={assignMode === "search" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setAssignMode("search")}>Buscar Cliente</Button>
              <Button variant={assignMode === "manual" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setAssignMode("manual")}>Dados Manuais</Button>
            </div>

            {assignMode === "search" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Buscar cliente pelo nome</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Nome do cliente..." value={clientSearch} onChange={e => { setClientSearch(e.target.value); setSelectedClientId(null); }} />
                  </div>
                </div>
                {clientsData?.data?.length ? (
                  <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {clientsData.data.map(c => (
                      <button
                        key={c.id}
                        className={`w-full text-left p-3 text-sm hover:bg-muted/50 border-b last:border-b-0 transition-colors ${selectedClientId === c.id ? "bg-primary/10 font-medium" : ""}`}
                        onClick={() => setSelectedClientId(c.id)}
                      >
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.whatsapp} · {c.email}</p>
                      </button>
                    ))}
                  </div>
                ) : clientSearch.length > 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">Nenhum cliente encontrado</p>
                ) : null}
                {selectedClient && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-green-800">Selecionado: {selectedClient.name}</p>
                    <p className="text-green-600 text-xs">{selectedClient.whatsapp}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">Um novo cadastro de cliente será criado e a reserva será salva automaticamente.</p>
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input placeholder="João da Silva" value={manualName} onChange={e => setManualName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" placeholder="joao@email.com" value={manualEmail} onChange={e => setManualEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input placeholder="000.000.000-00" value={manualCpf} onChange={e => setManualCpf(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input placeholder="(11) 99999-9999" value={manualPhone} onChange={e => setManualPhone(e.target.value)} />
                </div>
              </div>
            )}

            {assignError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{assignError}</span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowModal(false); setSelectedSeat(null); setAssignError(null); }}>Cancelar</Button>
              <Button
                className="flex-1"
                disabled={isSaving || (assignMode === "search" ? !selectedClientId : !manualName)}
                onClick={handleAssign}
              >
                {isSaving ? "Reservando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TripFinancialReport {
  reservationCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalPending: number;
  totalExpenses: number;
  netProfit: number;
  revenueByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
}

export function PassengersOverview({ tripId: initialTripId }: { tripId: string }) {
  const [, navigate] = useLocation();
  const [tripId, setTripId] = useState(initialTripId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; paymentMethod: string }>({ status: "", paymentMethod: "" });
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [statusFilter, setStatusFilter] = useState("all");
  const [financialReportOpen, setFinancialReportOpen] = useState(false);
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const [showCosts, setShowCosts] = useState(false);

  const { data: allTripsData } = useListTrips({ limit: 100 });
  const { data: trip } = useGetTrip(tripId, { query: { queryKey: ["/api/trips", tripId] } });
  const { data: reservations, refetch: refetchReservations } = useListReservations({ tripId, limit: 200 });
  const updateReservation = useUpdateReservation();
  const { data: financialReport, isLoading: loadingReport } = useQuery<TripFinancialReport>({
    queryKey: ["trip-financial-report", tripId],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/financial-report`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: financialReportOpen && !!tripId,
  });

  const filteredReservations = useMemo(() => {
    let data = reservations?.data ?? [];
    if (statusFilter !== "all") data = data.filter(r => r.status === statusFilter);
    return [...data].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sort.key === "name") { va = a.client.name; vb = b.client.name; }
      else if (sort.key === "value") { va = a.totalValue; vb = b.totalValue; }
      else if (sort.key === "balance") { va = a.balance; vb = b.balance; }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [reservations, statusFilter, sort]);

  const stats = useMemo(() => {
    const all = reservations?.data ?? [];
    const confirmed = all.filter(r => r.status === "confirmed" || r.status === "completed");
    const pending = all.filter(r => r.status === "pending");
    const totalRevenue = all.reduce((acc, r) => acc + r.totalValue, 0);
    const amountReceived = all.reduce((acc, r) => acc + r.paidValue, 0);
    const amountPending = totalRevenue - amountReceived;
    const capacity = trip?.totalCapacity ?? 0;
    const occupancy = capacity > 0 ? Math.round(confirmed.length / capacity * 100) : 0;
    const estimatedProfit = amountReceived - (trip?.priceAdult ? trip.priceAdult * 0.6 * confirmed.length : 0);
    return { confirmed: confirmed.length, pending: pending.length, totalRevenue, amountReceived, amountPending, occupancy, estimatedProfit };
  }, [reservations, trip]);

  const costSummary = useMemo(() => {
    const fixedItems = Array.isArray(trip?.fixedCosts)
      ? (trip.fixedCosts as unknown as FixedCostItem[])
      : [];
    const variableItems = Array.isArray(trip?.variableCosts)
      ? (trip.variableCosts as unknown as VariableCostItem[])
      : [];
    const capacity = trip?.totalCapacity ?? 0;
    const totalFixed = fixedItems.reduce((s, c) => s + c.value, 0);
    const totalVariablePax = variableItems.reduce((s, c) => s + c.valuePax, 0);
    const totalVariable = totalVariablePax * capacity;
    const totalCost = totalFixed + totalVariable;
    const costPerPax = capacity > 0 ? totalCost / capacity : 0;
    const grossRevenue = (trip?.priceAdult ?? 0) * capacity;
    const marginPct = grossRevenue > 0 ? Math.round(((grossRevenue - totalCost) / grossRevenue) * 100) : null;
    const hasCosts = fixedItems.length > 0 || variableItems.length > 0;
    return { fixedItems, variableItems, totalFixed, totalVariable, totalVariablePax, totalCost, costPerPax, marginPct, hasCosts };
  }, [trip]);

  const paymentMethodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (reservations?.data ?? []).forEach(r => { const m = r.paymentMethod ?? "outro"; counts[m] = (counts[m] ?? 0) + 1; });
    return counts;
  }, [reservations]);

  const METHOD_LABELS: Record<string, string> = {
    pix: "PIX", credit_card: "Cartão Crédito", debit_card: "Cartão Débito",
    cash: "Dinheiro", bank_transfer: "Transferência", installment: "Parcelado",
  };

  const toggleSort = (key: string) => setSort(prev => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));

  const startEdit = (r: { id: string; status: string; paymentMethod?: string | null }) => {
    setEditingId(r.id);
    setEditForm({ status: r.status, paymentMethod: r.paymentMethod ?? "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateReservation.mutateAsync({
      id: editingId,
      data: {
        status: editForm.status as "pending" | "confirmed" | "cancelled" | "completed",
        paymentMethod: editForm.paymentMethod || undefined,
      },
    });
    setEditingId(null);
    refetchReservations();
  };

  const STATUS_LABELS: Record<string, string> = { all: "Todos", confirmed: "Confirmado", pending: "Pendente", cancelled: "Cancelado", completed: "Concluído" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral de Passageiros</h1>
          <p className="text-muted-foreground text-sm">
            {trip?.name}
            {trip && (
              <>
                {" · "}
                {formatDate(trip.departureDate)}{trip.departureTime ? ` às ${trip.departureTime}` : ""}
                {trip.returnDate && (
                  <> — {formatDate(trip.returnDate)}{trip.returnTime ? ` às ${trip.returnTime}` : ""}</>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={tripId} onValueChange={v => setTripId(v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Selecionar viagem" />
            </SelectTrigger>
            <SelectContent>
              {(allTripsData?.data ?? []).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href={`/trips/${tripId}/passengers`}><Button variant="outline"><List className="w-4 h-4 mr-2" />Lista ANTT</Button></Link>
          <Link href={`/trips/${tripId}/seat-map`}><Button variant="outline"><Bus className="w-4 h-4 mr-2" />Mapa de Assentos</Button></Link>
          <Link href={`/trips/${tripId}/edit`}><Button variant="outline"><Edit className="w-4 h-4 mr-2" />Editar Viagem</Button></Link>
        </div>
      </div>

      {trip && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">Status da viagem:</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_MAP[trip.status]?.color ?? "bg-gray-100 text-gray-600"}`}>{STATUS_MAP[trip.status]?.label ?? trip.status}</span>
          {(trip.originCity || trip.originState) && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              <span>Saída de <strong className="text-blue-600">{[trip.originCity, trip.originState].filter(Boolean).join(", ")}</strong></span>
            </span>
          )}
          {(trip.departureTime || trip.returnTime) && (
            <span className="text-sm text-muted-foreground">
              {trip.departureTime && <>Partida: <strong>{trip.departureTime}</strong></>}
              {trip.departureTime && trip.returnTime && <> · </>}
              {trip.returnTime && <>Volta: <strong>{trip.returnTime}</strong></>}
            </span>
          )}
          {trip.driverName && <span className="text-sm text-muted-foreground">Motorista: <strong>{trip.driverName}</strong></span>}
          {trip.tourGuide && <span className="text-sm text-muted-foreground">Guia Turístico: <strong>{trip.tourGuide}</strong></span>}
          {trip.tripOrganizer && <span className="text-sm text-muted-foreground">Responsável: <strong>{trip.tripOrganizer}</strong></span>}
          {trip.vehicleType && <span className="text-sm text-muted-foreground">Veículo: <strong>{trip.vehicleType}</strong></span>}
          {trip.vehiclePlate && <span className="text-sm text-muted-foreground">Placa: <strong>{trip.vehiclePlate}</strong></span>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Passageiros Confirmados", value: stats.confirmed, sub: `de ${trip?.totalCapacity ?? 0} assentos`, color: "text-green-600" },
          { label: "Reservas Pendentes", value: stats.pending, sub: "aguardando confirmação", color: "text-amber-600" },
          { label: "Receita Total", value: formatCurrency(stats.totalRevenue), sub: "valor das reservas", color: "text-blue-600" },
          { label: "A Receber", value: formatCurrency(stats.amountPending), sub: "saldo em aberto", color: "text-red-600" },
          { label: "Ocupação do Ônibus", value: `${stats.occupancy}%`, sub: "taxa de ocupação", color: "text-purple-600" },
          { label: "Lucro Estimado", value: formatCurrency(stats.estimatedProfit), sub: "receita recebida — custo estimado (60%)", color: "text-indigo-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {costSummary.hasCosts && (
        <div className="bg-card border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Resumo de Custos</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowCosts(v => !v)} className="text-xs text-muted-foreground h-7">
              {showCosts ? "Ocultar detalhes" : "Ver detalhes"}
              <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${showCosts ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Custos Fixos", value: formatCurrency(costSummary.totalFixed), color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
              { label: `Custos Variáveis (${trip?.totalCapacity ?? 0} pax)`, value: formatCurrency(costSummary.totalVariable), color: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
              { label: "Custo Total", value: formatCurrency(costSummary.totalCost), color: "bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800" },
              { label: "Custo por Passageiro", value: formatCurrency(costSummary.costPerPax), color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
              ...(costSummary.marginPct !== null ? [{ label: "Margem Estimada", value: `${costSummary.marginPct}%`, color: costSummary.marginPct >= 0 ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" }] : []),
            ].map(chip => (
              <div key={chip.label} className={`flex flex-col px-4 py-2.5 rounded-lg border text-sm ${chip.color}`}>
                <span className="text-xs opacity-70 mb-0.5">{chip.label}</span>
                <span className="font-semibold text-base">{chip.value}</span>
              </div>
            ))}
          </div>

          {showCosts && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custos Fixos</p>
                {costSummary.fixedItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum custo fixo cadastrado</p>
                ) : (
                  <div className="space-y-1">
                    {costSummary.fixedItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-muted-foreground mr-2">{item.category}</span>
                          <span className="truncate">{item.description}</span>
                        </div>
                        <span className="font-medium shrink-0 ml-3">{formatCurrency(item.value)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-semibold pt-1 border-t px-2">
                      <span>Total Fixo</span>
                      <span>{formatCurrency(costSummary.totalFixed)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Custos Variáveis</p>
                {costSummary.variableItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum custo variável cadastrado</p>
                ) : (
                  <div className="space-y-1">
                    {costSummary.variableItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-muted-foreground mr-2">{item.category}</span>
                          <span className="truncate">{item.description}</span>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <span className="text-muted-foreground text-xs block">{formatCurrency(item.valuePax)}/pax</span>
                          <span className="font-medium">{formatCurrency(item.valuePax * (trip?.totalCapacity ?? 0))}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-semibold pt-1 border-t px-2">
                      <span>Total Variável ({trip?.totalCapacity ?? 0} pax)</span>
                      <span>{formatCurrency(costSummary.totalVariable)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Reservas por Status</h3>
          <div className="space-y-3">
            {["confirmed", "pending", "cancelled", "completed"].map(s => {
              const count = (reservations?.data ?? []).filter(r => r.status === s).length;
              const total = reservations?.total ?? 0;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              const colors: Record<string, string> = { confirmed: "bg-green-500", pending: "bg-amber-500", cancelled: "bg-red-500", completed: "bg-blue-500" };
              const labels: Record<string, string> = { confirmed: "Confirmado", pending: "Pendente", cancelled: "Cancelado", completed: "Concluído" };
              return (
                <div key={s} className="space-y-1">
                  <div className="flex justify-between text-sm"><span>{labels[s] ?? s}</span><span className="font-medium">{count} ({pct}%)</span></div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[s] ?? "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-card border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold">Forma de Pagamento</h3>
          <div className="space-y-3">
            {Object.entries(paymentMethodCounts).map(([method, count]) => {
              const total = reservations?.total ?? 0;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              return (
                <div key={method} className="flex items-center gap-3 text-sm">
                  <span className="w-32 text-muted-foreground truncate">{METHOD_LABELS[method] ?? method}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-medium w-10 text-right">{pct}%</span>
                  <span className="text-muted-foreground w-6 text-right">{count}</span>
                </div>
              );
            })}
            {!Object.keys(paymentMethodCounts).length && <p className="text-sm text-muted-foreground">Sem dados de pagamento</p>}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold">Lista de Reservas</h3>
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Exportar</Button>
            <Button variant="outline" size="sm"><Send className="w-4 h-4 mr-2" />WhatsApp</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                {[
                  { key: "name", label: "Passageiro" },
                  { key: "voucher", label: "Nº Reserva" },
                  { key: "seats", label: "Assento(s)" },
                  { key: "status", label: "Status" },
                  { key: "payment", label: "Pagamento" },
                  { key: "value", label: "Valor" },
                  { key: "balance", label: "Saldo" },
                  { key: "actions", label: "" },
                ].map(col => (
                  <th key={col.key} className={`text-left p-2 font-medium ${["name","value","balance","status"].includes(col.key) ? "cursor-pointer hover:text-primary" : ""}`}
                    onClick={() => ["name","value","balance","status"].includes(col.key) ? toggleSort(col.key) : undefined}>
                    {col.label} {sort.key === col.key ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredReservations.slice(0, 15).map(r => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className={`border-b ${isEditing ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    <td className="p-2 font-medium">
                      <button className="hover:underline text-left" onClick={() => setClient360Id(r.client.id)}>{r.client.name}</button>
                    </td>
                    <td className="p-2"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.reservationNumber ?? r.voucherCode}</code></td>
                    <td className="p-2">{r.seats.join(", ") || "—"}</td>
                    <td className="p-2">
                      {isEditing ? (
                        <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["pending","confirmed","cancelled","completed"].map(s => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === "confirmed" ? "bg-green-100 text-green-700" : r.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <Select value={editForm.paymentMethod} onValueChange={v => setEditForm(f => ({ ...f, paymentMethod: v }))}>
                          <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Pagamento" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="credit_card">Cartão Crédito</SelectItem>
                            <SelectItem value="debit_card">Cartão Débito</SelectItem>
                            <SelectItem value="cash">Dinheiro</SelectItem>
                            <SelectItem value="bank_transfer">Transferência</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{METHOD_LABELS[r.paymentMethod ?? ""] ?? r.paymentMethod ?? "—"}</span>
                      )}
                    </td>
                    <td className="p-2 font-medium">{formatCurrency(r.totalValue)}</td>
                    <td className={`p-2 font-medium ${r.balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(r.balance)}</td>
                    <td className="p-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="default" className="h-6 w-6" onClick={saveEdit} disabled={updateReservation.isPending}><Check className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => setClient360Id(r.client.id)}>
                            <UserRound className="w-3 h-3" /> Perfil 360°
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(r)} title="Editar"><Edit className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filteredReservations.length && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sem reservas</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Origem dos Clientes</h3>
          <span className="text-xs text-muted-foreground">Campo origem disponível ao cadastrar o cliente</span>
        </div>
        {(reservations?.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sem reservas para exibir dados de origem</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              const origins: Record<string, number> = {};
              (reservations?.data ?? []).forEach(r => {
                const src = (r.client as Record<string, unknown>).referralSource as string | undefined;
                const key = src ?? "Não informado";
                origins[key] = (origins[key] ?? 0) + 1;
              });
              const total = (reservations?.data ?? []).length;
              const colors = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-gray-400"];
              return Object.entries(origins).slice(0, 5).map(([key, count], i) => {
                const pct = Math.round(count / total * 100);
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-sm"><span>{key}</span><span className="font-medium">{count} ({pct}%)</span></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Ações Rápidas</h3>
        <div className="flex flex-wrap gap-2">
          <Link href={`/reservations?tripId=${tripId}&new=true`}><Button><Plus className="w-4 h-4 mr-2" />Adicionar Passageiro</Button></Link>
          <Button variant="outline"><Download className="w-4 h-4 mr-2" />Exportar PDF</Button>
          <Button variant="outline"><Send className="w-4 h-4 mr-2" />Enviar WhatsApp</Button>
          <Button variant="outline" onClick={() => setFinancialReportOpen(true)}>
            <DollarSign className="w-4 h-4 mr-2" />Relatório Financeiro
          </Button>
          <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"><X className="w-4 h-4 mr-2" />Encerrar Viagem</Button>
        </div>
      </div>

      <Dialog open={financialReportOpen} onOpenChange={setFinancialReportOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório Financeiro — {trip?.name}</DialogTitle>
          </DialogHeader>
          {loadingReport ? (
            <div className="space-y-3 py-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
          ) : financialReport ? (
            <div className="space-y-5 mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Reservas", value: String(financialReport.reservationCount), color: "text-foreground" },
                  { label: "Confirmadas", value: String(financialReport.confirmedCount), color: "text-green-600" },
                  { label: "Pendentes", value: String(financialReport.pendingCount), color: "text-amber-600" },
                  { label: "Canceladas", value: String(financialReport.cancelledCount), color: "text-red-600" },
                ].map(s => (
                  <div key={s.label} className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Receita Total", value: financialReport.totalRevenue, color: "text-blue-600" },
                  { label: "Total Recebido", value: financialReport.totalPaid, color: "text-green-600" },
                  { label: "A Receber", value: financialReport.totalPending, color: "text-amber-600" },
                  { label: "Total Despesas", value: financialReport.totalExpenses, color: "text-red-600" },
                  { label: "Lucro Líquido", value: financialReport.netProfit, color: financialReport.netProfit >= 0 ? "text-green-600" : "text-red-600" },
                ].map(s => (
                  <div key={s.label} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>R$ {s.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
              {Object.keys(financialReport.revenueByMethod).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Receita por Forma de Pagamento</h4>
                  {Object.entries(financialReport.revenueByMethod).map(([method, amount]) => {
                    const labels: Record<string, string> = { pix: "PIX", credit_card: "Cartão Crédito", debit_card: "Cartão Débito", cash: "Dinheiro", bank_transfer: "Transferência", boleto: "Boleto" };
                    const total = Object.values(financialReport.revenueByMethod).reduce((s, v) => s + v, 0);
                    const pct = total > 0 ? Math.round(amount / total * 100) : 0;
                    return (
                      <div key={method} className="flex items-center gap-3 text-sm">
                        <span className="w-36 text-muted-foreground truncate">{labels[method] ?? method}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-medium w-20 text-right">R$ {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {Object.keys(financialReport.expensesByCategory).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Despesas por Categoria</h4>
                  {Object.entries(financialReport.expensesByCategory).map(([cat, amount]) => {
                    const total = financialReport.totalExpenses;
                    const pct = total > 0 ? Math.round(amount / total * 100) : 0;
                    return (
                      <div key={cat} className="flex items-center gap-3 text-sm">
                        <span className="w-36 text-muted-foreground truncate capitalize">{cat}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-medium w-20 text-right">R$ {amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {financialReport.totalExpenses === 0 && Object.keys(financialReport.expensesByCategory).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Nenhuma despesa registrada para esta viagem.</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center">Não foi possível carregar o relatório.</p>
          )}
        </DialogContent>
      </Dialog>
      <Client360Modal open={!!client360Id} onClose={() => setClient360Id(null)} clientId={client360Id} />
    </div>
  );
}

const AGE_CATEGORY_LABELS: Record<string, string> = {
  adult: "Adulto",
  child: "Criança",
  senior: "Sênior",
  baby: "Isento",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

type ColKey = "nome" | "cpf" | "birthDate" | "seatNumber" | "ageCategory" | "whatsapp" | "checkedInAt" | "boardingLocation";

const PASSENGER_COLS: { key: ColKey; label: string }[] = [
  { key: "nome", label: "Nome" },
  { key: "cpf", label: "CPF" },
  { key: "birthDate", label: "Dt. Nascimento" },
  { key: "seatNumber", label: "Poltrona" },
  { key: "ageCategory", label: "Categoria" },
  { key: "boardingLocation", label: "Ponto de Embarque" },
  { key: "whatsapp", label: "WhatsApp/Telefone" },
  { key: "checkedInAt", label: "Embarque" },
];

const ALL_COLS_ON: Record<ColKey, boolean> = {
  nome: true, cpf: true, birthDate: true, seatNumber: true,
  ageCategory: true, boardingLocation: true, whatsapp: true, checkedInAt: true,
};

export function PassengersList({ tripId }: { tripId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [boardingStatusFilter, setBoardingStatusFilter] = useState("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(ALL_COLS_ON);

  const { data: trip } = useGetTrip(tripId, { query: { queryKey: ["/api/trips", tripId] } });
  const { data: panel, isLoading, refetch } = useGetTripBoardingPanel(tripId, {
    query: { queryKey: ["boarding-panel-antt", tripId] },
  });

  const checkIn = useCheckInPassenger();
  const undoCheckIn = useUndoCheckInPassenger();
  const syncMutation = useSyncTripPassengers();
  const updateBoarding = useUpdatePassengerBoarding();
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(null);
  const [editingPassenger, setEditingPassenger] = useState<BoardingPassenger | null>(null);

  const allPassengers = panel?.passengers ?? [];
  const boardingPoints: BoardingPoint[] = panel?.boardingPoints ?? [];

  const getBoardingPointName = (id: string | null | undefined) => {
    if (!id) return "";
    return boardingPoints.find(bp => bp.id === id)?.name ?? id;
  };

  const handleBoardingLocationChange = async (p: BoardingPassenger, locationId: string | null) => {
    setUpdatingLocationId(p.id);
    try {
      await updateBoarding.mutateAsync({ tripId, passengerId: p.id, data: { boardingLocationId: locationId } });
      await refetch();
    } catch {
      toast({ title: "Erro ao atualizar local de embarque", variant: "destructive" });
    } finally {
      setUpdatingLocationId(null);
    }
  };

  const toggleCol = (key: ColKey) =>
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));

  const filtered = useMemo(() => {
    return allPassengers.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.cpf ?? "").toLowerCase().includes(q)) return false;
      }
      if (categoryFilter !== "all" && p.ageCategory !== categoryFilter) return false;
      if (boardingStatusFilter === "embarcado" && !p.checkedInAt) return false;
      if (boardingStatusFilter === "pendente" && p.checkedInAt) return false;
      return true;
    });
  }, [allPassengers, search, categoryFilter, boardingStatusFilter]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncMutation.mutateAsync({ id: tripId });
      await refetch();
      if (result.created > 0) {
        toast({ title: `${result.created} passageiro(s) adicionado(s)`, description: "O manifesto foi atualizado." });
      } else {
        toast({ title: "Tudo sincronizado", description: "Nenhum passageiro novo a adicionar." });
      }
    } catch {
      toast({ title: "Erro ao sincronizar", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckIn = async (p: BoardingPassenger) => {
    try {
      await checkIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: `${p.name} embarcou`, description: "Check-in registrado." });
    } catch {
      toast({ title: "Erro ao fazer check-in", variant: "destructive" });
    }
  };

  const handleUndoCheckIn = async (p: BoardingPassenger) => {
    try {
      await undoCheckIn.mutateAsync({ reservationId: p.reservationId, id: p.id });
      await refetch();
      toast({ title: "Check-in desfeito" });
    } catch {
      toast({ title: "Erro ao desfazer check-in", variant: "destructive" });
    }
  };

  const getPassengerContact = (p: BoardingPassenger) =>
    p.whatsapp ?? p.phone ?? "—";

  const handleCsvExport = () => {
    const activeCols = PASSENGER_COLS.filter(c => visibleCols[c.key]);
    const header = ["Nº", ...activeCols.map(c => c.label), "Telefone Passageiro", "Tipo Doc.", "Nec. Especiais", "Observações"];
    const rows = filtered.map((p, i) => {
      const values: string[] = [String(i + 1)];
      for (const col of activeCols) {
        switch (col.key) {
          case "nome": values.push(p.name); break;
          case "cpf": values.push(formatCpf(p.cpf)); break;
          case "birthDate": values.push(p.birthDate ? new Date(p.birthDate).toLocaleDateString("pt-BR") : ""); break;
          case "seatNumber": values.push(p.seatNumber ?? ""); break;
          case "ageCategory": values.push(AGE_CATEGORY_LABELS[p.ageCategory] ?? p.ageCategory); break;
          case "boardingLocation": values.push(getBoardingPointName(p.boardingLocationId)); break;
          case "whatsapp": values.push(getPassengerContact(p)); break;
          case "checkedInAt": values.push(p.checkedInAt ? "Sim" : "Não"); break;
        }
      }
      values.push(p.passengerPhone ?? "");
      values.push(p.documentType ?? "");
      values.push(p.specialNeeds ?? "");
      values.push(p.observations ?? "");
      return values;
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (panel?.tripName ?? tripId).replace(/[^a-zA-Z0-9\-_]/g, "_");
    a.download = `relacao-passageiros-${safeName}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfPrint = () => {
    const p = panel;
    const tripName = escapeHtml(p?.tripName ?? "");
    const destination = trip ? escapeHtml(`${trip.destinationCity}/${trip.destinationState}`) : "";
    const depDate = p?.departureDate
      ? escapeHtml(format(parseISO(p.departureDate), "dd/MM/yyyy", { locale: ptBR }))
      : "";
    const depTimeRaw = p?.departureDate ? format(parseISO(p.departureDate), "HH:mm") : "";
    const depTime = depTimeRaw && depTimeRaw !== "00:00" ? escapeHtml(depTimeRaw) : "";
    const emitidoEm = escapeHtml(new Date().toLocaleString("pt-BR"));
    const organizador = escapeHtml(p?.tenantName ?? "");
    const cnpj = escapeHtml(p?.tenantCnpj ?? "");
    const manifestNumber = escapeHtml(p?.manifestNumber ?? "");

    const vehiclePlate = escapeHtml(p?.vehiclePlate ?? "");
    const vehicleType = escapeHtml(p?.vehicleType ?? "");
    const driverName = escapeHtml(p?.driverName ?? "");
    const driver1Cpf = escapeHtml(p?.driver1Cpf ?? "");
    const driver1Cnh = escapeHtml(p?.driver1Cnh ?? "");
    const driver1CnhCat = escapeHtml(p?.driver1CnhCategory ?? "");
    const driver1CnhExp = escapeHtml(p?.driver1CnhExpiry ?? "");
    const driver2Name = escapeHtml(p?.driver2Name ?? "");
    const driver2Cpf = escapeHtml(p?.driver2Cpf ?? "");
    const driver2Cnh = escapeHtml(p?.driver2Cnh ?? "");
    const driver2CnhCat = escapeHtml(p?.driver2CnhCategory ?? "");
    const driver2CnhExp = escapeHtml(p?.driver2CnhExpiry ?? "");
    const tourGuide = escapeHtml(p?.tourGuide ?? "");
    const tourGuideCpf = escapeHtml(p?.tourGuideCpf ?? "");
    const tourGuideReg = escapeHtml(p?.tourGuideRegistration ?? "");

    const anttBucket: Record<string, string> = { adult: "adulto", child: "crianca", senior: "idoso", baby: "gratuidade", pcd: "pcd" };
    const catOrder = ["adulto", "crianca", "idoso", "pcd", "gratuidade"];
    const catLabel: Record<string, string> = { adulto: "Adultos", crianca: "Crianças", idoso: "Idosos", pcd: "PCDs", gratuidade: "Gratuidades" };
    const categoryCounts: Record<string, number> = {};
    for (const pass of allPassengers) {
      const bucket = anttBucket[pass.ageCategory] ?? "adulto";
      categoryCounts[bucket] = (categoryCounts[bucket] ?? 0) + 1;
    }

    const rows = allPassengers.map((pass, i) => {
      const nome = escapeHtml(pass.name);
      const cpfStr = escapeHtml(formatCpf(pass.cpf));
      const nasc = pass.birthDate ? escapeHtml(new Date(pass.birthDate).toLocaleDateString("pt-BR")) : "—";
      const cat = escapeHtml(AGE_CATEGORY_LABELS[pass.ageCategory] ?? pass.ageCategory);
      const poltrona = escapeHtml(pass.seatNumber ?? "—");
      const embarque = escapeHtml(getBoardingPointName(pass.boardingLocationId) || "—");
      const obsLines = [pass.documentType, pass.specialNeeds, pass.observations].filter(Boolean).map(escapeHtml);
      const obs = obsLines.length > 0 ? obsLines.join(" | ") : "";
      return `<tr>
        <td class="num">${String(i + 1).padStart(2, "0")}</td>
        <td>${nome}</td>
        <td>${cpfStr}</td>
        <td>${nasc}</td>
        <td>${cat}</td>
        <td class="seat">${poltrona}</td>
        <td>${embarque}</td>
        <td class="obs-cell">${obs}</td>
        <td class="sig"></td>
      </tr>`;
    }).join("");

    const totalsRow = catOrder
      .filter(c => categoryCounts[c])
      .map(c => `<span><strong>${catLabel[c] ?? c}:</strong> ${categoryCounts[c]}</span>`)
      .join("&nbsp;&nbsp;|&nbsp;&nbsp;");

    const crewRows = [
      driverName || driver1Cpf || driver1Cnh
        ? `<tr><td>Motorista 1</td><td>${driverName || "—"}</td><td>CNH ${driver1Cnh || "—"}${driver1CnhCat ? ` — Cat. ${driver1CnhCat}` : ""}${driver1CnhExp ? ` — Val. ${driver1CnhExp}` : ""}</td><td>CPF: ${driver1Cpf || "—"}</td></tr>`
        : "",
      driver2Name || driver2Cpf || driver2Cnh
        ? `<tr><td>Motorista 2</td><td>${driver2Name || "—"}</td><td>CNH ${driver2Cnh || "—"}${driver2CnhCat ? ` — Cat. ${driver2CnhCat}` : ""}${driver2CnhExp ? ` — Val. ${driver2CnhExp}` : ""}</td><td>CPF: ${driver2Cpf || "—"}</td></tr>`
        : "",
      tourGuide || tourGuideCpf || tourGuideReg
        ? `<tr><td>Guia de Turismo</td><td>${tourGuide || "—"}</td><td>CADASTUR: ${tourGuideReg || "—"}</td><td>CPF: ${tourGuideCpf || "—"}</td></tr>`
        : "",
    ].filter(Boolean).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Manifesto ANTT — ${tripName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10.5px; margin: 12mm 14mm; color: #000; }
  .header { border: 2px solid #1a1a1a; padding: 8px 10px; margin-bottom: 6px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .title { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .subtitle { font-size: 9px; color: #555; }
  .manifest-no { font-size: 13px; font-weight: bold; font-family: monospace; color: #1a3a6e; }
  .section { border: 1px solid #ccc; padding: 5px 8px; margin-bottom: 5px; font-size: 10.5px; }
  .section-title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-bottom: 4px; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; }
  .meta-item label { font-weight: bold; margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a1a; color: #fff; text-align: left; padding: 4px 5px; font-size: 9.5px; }
  td { padding: 3px 5px; border-bottom: 1px solid #e8e8e8; font-size: 10px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .num { width: 22px; text-align: center; }
  .seat { width: 50px; text-align: center; }
  .obs-cell { font-size: 9px; color: #555; max-width: 120px; }
  .sig { width: 90px; border-bottom: 1px solid #999 !important; }
  .crew-table td { border-bottom: 1px solid #e8e8e8; }
  .crew-table td:first-child { font-weight: bold; width: 110px; }
  .totals { margin-top: 6px; padding: 4px 8px; background: #f0f0f0; border: 1px solid #ccc; font-size: 10.5px; }
  .footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; color: #555; }
  .sig-block { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sig-line { border-top: 1px solid #000; padding-top: 3px; font-size: 9px; text-align: center; color: #555; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="title">Manifesto de Passageiros — ANTT</div>
      <div class="subtitle">Resolução ANTT nº 4.777/2015 — Transporte rodoviário de passageiros em excursão</div>
    </div>
    ${manifestNumber ? `<div class="manifest-no">${manifestNumber}</div>` : ""}
  </div>
</div>

<div class="section">
  <div class="section-title">Dados da Excursão</div>
  <div class="meta-grid">
    <div class="meta-item"><label>Excursão:</label>${tripName}</div>
    ${destination ? `<div class="meta-item"><label>Destino:</label>${destination}</div>` : ""}
    <div class="meta-item"><label>Saída:</label>${depDate}${depTime ? ` às ${depTime}` : ""}</div>
    ${organizador ? `<div class="meta-item"><label>Organizador:</label>${organizador}</div>` : ""}
    ${cnpj ? `<div class="meta-item"><label>CNPJ:</label>${cnpj}</div>` : ""}
    <div class="meta-item"><label>Total Passageiros:</label>${allPassengers.length}</div>
    <div class="meta-item"><label>Emitido em:</label>${emitidoEm}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Veículo</div>
  <div class="meta-grid">
    ${vehicleType ? `<div class="meta-item"><label>Tipo:</label>${vehicleType}</div>` : ""}
    ${vehiclePlate ? `<div class="meta-item"><label>Placa:</label>${vehiclePlate}</div>` : ""}
    <div class="meta-item"><label>Capacidade:</label>${trip?.totalCapacity ?? "—"}</div>
  </div>
</div>

${crewRows ? `<div class="section">
  <div class="section-title">Tripulação</div>
  <table class="crew-table"><tbody>${crewRows}</tbody></table>
</div>` : ""}

<table>
  <thead>
    <tr>
      <th class="num">Nº</th>
      <th>Nome Completo</th>
      <th>CPF</th>
      <th>Data Nasc.</th>
      <th>Categoria</th>
      <th class="seat">Assento</th>
      <th>Embarque</th>
      <th>Obs.</th>
      <th class="sig">Assinatura</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <strong>Totais por categoria:</strong>&nbsp;&nbsp;${totalsRow || `Total: ${allPassengers.length}`}
</div>

<div class="sig-block">
  <div class="sig-line">Assinatura do Responsável pela Excursão</div>
  <div class="sig-line">Assinatura do Motorista</div>
</div>

<div class="footer">
  <span>Nº Manifesto: <strong>${manifestNumber || "—"}</strong> &nbsp;|&nbsp; VisiteCRM — Gestão de Agências de Turismo</span>
  <span>Impresso em ${emitidoEm}</span>
</div>

</body>
</html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }
  };

  const CATEGORY_LABELS: Record<string, string> = { all: "Todas as categorias", ...AGE_CATEGORY_LABELS };
  const BOARDING_LABELS: Record<string, string> = { all: "Todos", embarcado: "Embarcado", pendente: "Pendente" };

  const checkedInCount = allPassengers.filter(p => p.checkedInAt).length;
  const visibleColCount = PASSENGER_COLS.filter(c => visibleCols[c.key]).length + 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Lista de Passageiros — ANTT</h1>
          <p className="text-muted-foreground text-sm">
            {panel?.tripName ?? "Carregando..."}
            {trip && <span> · <MapPin className="inline w-3 h-3 mr-0.5" />{trip.destinationCity}, {trip.destinationState}</span>}
            {panel?.departureDate && (() => {
              const d = parseISO(panel.departureDate);
              const timeStr = format(d, "HH:mm");
              return (
                <span> · <Calendar className="inline w-3 h-3 mr-0.5" />{format(d, "dd/MM/yyyy", { locale: ptBR })}{timeStr !== "00:00" ? ` às ${timeStr}` : ""}</span>
              );
            })()}
            {panel && (
              <span className="ml-3 font-medium text-foreground">{checkedInCount}/{panel.totalPassengers} embarcados</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={isLoading || allPassengers.length === 0}><Download className="w-4 h-4 mr-2" />CSV</Button>
          <Button variant="outline" size="sm" onClick={handlePdfPrint} disabled={isLoading || allPassengers.length === 0}><Download className="w-4 h-4 mr-2" />Imprimir / PDF</Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}><RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />{isSyncing ? "Sincronizando..." : "Sincronizar"}</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={boardingStatusFilter} onValueChange={setBoardingStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(BOARDING_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Colunas visíveis (CSV exporta conforme seleção):</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {PASSENGER_COLS.map(col => (
            <label key={col.key} className="flex items-center gap-1.5 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={visibleCols[col.key]}
                onChange={() => toggleCol(col.key)}
                className="w-4 h-4 accent-primary"
              />
              {col.label}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium w-10">Nº</th>
                {visibleCols.nome && <th className="text-left p-3 font-medium whitespace-nowrap">Passageiro</th>}
                {visibleCols.cpf && <th className="text-left p-3 font-medium whitespace-nowrap">CPF</th>}
                {visibleCols.birthDate && <th className="text-left p-3 font-medium whitespace-nowrap">Dt. Nascimento</th>}
                {visibleCols.seatNumber && <th className="text-left p-3 font-medium whitespace-nowrap">Poltrona</th>}
                {visibleCols.ageCategory && <th className="text-left p-3 font-medium whitespace-nowrap">Categoria</th>}
                {visibleCols.boardingLocation && <th className="text-left p-3 font-medium whitespace-nowrap">Ponto de Embarque</th>}
                {visibleCols.whatsapp && <th className="text-left p-3 font-medium whitespace-nowrap">WhatsApp/Telefone</th>}
                {visibleCols.checkedInAt && <th className="text-center p-3 font-medium whitespace-nowrap">Embarque</th>}
                <th className="text-center p-3 font-medium whitespace-nowrap">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: visibleColCount }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={visibleColCount} className="text-center py-10 text-muted-foreground">Nenhum passageiro encontrado</td></tr>
              ) : (
                filtered.map((p, i) => {
                  const embarcou = !!p.checkedInAt;
                  return (
                    <tr key={p.id} className={`border-b hover:bg-muted/30 ${embarcou ? "bg-green-50/40" : ""}`}>
                      <td className="p-3 text-muted-foreground text-xs">{i + 1}</td>
                      {visibleCols.nome && (
                        <td className="p-3 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {p.name}
                            {!!(p.observations || p.specialNeeds) && (
                              <span title={[p.specialNeeds, p.observations].filter(Boolean).join(" | ")}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 cursor-help">
                                <MessageSquare className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.cpf && <td className="p-3 text-muted-foreground text-xs">{formatCpf(p.cpf)}</td>}
                      {visibleCols.birthDate && (
                        <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                          {p.birthDate ? new Date(p.birthDate).toLocaleDateString("pt-BR") : "—"}
                        </td>
                      )}
                      {visibleCols.seatNumber && <td className="p-3 whitespace-nowrap">{p.seatNumber ?? "—"}</td>}
                      {visibleCols.ageCategory && (
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.ageCategory === "adult" ? "bg-blue-100 text-blue-700" :
                            p.ageCategory === "child" ? "bg-amber-100 text-amber-700" :
                            p.ageCategory === "senior" ? "bg-purple-100 text-purple-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {AGE_CATEGORY_LABELS[p.ageCategory] ?? p.ageCategory}
                          </span>
                        </td>
                      )}
                      {visibleCols.boardingLocation && (
                        <td className="p-3 whitespace-nowrap">
                          {boardingPoints.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <Select
                                value={p.boardingLocationId ?? "__none__"}
                                onValueChange={v => handleBoardingLocationChange(p, v === "__none__" ? null : v)}
                                disabled={updatingLocationId === p.id}
                              >
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue placeholder="— Não definido —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Não definido —</SelectItem>
                                  {boardingPoints.map(bp => (
                                    <SelectItem key={bp.id} value={bp.id}>
                                      {bp.name}{bp.time ? ` (${bp.time})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {updatingLocationId === p.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">{getBoardingPointName(p.boardingLocationId) || "—"}</span>
                          )}
                        </td>
                      )}
                      {visibleCols.whatsapp && (
                        <td className="p-3 text-sm whitespace-nowrap">{getPassengerContact(p)}</td>
                      )}
                      {visibleCols.checkedInAt && (
                        <td className="p-3 text-center">
                          {embarcou ? (
                            <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" /> Embarcado
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Pendente</span>
                          )}
                        </td>
                      )}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm" variant="ghost"
                            className={`h-7 w-7 p-0 ${!!(p.observations || p.specialNeeds) ? "text-amber-600" : "text-muted-foreground"}`}
                            title="Editar observações do passageiro"
                            onClick={() => setEditingPassenger(p)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          {embarcou ? (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => handleUndoCheckIn(p)}>
                              <RotateCcw className="w-3 h-3 mr-1" />Desfazer
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-green-700 hover:text-green-800" onClick={() => handleCheckIn(p)}>
                              <LogIn className="w-3 h-3 mr-1" />Check-in
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Exibindo {filtered.length} de {allPassengers.length} passageiro(s)
        </p>
      )}

      <PassengerObsModal
        passenger={editingPassenger}
        tripId={tripId}
        open={!!editingPassenger}
        onClose={() => setEditingPassenger(null)}
        onSaved={() => refetch()}
      />
    </div>
  );
}

export function TripCalendar() {
  const [, navigate] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const { data: tripsData } = useListTrips({ limit: 200 });
  const trips = tripsData?.data ?? [];

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-200 text-gray-700", active: "bg-green-100 text-green-700",
    confirmed: "bg-blue-100 text-blue-700", completed: "bg-purple-100 text-purple-700", cancelled: "bg-red-100 text-red-700",
  };

  const tripsOnDay = (day: Date) => trips.filter(t => { try { return isSameDay(parseISO(t.departureDate), day); } catch { return false; } });

  const MonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startDow = getDay(monthStart);
    return (
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
            <div key={d} className="p-3 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} className="min-h-[100px] border-b border-r bg-muted/20" />)}
          {calendarDays.map(day => {
            const dayTrips = tripsOnDay(day);
            const today = isToday(day);
            return (
              <div key={day.toISOString()} className={`min-h-[100px] border-b border-r p-1.5 ${today ? "bg-primary/5" : ""}`}>
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-white" : "text-muted-foreground"}`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayTrips.map(trip => (
                    <button key={trip.id} className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate ${STATUS_COLORS[trip.status] ?? "bg-gray-100"}`} onClick={() => setSelectedTrip(trip)}>
                      {trip.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekView = () => {
    const weekStart = startOfWeek(currentDate, { locale: ptBR });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return (
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b">
          {weekDays.map(day => (
            <div key={day.toISOString()} className={`p-3 text-center border-r last:border-r-0 ${isToday(day) ? "bg-primary/5" : ""}`}>
              <p className="text-xs text-muted-foreground">{format(day, "EEE", { locale: ptBR })}</p>
              <p className={`text-sm font-medium mt-0.5 ${isToday(day) ? "text-primary font-bold" : ""}`}>{format(day, "d")}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[300px]">
          {weekDays.map(day => {
            const dayTrips = tripsOnDay(day);
            return (
              <div key={day.toISOString()} className={`p-2 border-r last:border-r-0 space-y-1 ${isToday(day) ? "bg-primary/5" : ""}`}>
                {dayTrips.map(trip => (
                  <button key={trip.id} className={`w-full text-left px-2 py-1.5 rounded text-xs ${STATUS_COLORS[trip.status] ?? "bg-gray-100"}`} onClick={() => setSelectedTrip(trip)}>
                    <p className="font-medium truncate">{trip.name}</p>
                    <p className="text-xs opacity-70">{trip.destinationCity}</p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const DayView = () => {
    const dayTrips = tripsOnDay(currentDate);
    return (
      <div className="bg-card border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">{format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</h3>
        {dayTrips.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Nenhuma viagem neste dia</p>
        ) : (
          <div className="space-y-3">
            {dayTrips.map(trip => (
              <div key={trip.id} className={`p-4 rounded-lg cursor-pointer ${STATUS_COLORS[trip.status] ?? "bg-gray-100"}`} onClick={() => setSelectedTrip(trip)}>
                <p className="font-semibold">{trip.name}</p>
                <p className="text-sm mt-1">{trip.destinationCity}, {trip.destinationState}</p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span>{trip.totalCapacity} assentos</span>
                  <span>{formatCurrency(trip.priceAdult)}/pessoa</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const goBack = () => {
    if (view === "month") setCurrentDate(d => subMonths(d, 1));
    else if (view === "week") setCurrentDate(d => subWeeks(d, 1));
    else setCurrentDate(d => addDays(d, -1));
  };
  const goForward = () => {
    if (view === "month") setCurrentDate(d => addMonths(d, 1));
    else if (view === "week") setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addDays(d, 1));
  };

  const title = view === "month"
    ? format(currentDate, "MMMM yyyy", { locale: ptBR })
    : view === "week"
    ? `Semana de ${format(startOfWeek(currentDate, { locale: ptBR }), "d MMM", { locale: ptBR })}`
    : format(currentDate, "d 'de' MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Calendário de Viagens</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            {(["month", "week", "day"] as const).map(v => (
              <Button key={v} variant={view === v ? "default" : "ghost"} size="sm" className="rounded-none text-xs" onClick={() => setView(v)}>
                {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={goBack}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium min-w-[160px] text-center capitalize">{title}</span>
          <Button variant="outline" size="icon" onClick={goForward}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
        </div>
      </div>

      {view === "month" ? <MonthView /> : view === "week" ? <WeekView /> : <DayView />}

      <Dialog open={!!selectedTrip} onOpenChange={() => setSelectedTrip(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedTrip?.name}</DialogTitle></DialogHeader>
          {selectedTrip && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Destino</p><p className="font-medium">{selectedTrip.destinationCity}, {selectedTrip.destinationState}</p></div>
                <div><p className="text-muted-foreground">Data de Saída</p><p className="font-medium">{formatDate(selectedTrip.departureDate)}</p></div>
                <div><p className="text-muted-foreground">Capacidade</p><p className="font-medium">{selectedTrip.totalCapacity} assentos</p></div>
                <div><p className="text-muted-foreground">Preço Adulto</p><p className="font-medium">{formatCurrency(selectedTrip.priceAdult)}</p></div>
                <div><p className="text-muted-foreground">Ocupação</p><p className="font-medium">{selectedTrip.reservedSeats + selectedTrip.confirmedSeats} reservado(s)</p></div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedTrip.status] ?? "bg-gray-100"}`}>
                    {STATUS_MAP[selectedTrip.status]?.label ?? selectedTrip.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/trips/${selectedTrip.id}/passengers-overview`} className="flex-1">
                  <Button variant="outline" className="w-full" onClick={() => setSelectedTrip(null)}><Eye className="w-4 h-4 mr-2" />Visão Geral</Button>
                </Link>
                <Link href={`/trips/${selectedTrip.id}/edit`} className="flex-1">
                  <Button className="w-full" onClick={() => setSelectedTrip(null)}><Edit className="w-4 h-4 mr-2" />Editar</Button>
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Trips() {
  const [matchNew] = useRoute("/trips/new");
  const [matchCalendar] = useRoute("/trips/calendar");
  const [matchEdit, paramsEdit] = useRoute("/trips/:id/edit");
  const [matchSeatMap, paramsSeatMap] = useRoute("/trips/:id/seat-map");
  const [matchPassengersOverview, paramsPassengersOverview] = useRoute("/trips/:id/passengers-overview");
  const [matchPassengers, paramsPassengers] = useRoute("/trips/:id/passengers");
  const [matchDetail, paramsDetail] = useRoute("/trips/:id");

  if (matchNew) return <TripForm />;
  if (matchCalendar) return <TripCalendar />;
  if (matchEdit && paramsEdit?.id) return <TripForm tripId={paramsEdit.id} />;
  if (matchSeatMap && paramsSeatMap?.id) return <SeatMap tripId={paramsSeatMap.id} />;
  if (matchPassengersOverview && paramsPassengersOverview?.id) return <PassengersOverview tripId={paramsPassengersOverview.id} />;
  if (matchPassengers && paramsPassengers?.id) return <PassengersList tripId={paramsPassengers.id} />;
  if (matchDetail && paramsDetail?.id) return <PassengersOverview tripId={paramsDetail.id} />;

  return <TripList />;
}
