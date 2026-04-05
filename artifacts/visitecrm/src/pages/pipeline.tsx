import { useState, useMemo, useEffect } from "react";
import {
  DndContext, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragStartEvent, type DragEndEvent
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import {
  useListPipelineStages, useListDeals, useCreateDeal, useMoveDeal,
  useDeleteDeal, useListClients, useListTrips, useCreateClient, useUpdateClient, useListPipelineStages as useStages
} from "@workspace/api-client-react";
import type { Deal, PipelineStage, Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Trash2, Phone, Calendar, MapPin, X, Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Ativo", color: "bg-green-100 text-green-700" },
  inactive: { label: "Inativo", color: "bg-gray-100 text-gray-600" },
  lead: { label: "Lead", color: "bg-blue-100 text-blue-700" },
  prospect: { label: "Prospecto", color: "bg-yellow-100 text-yellow-700" },
  vip: { label: "VIP", color: "bg-purple-100 text-purple-700" },
};

const GENDER_OPTIONS = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
  { value: "other", label: "Outro" },
];

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: "Lead", prospect: "Prospecto", client: "Cliente", vip: "VIP", inactive: "Inativo",
};

interface ClientFormData {
  name: string; email: string; whatsapp: string; phone: string; cpf: string;
  birthDate: string; gender: string; addressCity: string; addressState: string;
  instagram: string; observations: string; tags: string; dreamDestinations: string;
  pipelineStage: string; classification: string; npsScore: string; status: string;
  stageId: string;
}

const EMPTY_CLIENT: ClientFormData = {
  name: "", email: "", whatsapp: "", phone: "", cpf: "", birthDate: "", gender: "",
  addressCity: "", addressState: "", instagram: "", observations: "", tags: "",
  dreamDestinations: "", pipelineStage: "", classification: "lead", npsScore: "", status: "active",
  stageId: "",
};

function clientToForm(c: Client, defaultStageId = ""): ClientFormData {
  return {
    name: c.name, email: c.email, whatsapp: c.whatsapp, phone: c.phone ?? "",
    cpf: c.cpf ?? "", birthDate: c.birthDate ? c.birthDate.split("T")[0] : "",
    gender: c.gender ?? "", addressCity: c.addressCity ?? "", addressState: c.addressState ?? "",
    instagram: c.instagram ?? "", observations: c.observations ?? "",
    tags: (c.tags ?? []).join(", "), dreamDestinations: (c.dreamDestinations ?? []).join(", "),
    pipelineStage: c.pipelineStage ?? "", classification: c.classification ?? "lead",
    npsScore: c.npsScore != null ? String(c.npsScore) : "", status: c.status ?? "active",
    stageId: defaultStageId,
  };
}

interface ClientPipelineModalProps {
  open: boolean;
  onClose: () => void;
  editClient?: Client | null;
  defaultStageId?: string;
  stages: PipelineStage[];
  onSave: () => void;
}

