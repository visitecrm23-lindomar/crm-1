import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  useListTrips, useCreateTrip, useGetTrip, useUpdateTrip, useDeleteTrip,
  useGetTripSeatMap, useListReservations, useListClients, useCreateReservation, useUpdateReservation, useCreateClient,
} from "@workspace/api-client-react";
import type { Trip, Seat } from "@workspace/api-client-react";
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
import {
  Plus, Search, MapPin, Calendar, Users, Bus, Edit, Trash2, Eye, ChevronsLeft, ChevronsRight,
  LayoutGrid, List, ChevronLeft, ChevronRight, ArrowLeft, Check, X, Download, Send, Copy,
  AlertCircle, DollarSign,
} from "lucide-react";
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isToday, startOfWeek, addDays,
  addWeeks, subWeeks,
} from "date-fns";
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:      { label: "Rascunho",   color: "bg-gray-100 text-gray-600" },
  active:     { label: "Ativa",      color: "bg-green-100 text-green-700" },
  confirmed:  { label: "Confirmada", color: "bg-blue-100 text-blue-700" },
  completed:  { label: "Concluída",  color: "bg-purple-100 text-purple-700" },
  cancelled:  { label: "Cancelada",  color: "bg-red-100 text-red-700" },
};
const VEHICLE_TYPES = ["Ônibus", "Micro-ônibus", "Van", "Carro", "Outro"];
const TRIP_TYPES = ["excursion", "package", "custom", "transfer"];
const TRIP_TYPE_LABELS: Record<string, string> = {
  excursion: "Excursão", package: "Pacote", custom: "Personalizado", transfer: "Transfer",
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

export function TripList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const { data: tripsData, isLoading, refetch } = useListTrips({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page, limit: 12,
  });
  const createTrip = useCreateTrip();
  const deleteTrip = useDeleteTrip();

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
          <p className="text-muted-foreground text-sm">Gerencie excursões e pacotes da agência</p>
        </div>
        <div className="flex gap-2">
          <Link href="/trips/calendar"><Button variant="outline"><Calendar className="w-4 h-4 mr-2" />Calendário</Button></Link>
          <Link href="/trips/new"><Button><Plus className="w-4 h-4 mr-2" />Nova Viagem</Button></Link>
        </div>
      </div>

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
          <p className="text-sm mt-1">Crie sua primeira viagem para começar</p>
          <Link href="/trips/new"><Button className="mt-4">Nova Viagem</Button></Link>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} onDelete={() => setDeletingId(trip.id)} onDuplicate={() => handleDuplicate(trip)} navigate={navigate} />
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
                <p className="text-sm text-muted-foreground">{trip.destinationCity}, {trip.destinationState} · {formatDate(trip.departureDate)}</p>
              </div>
              <div className="hidden md:block w-40">
                <OccupancyBar reserved={trip.reservedSeats} confirmed={trip.confirmedSeats} total={trip.totalCapacity} />
              </div>
              <Badge className={STATUS_MAP[trip.status]?.color}>{STATUS_MAP[trip.status]?.label ?? trip.status}</Badge>
              <div className="flex gap-1">
                <Link href={`/trips/${trip.id}/passengers-overview`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Visão Geral"><Eye className="w-4 h-4" /></Button></Link>
                <Link href={`/trips/${trip.id}/passengers`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Passageiros"><Users className="w-4 h-4" /></Button></Link>
                <Link href={`/trips/${trip.id}/seat-map`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Mapa de Assentos"><Bus className="w-4 h-4" /></Button></Link>
                <Link href={`/trips/${trip.id}/edit`}><Button size="icon" variant="ghost" className="h-8 w-8" title="Editar"><Edit className="w-4 h-4" /></Button></Link>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDuplicate(trip)} title="Duplicar"><Copy className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeletingId(trip.id)} title="Excluir"><Trash2 className="w-4 h-4" /></Button>
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
    </div>
  );
}

