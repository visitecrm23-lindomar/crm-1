import { useState, useMemo } from "react";
import {
  useListPipelineStages, useListDeals, useCreateDeal, useMoveDeal,
  useDeleteDeal, useUpdateDeal, useListClients, useListTrips
} from "@workspace/api-client-react";
import type { Deal } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Trash2, Phone, MapPin, DollarSign, Calendar, User, X, Edit } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STAGE_COLORS: Record<string, string> = {
  "Novos Leads": "bg-slate-500",
  "Contato": "bg-blue-500",
  "Qualificados": "bg-indigo-500",
  "Reservados": "bg-purple-500",
  "Proposta": "bg-orange-500",
  "Em Viagem": "bg-green-500",
  "Pós-Venda": "bg-teal-500",
};

interface DealCardProps {
  deal: Deal;
  onDelete: (id: string) => void;
  onEdit: (deal: Deal) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function DealCard({ deal, onDelete, onEdit, onDragStart, onDragEnd }: DealCardProps) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal.id)}
      onDragEnd={onDragEnd}
      className="bg-card rounded-lg border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all group relative"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight truncate">{deal.title}</p>
          {(deal.leadName ?? deal.clientName) && (
            <div className="flex items-center gap-1 mt-1">
              <User className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground truncate">{deal.leadName ?? deal.clientName}</p>
            </div>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(deal)}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={async () => { setDeleting(true); await onDelete(deal.id); setDeleting(false); }}
            disabled={deleting}
            className="p-1 text-muted-foreground hover:text-destructive rounded"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {deal.leadWhatsapp && (
        <div className="flex items-center gap-1 mb-1">
          <Phone className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{deal.leadWhatsapp}</span>
        </div>
      )}

      {deal.expectedCloseDate && (
        <div className="flex items-center gap-1 mb-2">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(parseISO(deal.expectedCloseDate), "dd/MM/yy", { locale: ptBR })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        <span className="text-sm font-bold text-primary">{formatCurrency(deal.value)}</span>
        {deal.status === "won" && <Badge className="text-xs bg-green-100 text-green-700 border-0">Ganho</Badge>}
        {deal.status === "lost" && <Badge variant="destructive" className="text-xs">Perdido</Badge>}
      </div>
    </div>
  );
}

interface DealFormData {
  stageId: string;
  title: string;
  description: string;
  value: string;
  clientId: string;
  leadName: string;
  leadEmail: string;
  leadWhatsapp: string;
  tripId: string;
  expectedCloseDate: string;
  status: string;
  lostReason: string;
}

const EMPTY_FORM: DealFormData = {
  stageId: "", title: "", description: "", value: "",
  clientId: "", leadName: "", leadEmail: "", leadWhatsapp: "",
  tripId: "", expectedCloseDate: "", status: "open", lostReason: "",
};

interface DealModalProps {
  open: boolean;
  onClose: () => void;
  editDeal?: Deal | null;
  stages: { id: string; name: string; color: string; order: number; isFinal: boolean; dealsCount: number; dealsValue: number }[];
  onSave: () => void;
}

function DealModal({ open, onClose, editDeal, stages, onSave }: DealModalProps) {
  const [tab, setTab] = useState("lead");
  const [form, setForm] = useState<DealFormData>(EMPTY_FORM);
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const { data: clients } = useListClients({ limit: 100 });
  const { data: tripsData } = useListTrips({ limit: 100 });

  const isEditing = !!editDeal;

  const openWithEdit = (d: Deal | null | undefined) => {
    if (d) {
      setForm({
        stageId: d.stageId, title: d.title, description: d.description ?? "",
        value: String(d.value), clientId: d.clientId ?? "",
        leadName: d.leadName ?? "", leadEmail: d.leadEmail ?? "",
        leadWhatsapp: d.leadWhatsapp ?? "", tripId: d.tripId ?? "",
        expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.split("T")[0] : "",
        status: d.status, lostReason: d.lostReason ?? "",
      });
    } else {
      setForm({ ...EMPTY_FORM, stageId: stages[0]?.id ?? "" });
    }
  };

  const isOpen = open;
  if (isOpen && form.stageId === "" && !isEditing) {
    openWithEdit(null);
  }

  const set = (key: keyof DealFormData) => (val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    const data = {
      stageId: form.stageId,
      title: form.title,
      description: form.description || undefined,
      value: parseFloat(form.value || "0"),
      clientId: form.clientId || undefined,
      leadName: form.leadName || undefined,
      leadEmail: form.leadEmail || undefined,
      leadWhatsapp: form.leadWhatsapp || undefined,
      tripId: form.tripId || undefined,
      expectedCloseDate: form.expectedCloseDate ? new Date(form.expectedCloseDate).toISOString() : undefined,
    };

    if (isEditing && editDeal) {
      await updateDeal.mutateAsync({ id: editDeal.id, data: { ...data, status: form.status, lostReason: form.lostReason || undefined } });
    } else {
      await createDeal.mutateAsync({ data });
    }
    onSave();
    onClose();
    setForm(EMPTY_FORM);
    setTab("lead");
  };

  const isPending = createDeal.isPending || updateDeal.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { onClose(); setForm(EMPTY_FORM); setTab("lead"); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Negócio" : "Novo Negócio"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="lead">Lead</TabsTrigger>
            <TabsTrigger value="deal">Negócio</TabsTrigger>
            <TabsTrigger value="trip">Viagem</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="lead" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Cliente (se existente)</Label>
              <Select value={form.clientId} onValueChange={set("clientId")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum (lead novo)</SelectItem>
                  {clients?.data.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Lead</Label>
                <Input placeholder="Maria Silva" value={form.leadName} onChange={e => set("leadName")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input placeholder="+55 31 99999-9999" value={form.leadWhatsapp} onChange={e => set("leadWhatsapp")(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" placeholder="maria@email.com" value={form.leadEmail} onChange={e => set("leadEmail")(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="deal" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Título do Negócio *</Label>
              <Input required placeholder="Ex: Excursão Arraial do Cabo" value={form.title} onChange={e => set("title")(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estágio</Label>
                <Select value={form.stageId} onValueChange={set("stageId")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="won">Ganho</SelectItem>
                    <SelectItem value="lost">Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Previsão de Fechamento</Label>
              <Input type="date" value={form.expectedCloseDate} onChange={e => set("expectedCloseDate")(e.target.value)} />
            </div>
            {form.status === "lost" && (
              <div className="space-y-2">
                <Label>Motivo da Perda</Label>
                <Input placeholder="Ex: Cliente escolheu outro fornecedor" value={form.lostReason} onChange={e => set("lostReason")(e.target.value)} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="trip" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Viagem de Interesse</Label>
              <Select value={form.tripId} onValueChange={set("tripId")}>
                <SelectTrigger><SelectValue placeholder="Selecionar viagem..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhuma</SelectItem>
                  {tripsData?.data.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} — {format(parseISO(t.departureDate), "dd/MM/yyyy")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Valor Estimado (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="1500.00" value={form.value} onChange={e => set("value")(e.target.value)} />
            </div>
            {form.value && (
              <p className="text-sm text-muted-foreground">
                Valor: <span className="font-semibold">{formatCurrency(parseFloat(form.value || "0"))}</span>
              </p>
            )}
          </TabsContent>

          <TabsContent value="notes" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Descrição / Observações</Label>
              <Textarea
                placeholder="Detalhes sobre o negócio, preferências do cliente..."
                rows={6}
                value={form.description}
                onChange={e => set("description")(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => { onClose(); setForm(EMPTY_FORM); setTab("lead"); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.title || !form.value}>
            {isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Negócio"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Pipeline() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const { data: stages, isLoading: loadingStages, refetch: refetchStages } = useListPipelineStages();
  const { data: deals, isLoading: loadingDeals, refetch: refetchDeals } = useListDeals({ status: "open" });
  const moveDeal = useMoveDeal();
  const deleteDeal = useDeleteDeal();

  const filteredDeals = useMemo(() => {
    if (!search.trim()) return deals ?? [];
    const q = search.toLowerCase();
    return (deals ?? []).filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.leadName?.toLowerCase().includes(q) ||
      d.clientName?.toLowerCase().includes(q) ||
      d.leadWhatsapp?.includes(q)
    );
  }, [deals, search]);

  const dealsByStage = (stageId: string) => filteredDeals.filter(d => d.stageId === stageId);

  const handleDrop = async (stageId: string) => {
    if (draggingDealId && stageId && draggingDealId !== stageId) {
      await moveDeal.mutateAsync({ id: draggingDealId, data: { stageId } });
      refetchDeals();
      refetchStages();
    }
    setDraggingDealId(null);
    setDragOverStageId(null);
  };

  const handleDelete = async (dealId: string) => {
    await deleteDeal.mutateAsync({ id: dealId });
    refetchDeals();
    refetchStages();
  };

  const handleSave = () => {
    refetchDeals();
    refetchStages();
  };

  const totalValue = (deals ?? []).reduce((acc, d) => acc + d.value, 0);
  const totalOpen = deals?.length ?? 0;

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline de Vendas</h1>
          <p className="text-muted-foreground text-sm">
            {totalOpen} negócios em aberto · {formatCurrency(totalValue)} no funil
          </p>
        </div>
        <Button onClick={() => { setEditingDeal(null); setIsCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Novo Negócio
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar negócios, leads..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      {(loadingStages || loadingDeals) ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 flex-1">
          {stages?.map((stage) => {
            const stageDeals = dealsByStage(stage.id);
            const stageValue = stageDeals.reduce((acc, d) => acc + d.value, 0);
            const colorClass = STAGE_COLORS[stage.name] ?? "bg-gray-500";

            return (
              <div
                key={stage.id}
                className={`w-72 shrink-0 flex flex-col gap-2 rounded-xl border transition-colors ${
                  dragOverStageId === stage.id
                    ? "bg-primary/5 border-primary border-2"
                    : "bg-muted/30 border-border"
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverStageId(stage.id); }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStageId(null);
                  }
                }}
                onDrop={() => handleDrop(stage.id)}
              >
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${colorClass}`} />
                    <span className="text-sm font-semibold">{stage.name}</span>
                    <Badge variant="secondary" className="text-xs px-1.5 h-5">{stageDeals.length}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatCurrency(stageValue)}</span>
                </div>

                <div className="flex flex-col gap-2 px-2 pb-3 min-h-[120px] overflow-y-auto max-h-[calc(100vh-280px)]">
                  {stageDeals.map(deal => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onDelete={handleDelete}
                      onEdit={d => { setEditingDeal(d); setIsCreateOpen(true); }}
                      onDragStart={setDraggingDealId}
                      onDragEnd={() => { setDraggingDealId(null); setDragOverStageId(null); }}
                    />
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground">
                      Arraste negócios aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DealModal
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setEditingDeal(null); }}
        editDeal={editingDeal}
        stages={stages ?? []}
        onSave={handleSave}
      />
    </div>
  );
}
