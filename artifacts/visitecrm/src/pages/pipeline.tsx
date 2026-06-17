import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  DndContext, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import {
  useListPipelineStages, useListDeals, useMoveDeal,
  useDeleteDeal, useListClients, useListTrips, useUpdateDeal,
} from "@workspace/api-client-react";
import type { Deal, PipelineStage, Client } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { ClientModal } from "./clients";
import { Client360Modal } from "@/components/client360-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Search, Trash2, Phone, Calendar, MapPin, X, Pencil, UserPen, Eye, BookOpen,
  ExternalLink, ShoppingBag, ChevronDown, ChevronUp, BarChart2, Loader2, XCircle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DEAL_STATUS } from "@workspace/permissions";
import { formatCurrency } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const LOST_REASONS = [
  "Preço",
  "Destino indisponível",
  "Preferiu concorrente",
  "Cliente desistiu",
  "Sem resposta",
  "Outro",
];

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: "Lead", prospect: "Prospecto", client: "Cliente", vip: "VIP", inactive: "Inativo",
};

// ─── Lost Reason Modal ────────────────────────────────────────────────────────

interface LostReasonModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, obs: string) => Promise<void>;
}

function LostReasonModal({ open, onClose, onConfirm }: LostReasonModalProps) {
  const [reason, setReason] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setReason(""); setObs(""); }
  }, [open]);

  async function handleSubmit() {
    if (!reason) return;
    setLoading(true);
    try { await onConfirm(reason, obs); } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive" />
            Motivo da Perda
          </DialogTitle>
          <DialogDescription>Por que este negócio não foi fechado?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
            {LOST_REASONS.map(r => (
              <div key={r} className="flex items-center gap-2.5">
                <RadioGroupItem value={r} id={`lr-${r}`} />
                <Label htmlFor={`lr-${r}`} className="cursor-pointer font-normal">{r}</Label>
              </div>
            ))}
          </RadioGroup>
          <div>
            <Label className="text-sm font-medium">Observação (opcional)</Label>
            <Textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Detalhe adicional sobre a perda..."
              className="mt-1.5"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason || loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Confirmar Perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Analytics Panel ──────────────────────────────────────────────────────────

interface AnalyticsData {
  stages: { stageId: string; stageName: string; color: string; count: number; value: number; avgDays: number; conversionRate: number; cumulativeRate: number }[];
  lostReasons: { reason: string; count: number }[];
  totalPipeline: number;
  totalLost: number;
}

function AnalyticsPanel({ pipelineId }: { pipelineId: string }) {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["pipeline-analytics", pipelineId],
    queryFn: async () => {
      const resp = await fetch(`${API_BASE}/api/pipeline/${pipelineId}/analytics`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed");
      return resp.json();
    },
    enabled: !!pipelineId,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex gap-4 py-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 flex-1 rounded-lg" />)}
      </div>
    );
  }
  if (!data) return null;

  const maxCount = Math.max(...(data.stages.map(s => s.count)), 1);
  const maxLostCount = Math.max(...(data.lostReasons.map(r => r.count)), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
      {/* Conversion Funnel */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Funil de Conversão</p>
        <div className="space-y-2">
          {data.stages.map((s, idx) => (
            <div key={s.stageId} className="flex items-center gap-3">
              <div className="w-28 truncate text-xs font-medium shrink-0">{s.stageName}</div>
              <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max((s.count / maxCount) * 100, 4)}%`,
                    backgroundColor: s.color,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0 w-20">
                <span className="font-semibold text-foreground">{s.count}</span>
                {s.avgDays > 0 && <span className="text-[10px] ml-1 text-muted-foreground">({s.avgDays}d)</span>}
                {idx > 0 && (
                  <span className={`ml-1 text-[10px] font-medium ${s.conversionRate >= 50 ? "text-green-600" : s.conversionRate >= 25 ? "text-amber-500" : "text-red-500"}`}>
                    {s.conversionRate}%↓
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary + Lost Reasons */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Em negociação</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(data.totalPipeline)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">Negócios perdidos</p>
            <p className="text-lg font-bold text-destructive">{data.totalLost}</p>
          </div>
        </div>
        {data.lostReasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Principais Motivos de Perda</p>
            <div className="space-y-1.5">
              {data.lostReasons.map(r => (
                <div key={r.reason} className="flex items-center gap-2">
                  <div className="flex-1 text-xs truncate">{r.reason}</div>
                  <div className="w-24 bg-muted rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full"
                      style={{ width: `${(r.count / maxLostCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-5 text-right">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.lostReasons.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nenhum negócio perdido registrado ainda.</p>
        )}
      </div>
    </div>
  );
}

// ─── Card Components ──────────────────────────────────────────────────────────

interface ClientCardProps {
  deal: Deal;
  clientsById: Map<string, Client>;
  tripsById: Map<string, string>;
  onEditClient: (client: Client) => void;
  onView360: (clientId: string) => void;
  onDelete: (id: string) => void;
  onCreateReservation: (deal: Deal) => void;
  onViewReservation: (reservationId: string) => void;
  onMarkLost?: (deal: Deal) => void;
  isFinalStage: boolean;
  isLostStage?: boolean;
  isDragging?: boolean;
}

function ClientCardContent({ deal, clientsById, tripsById, onEditClient, onView360, onDelete, onCreateReservation, onViewReservation, onMarkLost, isFinalStage, isLostStage, isDragging }: ClientCardProps) {
  const client = deal.clientId ? clientsById.get(deal.clientId) : undefined;
  const name = client?.name ?? deal.leadName ?? "Lead Desconhecido";
  const whatsapp = client?.whatsapp ?? deal.leadWhatsapp;
  const city = client?.addressCity;
  const state = client?.addressState;
  const dealValue = deal.value ?? 0;
  const outstanding = client?.outstandingBalance ?? 0;
  const hasOutstanding = outstanding > 0;
  const tripName = deal.tripId ? tripsById.get(deal.tripId) : undefined;
  const initials = name.charAt(0).toUpperCase();
  const hasReservation = !!deal.reservationId;

  return (
    <div className={`bg-card rounded-lg border p-3 shadow-sm group relative select-none ${isDragging ? "opacity-50 shadow-xl" : "hover:shadow-md"} transition-all`}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-sm leading-tight truncate">{name}</p>
            {deal.source === "website" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
                <ShoppingBag className="w-2.5 h-2.5" />
                Loja
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{deal.title}</p>
          {deal.reservationNumber && (
            <p className="text-xs text-blue-700 font-mono font-semibold mt-0.5">{deal.reservationNumber}</p>
          )}
          {!deal.reservationNumber && deal.source === "website" && deal.seats && deal.seats.length > 0 && (
            <p className="text-xs text-blue-600 font-medium mt-0.5">
              {deal.seats.length === 1 ? `Assento ${deal.seats[0]}` : `Assentos ${deal.seats.join(", ")}`}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 text-muted-foreground hover:text-foreground rounded" title="Opções">
                <Pencil className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {client ? (
                <>
                  <DropdownMenuItem onClick={() => onView360(client.id)}>
                    <Eye className="w-3.5 h-3.5 mr-2" />
                    Ver 360°
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditClient(client)}>
                    <UserPen className="w-3.5 h-3.5 mr-2" />
                    Editar Cliente
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <UserPen className="w-3.5 h-3.5 mr-2" />
                  Sem cliente vinculado
                </DropdownMenuItem>
              )}
              {hasReservation && (
                <DropdownMenuItem onClick={() => onViewReservation(deal.reservationId!)}>
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Ver Reserva
                </DropdownMenuItem>
              )}
              {!isLostStage && onMarkLost && (
                <DropdownMenuItem
                  onClick={() => onMarkLost(deal)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="w-3.5 h-3.5 mr-2" />
                  Marcar como Perdido
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={() => onDelete(deal.id)} className="p-1 text-muted-foreground hover:text-destructive rounded">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {whatsapp && (
        <div className="flex items-center gap-1 mb-1">
          <Phone className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{whatsapp}</span>
        </div>
      )}

      {(city || state) && (
        <div className="flex items-center gap-1 mb-1">
          <MapPin className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{[city, state].filter(Boolean).join("/")}</span>
        </div>
      )}

      {deal.expectedCloseDate && (
        <div className="flex items-center gap-1 mb-1">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{format(parseISO(deal.expectedCloseDate), "dd/MM/yy", { locale: ptBR })}</span>
        </div>
      )}

      {tripName && (
        <div className="mb-1">
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded truncate inline-block max-w-full">{tripName}</span>
        </div>
      )}

      <div className="pt-2 border-t mt-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Valor do negócio</p>
            <p className="text-sm font-bold text-primary">{formatCurrency(dealValue)}</p>
          </div>
          {hasOutstanding && (
            <Badge variant="destructive" className="text-xs">
              Deve {formatCurrency(outstanding)}
            </Badge>
          )}
        </div>
        {(client?.totalSpent ?? 0) > 0 && (
          <p className="text-xs text-green-600 font-medium mt-1">
            Pago: {formatCurrency(client?.totalSpent ?? 0)}
          </p>
        )}
        {isLostStage && deal.lostReason && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 border border-red-100">
            <XCircle className="w-3 h-3 text-red-500 shrink-0" />
            <span className="text-xs text-red-600 font-medium truncate">{deal.lostReason}</span>
          </div>
        )}
        {isFinalStage && !hasReservation && !isLostStage && (
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-2 h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
            onClick={e => { e.stopPropagation(); onCreateReservation(deal); }}
          >
            <BookOpen className="w-3 h-3" />
            Criar Reserva
          </Button>
        )}
        {hasReservation && (
          <button
            className="w-full mt-2 text-xs text-blue-600 hover:underline flex items-center justify-center gap-1"
            onClick={e => { e.stopPropagation(); onViewReservation(deal.reservationId!); }}
          >
            <ExternalLink className="w-3 h-3" />
            Ver Reserva vinculada
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ deal, clientsById, tripsById, onEditClient, onView360, onDelete, onCreateReservation, onViewReservation, onMarkLost, isFinalStage, isLostStage }: Omit<ClientCardProps, "isDragging">) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      <ClientCardContent deal={deal} clientsById={clientsById} tripsById={tripsById} onEditClient={onEditClient} onView360={onView360} onDelete={onDelete} onCreateReservation={onCreateReservation} onViewReservation={onViewReservation} onMarkLost={onMarkLost} isFinalStage={isFinalStage} isLostStage={isLostStage} isDragging={isDragging} />
    </div>
  );
}

function DroppableColumn({ stage, children }: { stage: PipelineStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 min-h-[120px] p-2 rounded-lg transition-colors ${isOver ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""}`}
    >
      {children}
    </div>
  );
}

export default function Pipeline() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStageId, setFilterStageId] = useState("all");
  const [filterClassification, setFilterClassification] = useState("all");
  const [filterCity, setFilterCity] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>(undefined);
  const [activeDragDeal, setActiveDragDeal] = useState<Deal | null>(null);
  const [client360Id, setClient360Id] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [pendingLostDeal, setPendingLostDeal] = useState<{ dealId: string; stageId: string } | null>(null);

  const { data: stages, isLoading: loadingStages, refetch: refetchStages } = useListPipelineStages();
  const { data: deals, isLoading: loadingDeals, refetch: refetchDeals } = useListDeals({ status: DEAL_STATUS.OPEN });
  const { data: lostDealsData, refetch: refetchLostDeals } = useListDeals({ status: DEAL_STATUS.LOST });
  const { data: allClients, refetch: refetchClients } = useListClients({ limit: 500, page: 1 });
  const { data: tripsData } = useListTrips({ limit: 200 });
  const moveDeal = useMoveDeal();
  const deleteDeal = useDeleteDeal();
  const updateDeal = useUpdateDeal();

  const handleCreateReservation = (deal: Deal) => {
    const params = new URLSearchParams();
    params.set("new", "true");
    if (deal.clientId) params.set("clientId", deal.clientId);
    if (deal.tripId) params.set("tripId", deal.tripId);
    if (deal.value != null) params.set("amount", String(deal.value));
    params.set("dealId", deal.id);
    navigate(`/reservations?${params.toString()}`);
  };

  const handleViewReservation = (reservationId: string) => {
    navigate(`/reservations?reservationId=${reservationId}`);
  };

  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    (allClients?.data ?? []).forEach(c => map.set(c.id, c));
    return map;
  }, [allClients]);

  const tripsById = useMemo(() => {
    const map = new Map<string, string>();
    (tripsData?.data ?? []).forEach(t => map.set(t.id, t.name));
    return map;
  }, [tripsData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredDeals = useMemo(() => {
    let d = deals ?? [];
    if (filterStageId !== "all") d = d.filter(x => x.stageId === filterStageId);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(x => {
        const client = x.clientId ? clientsById.get(x.clientId) : undefined;
        return x.title.toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q) ||
          (x.leadName ?? "").toLowerCase().includes(q) ||
          (x.leadWhatsapp ?? "").includes(q) ||
          (client?.whatsapp ?? "").includes(q);
      });
    }
    if (filterClassification !== "all") {
      d = d.filter(x => {
        if (!x.clientId) return false;
        const c = clientsById.get(x.clientId);
        return c?.classification === filterClassification;
      });
    }
    if (filterCity) {
      d = d.filter(x => {
        if (!x.clientId) return true;
        const c = clientsById.get(x.clientId);
        return (c?.addressCity ?? "").toLowerCase().includes(filterCity.toLowerCase());
      });
    }
    return d;
  }, [deals, search, filterStageId, filterClassification, filterCity, clientsById]);

  const perdidoStageId = useMemo(
    () => stages?.find(s => s.name.toLowerCase() === "perdido")?.id ?? null,
    [stages],
  );

  const filteredLostDeals = useMemo(() => {
    let d = lostDealsData ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(x => {
        const client = x.clientId ? clientsById.get(x.clientId) : undefined;
        return x.title.toLowerCase().includes(q) ||
          (client?.name ?? "").toLowerCase().includes(q) ||
          (x.leadName ?? "").toLowerCase().includes(q) ||
          (x.leadWhatsapp ?? "").includes(q) ||
          (client?.whatsapp ?? "").includes(q);
      });
    }
    return d;
  }, [lostDealsData, search, clientsById]);

  const dealsByStage = (stageId: string, isLost: boolean) =>
    isLost ? filteredLostDeals.filter(d => d.stageId === stageId) : filteredDeals.filter(d => d.stageId === stageId);

  const handleDragStart = (event: DragStartEvent) => {
    const allDeals = [...(deals ?? []), ...(lostDealsData ?? [])];
    const deal = allDeals.find(d => d.id === event.active.id);
    setActiveDragDeal(deal ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragDeal(null);
    if (!over) return;
    const dealId = active.id as string;
    const targetStageId = over.id as string;
    const allDeals = [...(deals ?? []), ...(lostDealsData ?? [])];
    const deal = allDeals.find(d => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;

    const targetStage = stages?.find(s => s.id === targetStageId);
    if (targetStage?.name.toLowerCase() === "perdido") {
      setPendingLostDeal({ dealId, stageId: targetStageId });
      return;
    }

    // If dragging OUT of "Perdido", reset status back to open
    if (deal.status === DEAL_STATUS.LOST) {
      await updateDeal.mutateAsync({
        id: dealId,
        data: { stageId: targetStageId, status: DEAL_STATUS.OPEN as "open", lostReason: null },
      });
    } else {
      await moveDeal.mutateAsync({ id: dealId, data: { stageId: targetStageId } });
    }
    refetchDeals();
    refetchLostDeals();
    refetchStages();
  };

  const handleLostReasonConfirm = async (reason: string, obs: string) => {
    if (!pendingLostDeal) return;
    const lostReason = obs.trim() ? `${reason} — ${obs.trim()}` : reason;
    await updateDeal.mutateAsync({
      id: pendingLostDeal.dealId,
      data: { stageId: pendingLostDeal.stageId, status: DEAL_STATUS.LOST as "lost", lostReason },
    });
    setPendingLostDeal(null);
    refetchDeals();
    refetchLostDeals();
    refetchStages();
  };

  const handleMarkLost = (deal: Deal) => {
    if (!perdidoStageId) return;
    setPendingLostDeal({ dealId: deal.id, stageId: perdidoStageId });
  };

  const handleDelete = async (dealId: string) => {
    if (!confirm("Remover este lead do pipeline?")) return;
    await deleteDeal.mutateAsync({ id: dealId });
    refetchDeals();
    refetchLostDeals();
    refetchStages();
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const openNew = (stageId?: string) => {
    setEditingClient(null);
    setDefaultStageId(stageId ?? stages?.[0]?.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setDefaultStageId(undefined);
  };

  const handleSave = () => {
    refetchClients();
    refetchDeals();
    refetchStages();
  };

  const totalValue = (deals ?? []).reduce((acc, d) => acc + d.value, 0);
  const hasFilters = !!(search || filterStageId !== "all" || filterClassification !== "all" || filterCity);
  const pipelineId = stages?.[0]?.pipelineId ?? "";

  return (
    <div className="space-y-5 flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground text-sm">
            {deals?.length ?? 0} leads · {formatCurrency(totalValue)} no funil
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnalyticsOpen(v => !v)}
            className="gap-1.5"
          >
            <BarChart2 className="w-4 h-4" />
            Analytics
            {analyticsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button onClick={() => openNew()}>
            <Plus className="w-4 h-4 mr-2" /> Novo Lead
          </Button>
        </div>
      </div>

      {analyticsOpen && pipelineId && (
        <div className="flex-shrink-0 rounded-xl border bg-card p-4 shadow-sm">
          <AnalyticsPanel pipelineId={pipelineId} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar leads, clientes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStageId} onValueChange={setFilterStageId}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estágios</SelectItem>
            {stages?.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterClassification} onValueChange={setFilterClassification}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Classificação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Cidade..." value={filterCity} onChange={e => setFilterCity(e.target.value)} className="w-32" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterStageId("all"); setFilterClassification("all"); setFilterCity(""); }}>
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {(loadingStages || loadingDeals) ? (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-3">
              <Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-6 flex-1">
            {stages?.map(stage => {
              const isLostStage = stage.name.toLowerCase() === "perdido";
              const stageDeals = dealsByStage(stage.id, isLostStage);
              const stageValue = stageDeals.reduce((acc, d) => acc + d.value, 0);
              return (
                <div
                  key={stage.id}
                  className={`w-64 shrink-0 flex flex-col rounded-xl border bg-muted/30 ${isLostStage ? "border-red-200 bg-red-50/30" : ""}`}
                >
                  <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold">{stage.name}</span>
                      <Badge
                        variant={isLostStage ? "destructive" : "secondary"}
                        className="text-xs px-1.5 h-5"
                      >
                        {stageDeals.length}
                      </Badge>
                    </div>
                    {!isLostStage && (
                      <button onClick={() => openNew(stage.id)} className="text-muted-foreground hover:text-primary p-1 rounded">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {stageValue > 0 && (
                    <p className="px-3 pb-1.5 text-xs text-muted-foreground">{formatCurrency(stageValue)}</p>
                  )}

                  <DroppableColumn stage={stage}>
                    {stageDeals.map(deal => (
                      <DraggableCard
                        key={deal.id}
                        deal={deal}
                        clientsById={clientsById}
                        tripsById={tripsById}
                        onEditClient={handleEditClient}
                        onView360={setClient360Id}
                        onDelete={handleDelete}
                        onCreateReservation={handleCreateReservation}
                        onViewReservation={handleViewReservation}
                        onMarkLost={handleMarkLost}
                        isFinalStage={stage.isFinal}
                        isLostStage={isLostStage}
                      />
                    ))}
                    {stageDeals.length === 0 && !isLostStage && (
                      <button
                        onClick={() => openNew(stage.id)}
                        className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
                      >
                        + Adicionar lead
                      </button>
                    )}
                    {stageDeals.length === 0 && isLostStage && (
                      <div className="flex flex-col items-center justify-center h-16 text-xs text-muted-foreground gap-1">
                        <XCircle className="w-4 h-4 opacity-40" />
                        <span>Nenhum negócio perdido</span>
                      </div>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDragDeal ? (
              <div className="w-64 opacity-90 shadow-2xl rotate-1">
                <ClientCardContent
                  deal={activeDragDeal}
                  clientsById={clientsById}
                  tripsById={tripsById}
                  onEditClient={() => {}}
                  onView360={() => {}}
                  onDelete={() => {}}
                  onCreateReservation={() => {}}
                  onViewReservation={() => {}}
                  isFinalStage={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ClientModal
        open={isModalOpen}
        onClose={closeModal}
        editClient={editingClient}
        onSave={handleSave}
        defaultStageId={defaultStageId}
      />
      <Client360Modal open={!!client360Id} onClose={() => setClient360Id(null)} clientId={client360Id} />

      <LostReasonModal
        open={!!pendingLostDeal}
        onClose={() => setPendingLostDeal(null)}
        onConfirm={handleLostReasonConfirm}
      />
    </div>
  );
}