function TripCard({ trip, onDelete, onDuplicate, navigate }: { trip: Trip; onDelete: () => void; onDuplicate: () => void; navigate: (to: string) => void }) {
  const pct = trip.totalCapacity > 0 ? Math.round((trip.reservedSeats + trip.confirmedSeats) / trip.totalCapacity * 100) : 0;
  const statusInfo = STATUS_MAP[trip.status] ?? { label: trip.status, color: "bg-gray-100 text-gray-600" };
  return (
    <div className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-36 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        {trip.coverImage ? <img src={trip.coverImage} alt={trip.name} className="w-full h-full object-cover" /> : <MapPin className="w-12 h-12 text-primary/30" />}
        <div className="absolute top-3 right-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span></div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold truncate">{trip.name}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{trip.destinationCity}, {trip.destinationState}</p>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="w-3 h-3" /><span>{formatDate(trip.departureDate)}</span>
          {trip.returnDate && <><span>—</span><span>{formatDate(trip.returnDate)}</span></>}
        </div>
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
          <Link href={`/trips/${trip.id}/seat-map`}>
            <Button variant="outline" size="sm" className="text-xs"><Bus className="w-3 h-3 mr-1" />Mapa</Button>
          </Link>
          <Link href={`/trips/${trip.id}/edit`}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Editar"><Edit className="w-4 h-4" /></Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onDuplicate} title="Duplicar">
            <Copy className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} title="Excluir"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

interface BoardingPoint { id: string; name: string; time: string; address: string; }
interface ItineraryDay { day: number; title: string; description: string; }
interface CostItem { id: string; label: string; amount: string; }
interface TripFormData {
  name: string; description: string;
  destination: string; destinationCity: string; destinationState: string;
  type: string; category: string;
  departureDate: string; returnDate: string;
  totalCapacity: string; seatLayout: string;
  priceAdult: string; priceChild: string; priceSenior: string;
  inclusions: string; exclusions: string;
  coverImage: string;
  vehicleType: string; vehiclePlate: string; driverName: string;
  status: string;
  boardingPoints: BoardingPoint[];
  itinerary: ItineraryDay[];
  costs: CostItem[];
  fixedCosts: string;
  variableCosts: string;
  gallery: string[];
  accommodation: string;
  guide: string;
}

const newBP = (): BoardingPoint => ({ id: crypto.randomUUID(), name: "", time: "", address: "" });
const newDay = (day: number): ItineraryDay => ({ day, title: "", description: "" });
const newCost = (): CostItem => ({ id: crypto.randomUUID(), label: "", amount: "" });
const EMPTY_FORM: TripFormData = {
  name: "", description: "", destination: "", destinationCity: "", destinationState: "",
  type: "excursion", category: "standard", departureDate: "", returnDate: "",
  totalCapacity: "46", seatLayout: "2x2",
  priceAdult: "", priceChild: "", priceSenior: "",
  inclusions: "", exclusions: "", coverImage: "",
  vehicleType: "", vehiclePlate: "", driverName: "", status: "draft",
  boardingPoints: [newBP()], itinerary: [newDay(1)], costs: [], fixedCosts: "", variableCosts: "", gallery: [], accommodation: "", guide: "",
};
const toTripFormData = (trip: Trip & { itinerary?: ItineraryDay[]; fixedCosts?: string | number | null; variableCosts?: string | number | null; gallery?: string[] | null; boardingPoints?: BoardingPoint[] | null; accommodation?: string | null; guide?: string | null; }): TripFormData => ({
  name: trip.name,
  description: trip.description ?? "",
  destination: trip.destination,
  destinationCity: trip.destinationCity,
  destinationState: trip.destinationState,
  type: trip.type,
  category: trip.category,
  departureDate: trip.departureDate.split("T")[0],
  returnDate: trip.returnDate?.split("T")[0] ?? "",
  totalCapacity: String(trip.totalCapacity),
  seatLayout: trip.seatLayout ?? "2x2",
  priceAdult: String(trip.priceAdult),
  priceChild: trip.priceChild ? String(trip.priceChild) : "",
  priceSenior: trip.priceSenior ? String(trip.priceSenior) : "",
  inclusions: (trip.inclusions ?? []).join("\n"),
  exclusions: (trip.exclusions ?? []).join("\n"),
  coverImage: trip.coverImage ?? "",
  vehicleType: trip.vehicleType ?? "",
  vehiclePlate: trip.vehiclePlate ?? "",
  driverName: trip.driverName ?? "",
  status: trip.status,
  boardingPoints: trip.boardingPoints?.length ? trip.boardingPoints : [newBP()],
  itinerary: trip.itinerary?.length ? trip.itinerary : [newDay(1)],
  costs: [],
  fixedCosts: trip.fixedCosts != null ? String(trip.fixedCosts) : "",
  variableCosts: trip.variableCosts != null ? String(trip.variableCosts) : "",
  gallery: trip.gallery ?? [],
  accommodation: trip.accommodation ?? "",
  guide: trip.guide ?? "",
});

export function TripForm({ tripId }: { tripId?: string }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("basico");
  const [form, setForm] = useState<TripFormData>(EMPTY_FORM);

  const { data: existingTrip } = useGetTrip(tripId ?? "", { query: { enabled: !!tripId, queryKey: ["/api/trips", tripId] } });
  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const isPending = createTrip.isPending || updateTrip.isPending;

  useEffect(() => {
    if (!existingTrip || !tripId) return;
    setForm(toTripFormData(existingTrip as Trip & { itinerary?: ItineraryDay[]; fixedCosts?: string | number | null; variableCosts?: string | number | null; gallery?: string[] | null; boardingPoints?: BoardingPoint[] | null; accommodation?: string | null; guide?: string | null; }));
  }, [existingTrip?.id, tripId]);

  const set = (k: keyof TripFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));
  const setVal = (k: keyof TripFormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const totalCosts = form.costs.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);
  const fixedCostsNum = parseFloat(form.fixedCosts || "0");
  const variableCostsNum = parseFloat(form.variableCosts || "0");
  const grossRevenue = parseFloat(form.priceAdult || "0") * parseInt(form.totalCapacity || "0");
  const effectiveCosts = fixedCostsNum + variableCostsNum * parseInt(form.totalCapacity || "0");
  const margin = grossRevenue - Math.max(effectiveCosts, totalCosts);
  const marginPct = grossRevenue > 0 ? Math.round(margin / grossRevenue * 100) : 0;

  const handleSave = async (publish = false) => {
    const inclArr = form.inclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const exclArr = form.exclusions.split("\n").map(s => s.trim()).filter(Boolean);
    const statusToSave = publish ? "active" : form.status;
    const itineraryToSave = form.itinerary.filter(d => d.title || d.description);
    const fixedCostsNum = form.fixedCosts ? parseFloat(form.fixedCosts) : undefined;
    const variableCostsNum = form.variableCosts ? parseFloat(form.variableCosts) : undefined;
    if (tripId) {
      await updateTrip.mutateAsync({
        id: tripId,
        data: {
          name: form.name, description: form.description || undefined,
          destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
          type: form.type, category: form.category,
          departureDate: form.departureDate, returnDate: form.returnDate || undefined,
          totalCapacity: parseInt(form.totalCapacity),
          priceAdult: parseFloat(form.priceAdult),
          priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
          priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
          inclusions: inclArr, exclusions: exclArr,
          coverImage: form.coverImage || undefined,
          seatLayout: form.seatLayout,
          vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined,
          status: statusToSave,
          itinerary: itineraryToSave.length ? itineraryToSave : undefined,
          fixedCosts: fixedCostsNum,
          variableCosts: variableCostsNum,
          gallery: form.gallery.length ? form.gallery : undefined,
        },
      });
    } else {
      await createTrip.mutateAsync({
        data: {
          name: form.name, description: form.description || undefined,
          destination: form.destination, destinationCity: form.destinationCity, destinationState: form.destinationState,
          type: form.type, category: form.category,
          departureDate: form.departureDate, returnDate: form.returnDate || undefined,
          totalCapacity: parseInt(form.totalCapacity),
          priceAdult: parseFloat(form.priceAdult),
          priceChild: form.priceChild ? parseFloat(form.priceChild) : undefined,
          priceSenior: form.priceSenior ? parseFloat(form.priceSenior) : undefined,
          inclusions: inclArr, exclusions: exclArr,
          coverImage: form.coverImage || undefined,
          seatLayout: form.seatLayout,
          vehicleType: form.vehicleType || undefined, vehiclePlate: form.vehiclePlate || undefined, driverName: form.driverName || undefined,
          status: statusToSave,
          itinerary: itineraryToSave.length ? itineraryToSave : undefined,
          fixedCosts: fixedCostsNum,
          variableCosts: variableCostsNum,
          gallery: form.gallery.length ? form.gallery : undefined,
        },
      });
    }
    navigate("/trips");
  };

  const TABS = [
    { id: "basico", label: "Informações Básicas" },
    { id: "precos", label: "Preços" },
    { id: "pontos", label: "Pontos de Embarque" },
    { id: "roteiro", label: "Roteiro" },
    { id: "inclusoes", label: "Inclusões / Exclusões" },
    { id: "custos", label: "Financeiro / Custos" },
    { id: "transporte", label: "Transporte e Hospedagem" },
    { id: "midia", label: "Mídia" },
  ];

  const canSave = !!form.name && !!form.destination && !!form.departureDate && !!form.priceAdult;

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
                <Label>Destino / Título *</Label>
                <Input placeholder="Nordeste Brasileiro" value={form.destination} onChange={set("destination")} />
              </div>
              <div className="space-y-2">
                <Label>Cidade *</Label>
                <Input placeholder="Natal" value={form.destinationCity} onChange={set("destinationCity")} />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF) *</Label>
                <Input placeholder="RN" maxLength={2} value={form.destinationState} onChange={set("destinationState")} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={setVal("type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIP_TYPES.map(t => <SelectItem key={t} value={t}>{TRIP_TYPE_LABELS[t] ?? t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Saída *</Label>
                <Input type="date" value={form.departureDate} onChange={set("departureDate")} />
              </div>
              <div className="space-y-2">
                <Label>Data de Retorno</Label>
                <Input type="date" value={form.returnDate} onChange={set("returnDate")} />
              </div>
              <div className="space-y-2">
                <Label>Capacidade Total (assentos) *</Label>
                <Input type="number" min="1" max="200" value={form.totalCapacity} onChange={set("totalCapacity")} />
              </div>
              <div className="space-y-2">
                <Label>Layout dos Assentos</Label>
                <Select value={form.seatLayout} onValueChange={setVal("seatLayout")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2x2">2x2 (Padrão)</SelectItem>
                    <SelectItem value="2x1">2x1 (Premium)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="precos" className="space-y-4 mt-6">
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
            {form.priceAdult && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Receita Estimada com {form.totalCapacity || 0} assentos</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Receita Bruta Máxima:</span><span className="ml-2 font-semibold">{formatCurrency(grossRevenue)}</span></div>
                  <div><span className="text-muted-foreground">Ocupação 80%:</span><span className="ml-2 font-semibold">{formatCurrency(grossRevenue * 0.8)}</span></div>
                </div>
              </div>
            )}
          </div>
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

        <TabsContent value="custos" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Custos Operacionais</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Custo Fixo (R$)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.fixedCosts} onChange={set("fixedCosts")} />
                <p className="text-xs text-muted-foreground">Fretamento, guia, hotel, etc.</p>
              </div>
              <div className="space-y-2">
                <Label>Custo Variável (R$)</Label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.variableCosts} onChange={set("variableCosts")} />
                <p className="text-xs text-muted-foreground">Por passageiro: alimentação, ingressos, etc.</p>
              </div>
            </div>
          </div>
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Detalhamento de Custos</h3>
              <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, costs: [...prev.costs, newCost()] }))}>
                <Plus className="w-4 h-4 mr-1" />Adicionar Item
              </Button>
            </div>
            {form.costs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item cadastrado. Use para detalhar os custos individualmente.</p>
            )}
            <div className="space-y-2">
              {form.costs.map((cost) => (
                <div key={cost.id} className="flex items-center gap-3">
                  <Input placeholder="Descrição (ex: Fretamento do ônibus)" value={cost.label} onChange={e => setForm(prev => ({ ...prev, costs: prev.costs.map(c => c.id === cost.id ? { ...c, label: e.target.value } : c) }))} className="flex-1" />
                  <Input type="number" step="0.01" placeholder="0.00" value={cost.amount} onChange={e => setForm(prev => ({ ...prev, costs: prev.costs.map(c => c.id === cost.id ? { ...c, amount: e.target.value } : c) }))} className="w-36" />
                  <Button size="icon" variant="ghost" className="shrink-0 text-destructive" onClick={() => setForm(prev => ({ ...prev, costs: prev.costs.filter(c => c.id !== cost.id) }))}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
            {form.costs.length > 0 && (
              <div className="border-t pt-3 flex justify-between text-sm font-medium">
                <span>Total Detalhado:</span><span>{formatCurrency(totalCosts)}</span>
              </div>
            )}
          </div>
          <div className="bg-card border rounded-lg p-6 space-y-3">
            <h3 className="font-semibold">Análise de Margem</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita Bruta Estimada:</span><span>{formatCurrency(grossRevenue)}</span>
            </div>
            <div className={`flex justify-between text-sm font-bold ${marginPct >= 20 ? "text-green-600" : marginPct >= 10 ? "text-amber-600" : "text-red-600"}`}>
              <span>Margem Estimada ({marginPct}%):</span><span>{formatCurrency(margin)}</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${marginPct >= 20 ? "bg-green-500" : marginPct >= 10 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.max(0, Math.min(100, marginPct))}%` }} />
            </div>
            {marginPct < 10 && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Atenção: margem abaixo de 10%. Revise os custos ou ajuste o preço.</span>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transporte" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Veículo e Motorista</h3>
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
              <div className="space-y-2">
                <Label>Nome do Motorista</Label>
                <Input placeholder="João da Silva" value={form.driverName} onChange={set("driverName")} />
              </div>
              <div className="space-y-2">
                <Label>Guia Turístico</Label>
                <Input placeholder="Maria Costa" value={form.guide} onChange={set("guide")} />
              </div>
            </div>
          </div>
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Hospedagem</h3>
            <div className="space-y-2">
              <Label>Hotel / Pousada</Label>
              <Input placeholder="Hotel Beira Mar — Natal, RN" value={form.accommodation} onChange={set("accommodation")} />
            </div>
            <p className="text-xs text-muted-foreground">Integração com cadastro de hospedagens disponível em breve.</p>
          </div>
        </TabsContent>

        <TabsContent value="midia" className="space-y-4 mt-6">
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold">Imagem de Capa</h3>
            <div className="space-y-2">
              <Label>URL da Imagem de Capa</Label>
              <Input placeholder="https://exemplo.com/imagem.jpg" value={form.coverImage} onChange={set("coverImage")} />
            </div>
            {form.coverImage && (
              <div className="mt-3 rounded-lg overflow-hidden h-48 bg-muted">
                <img src={form.coverImage} alt="Preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Galeria de Imagens</h4>
                <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, gallery: [...prev.gallery, ""] }))}>
                  <Plus className="w-4 h-4 mr-1" />Adicionar URL
                </Button>
              </div>
              {form.gallery.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma imagem na galeria. Adicione URLs de imagens.</p>
              )}
              <div className="space-y-2">
                {form.gallery.map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input placeholder="https://exemplo.com/foto.jpg" value={url} onChange={e => setForm(prev => ({ ...prev, gallery: prev.gallery.map((u, i) => i === idx ? e.target.value : u) }))} className="flex-1" />
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setForm(prev => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== idx) }))}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between bg-card border rounded-lg p-4">
        <Button variant="ghost" onClick={() => navigate("/trips")}>Cancelar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={isPending || !canSave}>
            {isPending ? "Salvando..." : "Salvar como Rascunho"}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={isPending || !canSave}>
            {isPending ? "Publicando..." : "Publicar Viagem"}
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
  const { data: seatMap, refetch: refetchSeatMap } = useGetTripSeatMap(tripId);
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
  const cols = seatMap?.layout === "2x1" ? 3 : 4;

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
        refetchSeatMap();
      } else {
        if (!manualName) { setAssignError("Informe o nome do passageiro."); setIsSaving(false); return; }
        if (!manualEmail) { setAssignError("Informe o e-mail do passageiro."); setIsSaving(false); return; }
        const newClient = await createClient.mutateAsync({
          data: {
            name: manualName,
            email: manualEmail,
            whatsapp: manualPhone || "00000000000",
            cpf: manualCpf || undefined,
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
        refetchSeatMap();
      }
    } catch {
      setAssignError("Erro ao salvar reserva. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  function getSeatColor(status: string) {
    switch (status) {
      case "available": return "bg-white border-2 border-gray-200 hover:border-primary hover:bg-primary/5 cursor-pointer";
      case "reserved":
      case "occupied": return "bg-orange-400 border-2 border-orange-500 text-white cursor-not-allowed";
      case "confirmed": return "bg-green-500 border-2 border-green-600 text-white cursor-not-allowed";
      case "blocked": return "bg-gray-300 border-2 border-gray-400 text-gray-600 cursor-not-allowed";
      default: return "bg-gray-100 border-2 border-gray-200";
    }
  }

  const selectedClient = clientsData?.data?.find(c => c.id === selectedClientId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Mapa de Assentos</h1>
          <p className="text-muted-foreground text-sm">{trip?.name}</p>
        </div>
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
                const leftSeats = rowSeats.filter(s => s.col <= 2);
                const rightSeats = rowSeats.filter(s => s.col > 2);
                return (
                  <div key={rowNum} className="flex items-center gap-2 justify-center">
                    <div className="flex gap-1">
                      {leftSeats.map(seat => (
                        <button
                          key={seat.number}
                          className={`w-10 h-10 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(getEffectiveStatus(seat))}`}
                          onClick={() => handleSeatClick(seat)}
                          title={`Assento ${seat.number} — ${getEffectiveStatus(seat)}`}
                          disabled={getEffectiveStatus(seat) !== "available"}
                        >
                          {seat.number}
                        </button>
                      ))}
                    </div>
                    <div className="w-5 text-center text-xs text-muted-foreground shrink-0">|</div>
                    <div className="flex gap-1">
                      {rightSeats.map(seat => (
                        <button
                          key={seat.number}
                          className={`w-10 h-10 rounded-md text-xs font-bold flex items-center justify-center transition-all ${getSeatColor(getEffectiveStatus(seat))}`}
                          onClick={() => handleSeatClick(seat)}
                          title={`Assento ${seat.number} — ${getEffectiveStatus(seat)}`}
                          disabled={getEffectiveStatus(seat) !== "available"}
                        >
                          {seat.number}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 justify-center text-xs flex-wrap">
              {[
                { color: "bg-white border-2 border-gray-200", label: "Disponível" },
                { color: "bg-orange-400", label: "Reservado" },
                { color: "bg-green-500", label: "Confirmado" },
                { color: "bg-gray-300", label: "Bloqueado" },
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

export function PassengersOverview({ tripId: initialTripId }: { tripId: string }) {
  const [, navigate] = useLocation();
  const [tripId, setTripId] = useState(initialTripId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; paymentMethod: string }>({ status: "", paymentMethod: "" });
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: allTripsData } = useListTrips({ limit: 100 });
  const { data: trip } = useGetTrip(tripId, { query: { queryKey: ["/api/trips", tripId] } });
  const { data: reservations, refetch: refetchReservations } = useListReservations({ tripId, limit: 200 });
  const updateReservation = useUpdateReservation();

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
          <p className="text-muted-foreground text-sm">{trip?.name} · {trip ? formatDate(trip.departureDate) : ""}</p>
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
          {trip.driverName && <span className="text-sm text-muted-foreground">Guia/Motorista: <strong>{trip.driverName}</strong></span>}
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
                  { key: "voucher", label: "Voucher" },
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
                    <td className="p-2 font-medium">{r.client.name}</td>
                    <td className="p-2"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.voucherCode}</code></td>
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
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(r)} title="Editar"><Edit className="w-3 h-3" /></Button>
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
          <Button variant="outline"><Download className="w-4 h-4 mr-2" />Relatório Financeiro</Button>
          <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"><X className="w-4 h-4 mr-2" />Encerrar Viagem</Button>
        </div>
      </div>
    </div>
  );
}

export function PassengersList({ tripId }: { tripId: string }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [boardingFilter, setBoardingFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: trip } = useGetTrip(tripId, { query: { queryKey: ["/api/trips", tripId] } });
  const { data: reservations, isLoading } = useListReservations({
    tripId,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
    page, limit: 20,
  });

  const passengers = useMemo(() => {
    return (reservations?.data ?? []).filter(r => {
      if (paymentFilter !== "all") {
        const isPaid = r.balance <= 0 && r.paidValue > 0;
        const isPending = r.balance > 0 && r.paidValue > 0;
        const isUnpaid = r.paidValue === 0;
        const isOverdue = isUnpaid || isPending;
        if (paymentFilter === "paid" && !isPaid) return false;
        if (paymentFilter === "pending" && !isPending) return false;
        if (paymentFilter === "unpaid" && !isUnpaid) return false;
        if (paymentFilter === "overdue" && !isOverdue) return false;
      }
      if (typeFilter !== "all") {
        const bdate = (r.client as unknown as Record<string, unknown>).birthDate as string | undefined;
        const age = bdate ? new Date().getFullYear() - new Date(bdate).getFullYear() : null;
        const isChild = age !== null && age < 12;
        const isSenior = age !== null && age >= 60;
        if (typeFilter === "adult" && (isChild || isSenior)) return false;
        if (typeFilter === "child" && !isChild) return false;
        if (typeFilter === "senior" && !isSenior) return false;
      }
      if (boardingFilter !== "all") {
        const bp = (r as unknown as Record<string, unknown>).boardingPoint as string | undefined;
        if (bp !== boardingFilter) return false;
      }
      return true;
    }).map(r => {
      const bdate = (r.client as unknown as Record<string, unknown>).birthDate as string | undefined;
      const age = bdate ? new Date().getFullYear() - new Date(bdate).getFullYear() : null;
      const passengerType = age === null ? "Adulto" : age < 12 ? "Criança" : age >= 60 ? "Sênior" : "Adulto";
      const isPaid = r.balance <= 0 && r.paidValue > 0;
      const isPending = r.balance > 0 && r.paidValue > 0;
      const paymentStatus = isPaid ? "Pago" : isPending ? "Parcial" : r.paidValue === 0 ? "Não pago" : "Pendente";
      const paymentStatusColor = isPaid ? "bg-green-100 text-green-700" : isPending ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
      return {
        reservationId: r.id,
        name: r.client.name,
        cpf: (r.client as Record<string, unknown>).cpf as string | undefined,
        birthDate: bdate,
        whatsapp: r.client.whatsapp,
        email: r.client.email,
        passengerType,
        voucherCode: r.voucherCode,
        seats: r.seats.join(", "),
        status: r.status,
        paymentMethod: r.paymentMethod ?? "-",
        paymentStatus,
        paymentStatusColor,
        totalValue: r.totalValue,
        paidValue: r.paidValue,
        balance: r.balance,
        checkedIn: !!r.checkedInAt,
        hasInsurance: r.hasInsurance,
      };
    });
  }, [reservations, paymentFilter, typeFilter, boardingFilter]);

  const totalPages = Math.ceil((reservations?.total ?? 0) / 20);
  const allSelected = passengers.length > 0 && passengers.every(p => selectedIds.has(p.reservationId));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(passengers.map(p => p.reservationId)));
  };
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const STATUS_LABELS: Record<string, string> = { all: "Todos", confirmed: "Confirmado", pending: "Pendente", cancelled: "Cancelado", completed: "Concluído" };
  const PAYMENT_STATUS_LABELS: Record<string, string> = { all: "Todos os status de pag.", paid: "Pago", pending: "Pagamento Parcial", unpaid: "Não pago", overdue: "Em aberto" };
  const TYPE_LABELS: Record<string, string> = { all: "Todos os tipos", adult: "Adulto", child: "Criança (< 12)", senior: "Sênior (60+)" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/trips")}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Lista de Passageiros — ANTT</h1>
          <p className="text-muted-foreground text-sm">{trip?.name} · {trip ? formatDate(trip.departureDate) : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />CSV</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />PDF</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Excel</Button>
          <Button variant="outline" size="sm"><Send className="w-4 h-4 mr-2" />WhatsApp em Massa</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar passageiro..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(1); }}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={boardingFilter} onValueChange={v => { setBoardingFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Ponto de embarque" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os embarques</SelectItem>
            {(trip as Trip & { boardingPoints?: { name: string }[] })?.boardingPoints?.map?.((bp: { name: string }) => (
              <SelectItem key={bp.name} value={bp.name}>{bp.name}</SelectItem>
            )) ?? null}
          </SelectContent>
        </Select>
        <Link href={`/reservations?tripId=${tripId}&new=true`}><Button><Plus className="w-4 h-4 mr-2" />Adicionar</Button></Link>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/10 rounded-lg p-3 text-sm">
          <span className="font-medium">{selectedIds.size} selecionado(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} className="h-7">Desmarcar</Button>
          <Button size="sm" variant="outline" className="h-7"><Check className="w-3 h-3 mr-1" />Check-in</Button>
          <Button size="sm" variant="outline" className="h-7"><Download className="w-3 h-3 mr-1" />Vouchers</Button>
          <Button size="sm" variant="outline" className="h-7"><Send className="w-3 h-3 mr-1" />WhatsApp</Button>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Passageiro</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">CPF</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Nascimento</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Tipo</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Contato</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Assento(s)</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Voucher</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Reserva</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Sit. Pgto.</th>
                <th className="text-right p-3 font-medium whitespace-nowrap">Valor</th>
                <th className="text-right p-3 font-medium whitespace-nowrap">Saldo</th>
                <th className="text-center p-3 font-medium whitespace-nowrap">Check-in</th>
                <th className="text-center p-3 font-medium whitespace-nowrap">Seguro</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 14 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))
              ) : passengers.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-muted-foreground">Nenhum passageiro encontrado</td></tr>
              ) : (
                passengers.map(p => (
                  <tr key={p.reservationId} className="border-b hover:bg-muted/30">
                    <td className="p-3"><Checkbox checked={selectedIds.has(p.reservationId)} onCheckedChange={() => toggleOne(p.reservationId)} /></td>
                    <td className="p-3 font-medium whitespace-nowrap">{p.name}</td>
                    <td className="p-3 text-muted-foreground text-xs">{p.cpf ?? "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{p.birthDate ? new Date(p.birthDate).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="p-3 text-xs"><span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.passengerType}</span></td>
                    <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{p.whatsapp}</td>
                    <td className="p-3 whitespace-nowrap">{p.seats || "—"}</td>
                    <td className="p-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.voucherCode}</code></td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "confirmed" ? "bg-green-100 text-green-700" : p.status === "pending" ? "bg-amber-100 text-amber-700" : p.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.paymentStatusColor}`}>{p.paymentStatus}</span>
                    </td>
                    <td className="p-3 text-right font-medium whitespace-nowrap">{formatCurrency(p.totalValue)}</td>
                    <td className={`p-3 text-right font-medium whitespace-nowrap ${p.balance > 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(p.balance)}</td>
                    <td className="p-3 text-center">{p.checkedIn ? <Check className="w-4 h-4 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-center">{p.hasInsurance ? <Check className="w-4 h-4 text-blue-600 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground mx-auto" />}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
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