function ClientPipelineModal({ open, onClose, editClient, defaultStageId = "", stages, onSave }: ClientPipelineModalProps) {
  const [tab, setTab] = useState("personal");
  const [form, setForm] = useState<ClientFormData>(EMPTY_CLIENT);
  const [saveAndReserve, setSaveAndReserve] = useState(false);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createDeal = useCreateDeal();
  const { data: tripsData } = useListTrips({ limit: 100 });

  useEffect(() => {
    if (open) {
      setTab("personal");
      setSaveAndReserve(false);
      setForm(editClient ? clientToForm(editClient, editClient.pipelineStage ? stages.find(s => s.name === editClient.pipelineStage)?.id ?? defaultStageId : defaultStageId) : { ...EMPTY_CLIENT, stageId: defaultStageId });
    }
  }, [open, editClient, defaultStageId, stages]);

  const isEditing = !!editClient;
  const isPending = createClient.isPending || updateClient.isPending;
  const set = (key: keyof ClientFormData) => (val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (withReservation = false) => {
    const base = {
      name: form.name, email: form.email, whatsapp: form.whatsapp,
      phone: form.phone || undefined, cpf: form.cpf || undefined,
      birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined,
      gender: form.gender || undefined, addressCity: form.addressCity || undefined,
      addressState: form.addressState || undefined, instagram: form.instagram || undefined,
      observations: form.observations || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      dreamDestinations: form.dreamDestinations ? form.dreamDestinations.split(",").map(t => t.trim()).filter(Boolean) : [],
    };

    let savedClientId: string | undefined;
    if (isEditing && editClient) {
      await updateClient.mutateAsync({
        id: editClient.id,
        data: { ...base, pipelineStage: form.pipelineStage || undefined, classification: form.classification || undefined,
          npsScore: form.npsScore ? parseFloat(form.npsScore) : undefined, status: form.status || undefined },
      });
      savedClientId = editClient.id;
    } else {
      const result = await createClient.mutateAsync({ data: base });
      savedClientId = result.id;
      if (form.stageId && savedClientId) {
        await createDeal.mutateAsync({ data: {
          stageId: form.stageId,
          title: `${form.name} — Lead`,
          value: 0,
          clientId: savedClientId,
          leadName: form.name,
          leadWhatsapp: form.whatsapp || undefined,
        }});
      }
    }

    if (withReservation && savedClientId) {
      window.location.href = `/visitecrm/reservations?clientId=${savedClientId}&new=true`;
      return;
    }
    onSave();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar: ${editClient?.name}` : "Novo Cliente no Pipeline"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="personal">Dados</TabsTrigger>
            <TabsTrigger value="trip">Viagem</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="observations">Obs.</TabsTrigger>
            <TabsTrigger value="marketing">Follow-up</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Estágio no Pipeline</Label>
              <Select value={form.stageId} onValueChange={set("stageId")}>
                <SelectTrigger><SelectValue placeholder="Selecionar estágio..." /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Nome Completo *</Label>
                <Input required placeholder="Maria Silva" value={form.name} onChange={e => set("name")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input type="email" required placeholder="maria@email.com" value={form.email} onChange={e => set("email")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp *</Label>
                <Input placeholder="+55 31 99999-9999" value={form.whatsapp} onChange={e => set("whatsapp")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input placeholder="+55 31 3333-3333" value={form.phone} onChange={e => set("phone")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input placeholder="000.000.000-00" value={form.cpf} onChange={e => set("cpf")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={form.birthDate} onChange={e => set("birthDate")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <Select value={form.gender} onValueChange={set("gender")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Não informado</SelectItem>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input placeholder="Belo Horizonte" value={form.addressCity} onChange={e => set("addressCity")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input placeholder="MG" maxLength={2} value={form.addressState} onChange={e => set("addressState")(e.target.value.toUpperCase())} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Instagram</Label>
                <Input placeholder="@mariaSilva" value={form.instagram} onChange={e => set("instagram")(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trip" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Destinos Sonhados</Label>
              <Input placeholder="Arraial do Cabo, Morro de São Paulo" value={form.dreamDestinations} onChange={e => set("dreamDestinations")(e.target.value)} />
              <p className="text-xs text-muted-foreground">Separe com vírgula</p>
            </div>
            <div className="space-y-2">
              <Label>Viagem de Interesse</Label>
              <Select onValueChange={() => {}}>
                <SelectTrigger><SelectValue placeholder="Selecionar viagem..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
                  {tripsData?.data.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — {format(parseISO(t.departureDate), "dd/MM/yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input placeholder="praia, aventura, família" value={form.tags} onChange={e => set("tags")(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Classificação</Label>
              <Select value={form.classification} onValueChange={set("classification")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([v, { label }]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isEditing && editClient && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Total Gasto</p>
                  <p className="text-lg font-bold">{formatCurrency(editClient.totalSpent)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo Devedor</p>
                  <p className={`text-lg font-bold ${editClient.outstandingBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                    {formatCurrency(editClient.outstandingBalance)}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="observations" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>NPS — Nota de 0 a 10</Label>
                {form.npsScore !== "" && (
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                    parseInt(form.npsScore) >= 9 ? "bg-green-100 text-green-700" :
                    parseInt(form.npsScore) >= 7 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>{form.npsScore}/10</span>
                )}
              </div>
              <input
                type="range" min="0" max="10" step="1"
                value={form.npsScore !== "" ? parseInt(form.npsScore) : 0}
                onChange={e => set("npsScore")(e.target.value)}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 — Detrator</span><span>6 — Neutro</span><span>10 — Promotor</span>
              </div>
              {form.npsScore !== "" && (
                <div className="flex gap-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <button type="button" key={i} onClick={() => set("npsScore")(String(i + 1))}
                      className={`flex-1 h-7 rounded text-xs font-bold ${
                        i + 1 <= parseInt(form.npsScore)
                          ? parseInt(form.npsScore) >= 9 ? "bg-green-500 text-white" : parseInt(form.npsScore) >= 7 ? "bg-yellow-400 text-white" : "bg-red-400 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                      }`}
                    >{i + 1}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Anotações sobre o cliente..." rows={5} value={form.observations} onChange={e => set("observations")(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="marketing" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Follow-up e preferências de lifestyle</p>
            <div className="space-y-2">
              <Label>Próximo Follow-up</Label>
              <Input type="date" />
            </div>
            <div className="space-y-2">
              <Label>Canal Preferido</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Ligação</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags de Interesse</Label>
              <Input placeholder="praia, aventura, cultural, gastronomia" value={form.tags} onChange={e => set("tags")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Destinos Sonhados</Label>
              <Textarea placeholder="Destinos mencionados pelo cliente..." rows={3} value={form.dreamDestinations} onChange={e => set("dreamDestinations")(e.target.value)} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t mt-2">
          <Button variant="outline" onClick={onClose} className="sm:order-1">Cancelar</Button>
          {!isEditing && (
            <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={isPending || !form.name || !form.email || !form.whatsapp} className="sm:order-2">
              {isPending ? "Salvando..." : "Salvar e Criar Reserva"}
            </Button>
          )}
          <Button onClick={() => handleSubmit(false)} disabled={isPending || !form.name || !form.email || !form.whatsapp} className="sm:order-3">
            {isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Cliente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ClientCardProps {
  deal: Deal;
  clientsById: Map<string, Client>;
  onEdit: (d: Deal, client?: Client) => void;
  onDelete: (id: string) => void;
  isDragging?: boolean;
}

function ClientCardContent({ deal, clientsById, onEdit, onDelete, isDragging }: ClientCardProps) {
  const client = deal.clientId ? clientsById.get(deal.clientId) : undefined;
  const name = client?.name ?? deal.clientName ?? deal.leadName ?? "Lead Desconhecido";
  const whatsapp = client?.whatsapp ?? deal.leadWhatsapp;
  const city = client?.addressCity;
  const state = client?.addressState;
  const totalSpent = client?.totalSpent ?? 0;
  const outstanding = client?.outstandingBalance ?? 0;
  const hasOutstanding = outstanding > 0;
  const initials = name.charAt(0).toUpperCase();

  return (
    <div className={`bg-card rounded-lg border p-3 shadow-sm group relative select-none ${isDragging ? "opacity-50 shadow-xl" : "hover:shadow-md"} transition-all`}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{name}</p>
          {deal.stageName && <p className="text-xs text-muted-foreground truncate">{deal.title}</p>}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(deal, client)} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
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

      {deal.tripId && (
        <div className="mb-1">
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded">Viagem vinculada</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t mt-1">
        <div>
          <p className="text-xs text-muted-foreground">Gasto total</p>
          <p className="text-sm font-bold text-primary">{formatCurrency(totalSpent)}</p>
        </div>
        {hasOutstanding && (
          <Badge variant="destructive" className="text-xs">
            Deve {formatCurrency(outstanding)}
          </Badge>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ deal, clientsById, onEdit, onDelete }: Omit<ClientCardProps, "isDragging">) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      <ClientCardContent deal={deal} clientsById={clientsById} onEdit={onEdit} onDelete={onDelete} isDragging={isDragging} />
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
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterClassification, setFilterClassification] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [defaultStageId, setDefaultStageId] = useState("");
  const [activeDragDeal, setActiveDragDeal] = useState<Deal | null>(null);

  const { data: stages, isLoading: loadingStages, refetch: refetchStages } = useListPipelineStages();
  const { data: deals, isLoading: loadingDeals, refetch: refetchDeals } = useListDeals({ status: "open" });
  const { data: allClients } = useListClients({ limit: 500, page: 1 });
  const moveDeal = useMoveDeal();
  const deleteDeal = useDeleteDeal();

  const clientsById = useMemo(() => {
    const map = new Map<string, Client>();
    (allClients?.data ?? []).forEach(c => map.set(c.id, c));
    return map;
  }, [allClients]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredDeals = useMemo(() => {
    let d = deals ?? [];
    if (filterStage) d = d.filter(x => x.stageId === filterStage);
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
    if (filterClassification) {
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
  }, [deals, search, filterStage, filterClassification, filterCity, clientsById]);

  const dealsByStage = (stageId: string) => filteredDeals.filter(d => d.stageId === stageId);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = (deals ?? []).find(d => d.id === event.active.id);
    setActiveDragDeal(deal ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragDeal(null);
    if (!over) return;
    const dealId = active.id as string;
    const targetStageId = over.id as string;
    const deal = (deals ?? []).find(d => d.id === dealId);
    if (!deal || deal.stageId === targetStageId) return;
    await moveDeal.mutateAsync({ id: dealId, data: { stageId: targetStageId } });
    refetchDeals();
    refetchStages();
  };

  const handleDelete = async (dealId: string) => {
    if (!confirm("Remover este lead do pipeline?")) return;
    await deleteDeal.mutateAsync({ id: dealId });
    refetchDeals();
    refetchStages();
  };

  const handleEdit = (deal: Deal, client?: Client) => {
    setEditingDeal(deal);
    setEditingClient(client ?? null);
    setDefaultStageId(deal.stageId);
    setIsModalOpen(true);
  };

  const openNew = (stageId = "") => {
    setEditingDeal(null);
    setEditingClient(null);
    setDefaultStageId(stageId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDeal(null);
    setEditingClient(null);
  };

  const totalValue = (deals ?? []).reduce((acc, d) => acc + d.value, 0);
  const hasFilters = !!(search || filterStage || filterClassification || filterCity);

  return (
    <div className="space-y-5 flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground text-sm">
            {deals?.length ?? 0} leads · {formatCurrency(totalValue)} no funil
          </p>
        </div>
        <Button onClick={() => openNew(stages?.[0]?.id ?? "")}>
          <Plus className="w-4 h-4 mr-2" /> Novo Lead
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar leads, clientes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterClassification} onValueChange={setFilterClassification}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Classificação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas</SelectItem>
            {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Cidade..." value={filterCity} onChange={e => setFilterCity(e.target.value)} className="w-32" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterStage(""); setFilterClassification(""); setFilterCity(""); }}>
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {(loadingStages || loadingDeals) ? (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 space-y-3">
              <Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-6 flex-1">
            {stages?.map(stage => {
              const stageDeals = dealsByStage(stage.id);
              const stageValue = stageDeals.reduce((acc, d) => acc + d.value, 0);
              return (
                <div key={stage.id} className="w-64 shrink-0 flex flex-col rounded-xl border bg-muted/30">
                  <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm font-semibold">{stage.name}</span>
                      <Badge variant="secondary" className="text-xs px-1.5 h-5">{stageDeals.length}</Badge>
                    </div>
                    <button onClick={() => openNew(stage.id)} className="text-muted-foreground hover:text-primary p-1 rounded">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
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
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                    {stageDeals.length === 0 && (
                      <button
                        onClick={() => openNew(stage.id)}
                        className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
                      >
                        + Adicionar lead
                      </button>
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
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ClientPipelineModal
        open={isModalOpen}
        onClose={closeModal}
        editClient={editingClient}
        defaultStageId={defaultStageId}
        stages={stages ?? []}
        onSave={() => { refetchDeals(); refetchStages(); }}
      />
    </div>
  );
}
