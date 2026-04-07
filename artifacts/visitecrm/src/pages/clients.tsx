import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  useListClients, useCreateClient, useUpdateClient,
  useListPipelineStages, useListReservations, useListPayments, useListTrips, useListUsers
} from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Users, TrendingUp, UserCheck, MoreHorizontal,
  Phone, Mail, MapPin, Calendar, Download, Upload, ChevronLeft, ChevronRight,
  X, Star, ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Ativo", color: "bg-green-100 text-green-700 border-green-200" },
  inactive: { label: "Inativo", color: "bg-gray-100 text-gray-600 border-gray-200" },
  lead: { label: "Lead", color: "bg-blue-100 text-blue-700 border-blue-200" },
  prospect: { label: "Prospecto", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  vip: { label: "VIP", color: "bg-purple-100 text-purple-700 border-purple-200" },
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  lead: "Lead",
  prospect: "Prospecto",
  client: "Cliente",
  vip: "VIP",
  inactive: "Inativo",
};

const GENDER_OPTIONS = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
  { value: "other", label: "Outro" },
];

interface ClientFormData {
  name: string; email: string; whatsapp: string; phone: string; cpf: string;
  birthDate: string; gender: string; addressCity: string; addressState: string;
  instagram: string; observations: string; tags: string; dreamDestinations: string;
  pipelineStage: string; classification: string; npsScore: string; status: string;
  origin: string;
}

const EMPTY_CLIENT: ClientFormData = {
  name: "", email: "", whatsapp: "", phone: "", cpf: "", birthDate: "", gender: "none",
  addressCity: "", addressState: "", instagram: "", observations: "", tags: "",
  dreamDestinations: "", pipelineStage: "none", classification: "lead", npsScore: "", status: "active",
  origin: "",
};

function clientToForm(c: Client): ClientFormData {
  return {
    name: c.name, email: c.email, whatsapp: c.whatsapp, phone: c.phone ?? "",
    cpf: c.cpf ?? "", birthDate: c.birthDate ? c.birthDate.split("T")[0] : "",
    gender: c.gender ?? "none", addressCity: c.addressCity ?? "", addressState: c.addressState ?? "",
    instagram: c.instagram ?? "", observations: c.observations ?? "",
    tags: (c.tags ?? []).join(", "), dreamDestinations: (c.dreamDestinations ?? []).join(", "),
    pipelineStage: c.pipelineStage ?? "none", classification: c.classification ?? "lead",
    npsScore: c.npsScore != null ? String(c.npsScore) : "", status: c.status ?? "active",
    origin: c.origin ?? "",
  };
}

function ClientPaymentsSection({ clientId }: { clientId: string }) {
  const { data: payments, isLoading } = useListPayments({ clientId, limit: 10 });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  const items = payments?.data ?? [];

  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-sm font-medium text-muted-foreground">Pagamentos / Comissões</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
      ) : (
        <div className="space-y-1 max-h-[220px] overflow-y-auto">
          {items.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.description ?? p.category}</p>
                <p className="text-xs text-muted-foreground">
                  Vence {p.dueDate ? format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  {p.installmentNumber ? ` · Parcela ${p.installmentNumber}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  p.status === "paid" ? "bg-green-100 text-green-700" :
                  p.status === "overdue" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                }`}>{p.status === "paid" ? "Pago" : p.status === "overdue" ? "Vencido" : "Pendente"}</span>
                <span className="text-sm font-semibold">{formatCurrency(p.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  editClient?: Client | null;
  onSave: (createReservation?: boolean, savedClientId?: string) => void;
}

function ClientModal({ open, onClose, editClient, onSave }: ClientModalProps) {
  const [tab, setTab] = useState("personal");
  const [form, setForm] = useState<ClientFormData>(EMPTY_CLIENT);
  const { data: stages } = useListPipelineStages();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  useEffect(() => {
    if (open) {
      setTab("personal");
      setForm(editClient ? clientToForm(editClient) : EMPTY_CLIENT);
    }
  }, [open, editClient]);

  const isEditing = !!editClient;
  const isPending = createClient.isPending || updateClient.isPending;
  const set = (key: keyof ClientFormData) => (val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (withReservation = false) => {
    const base = {
      name: form.name, email: form.email, whatsapp: form.whatsapp,
      phone: form.phone || undefined, cpf: form.cpf || undefined,
      birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined,
      gender: form.gender !== "none" ? form.gender : undefined,
      addressCity: form.addressCity || undefined,
      addressState: form.addressState || undefined, instagram: form.instagram || undefined,
      observations: form.observations || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      dreamDestinations: form.dreamDestinations ? form.dreamDestinations.split(",").map(t => t.trim()).filter(Boolean) : [],
      origin: form.origin || undefined,
    };

    let savedId: string | undefined;
    if (isEditing && editClient) {
      await updateClient.mutateAsync({
        id: editClient.id,
        data: {
          ...base,
          pipelineStage: form.pipelineStage !== "none" ? form.pipelineStage : undefined,
          classification: form.classification || undefined,
          npsScore: form.npsScore ? parseFloat(form.npsScore) : undefined,
          status: form.status || undefined,
        },
      });
      savedId = editClient.id;
    } else {
      const result = await createClient.mutateAsync({ data: base });
      savedId = result.id;
    }
    onSave(withReservation, savedId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar: ${editClient?.name}` : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="personal">Dados</TabsTrigger>
            <TabsTrigger value="trip">Viagem</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="observations">Obs.</TabsTrigger>
            <TabsTrigger value="marketing">Mkt</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4 mt-4">
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
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
              <div className="space-y-2">
                <Label>Origem / Canal de Captação</Label>
                <Input placeholder="Indicação, Instagram, Feira..." value={form.origin} onChange={e => set("origin")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input placeholder="@mariaSilva" value={form.instagram} onChange={e => set("instagram")(e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trip" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Estágio no Pipeline</Label>
              <Select value={form.pipelineStage} onValueChange={set("pipelineStage")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {stages?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destinos Sonhados</Label>
              <Input placeholder="Arraial do Cabo, Morro de São Paulo, Fernando de Noronha" value={form.dreamDestinations} onChange={e => set("dreamDestinations")(e.target.value)} />
              <p className="text-xs text-muted-foreground">Separe os destinos com vírgula</p>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input placeholder="vip, família, aventura" value={form.tags} onChange={e => set("tags")(e.target.value)} />
              <p className="text-xs text-muted-foreground">Separe as tags com vírgula</p>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            {isEditing && editClient && (
              <>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Total Gasto</p>
                    <p className="text-lg font-bold">{formatCurrency(editClient.totalSpent)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Saldo Devedor</p>
                    <p className={`text-lg font-bold ${editClient.outstandingBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                      {formatCurrency(editClient.outstandingBalance)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Pontos Fidelidade</p>
                    <p className="text-lg font-bold">0 pts</p>
                  </div>
                </div>
                <ClientPaymentsSection clientId={editClient.id} />
              </>
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
                <div className="flex gap-1 mt-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => set("npsScore")(String(i + 1))}
                      className={`flex-1 h-7 rounded text-xs font-bold transition-all ${
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
              <Textarea placeholder="Anotações sobre o cliente..." rows={6} value={form.observations} onChange={e => set("observations")(e.target.value)} />
            </div>
          </TabsContent>

          <TabsContent value="marketing" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Preferências de lifestyle e marketing</p>
            <div className="space-y-2">
              <Label>Destinos Sonhados</Label>
              <Textarea placeholder="Destinos que o cliente mencionou querer visitar..." rows={3} value={form.dreamDestinations} onChange={e => set("dreamDestinations")(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tags de Interesse</Label>
              <Input placeholder="praia, aventura, cultural, gastronomia" value={form.tags} onChange={e => set("tags")(e.target.value)} />
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

interface Client360ModalProps { open: boolean; onClose: () => void; client: Client; }

function Client360Modal({ open, onClose, client }: Client360ModalProps) {
  const { data: reservations } = useListReservations({ clientId: client.id, limit: 20 });
  const { data: payments } = useListPayments({ clientId: client.id, limit: 20 });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-bold">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <DialogTitle className="text-left">{client.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{client.email}</p>
            </div>
            {(() => { const s = STATUS_LABELS[client.status]; return s ? <Badge className={`${s.color} border ml-auto`}>{s.label}</Badge> : null; })()}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Total Gasto</p><p className="text-lg font-bold">{formatCurrency(client.totalSpent)}</p></Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Saldo Devedor</p>
            <p className={`text-lg font-bold ${client.outstandingBalance > 0 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(client.outstandingBalance)}</p>
          </Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">NPS</p><p className="text-lg font-bold">{client.npsScore != null ? `${client.npsScore}/10` : "—"}</p></Card>
        </div>

        <Tabs defaultValue="data">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="data">Dados</TabsTrigger>
            <TabsTrigger value="trips">Viagens</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "WhatsApp", value: client.whatsapp, icon: Phone },
                { label: "E-mail", value: client.email, icon: Mail },
                { label: "Cidade", value: client.addressCity ? `${client.addressCity}/${client.addressState}` : "—", icon: MapPin },
                { label: "Aniversário", value: client.birthDate ? format(parseISO(client.birthDate), "dd/MM/yyyy", { locale: ptBR }) : "—", icon: Calendar },
                { label: "CPF", value: client.cpf ?? "—", icon: null },
                { label: "Instagram", value: client.instagram ?? "—", icon: null },
                { label: "Classificação", value: CLASSIFICATION_LABELS[client.classification] ?? client.classification, icon: null },
                { label: "Pipeline", value: client.pipelineStage ?? "—", icon: null },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2">
                  {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
                </div>
              ))}
            </div>
            {client.tags.length > 0 && (
              <div><p className="text-xs text-muted-foreground mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">{client.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}</div>
              </div>
            )}
            {client.dreamDestinations.length > 0 && (
              <div><p className="text-xs text-muted-foreground mb-1">Destinos Sonhados</p>
                <div className="flex flex-wrap gap-1">{client.dreamDestinations.map(d => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}</div>
              </div>
            )}
            {client.observations && (
              <div><p className="text-xs text-muted-foreground mb-1">Observações</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3">{client.observations}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="trips" className="mt-4">
            {!reservations?.data.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma viagem encontrada.</p>
            ) : (
              <div className="space-y-2">
                {reservations.data.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{r.trip.name}</p>
                      <p className="text-xs text-muted-foreground">{format(parseISO(r.trip.departureDate), "dd/MM/yyyy", { locale: ptBR })} · {r.seats.length} lugar(es)</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(r.totalValue)}</p>
                      <Badge variant={r.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                        {r.status === "confirmed" ? "Confirmada" : r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="financial" className="mt-4">
            {!payments?.data.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum pagamento encontrado.</p>
            ) : (
              <div className="space-y-2">
                {payments.data.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{p.description ?? p.category}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence {format(parseISO(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}
                        {p.paidAt && ` · Pago ${format(parseISO(p.paidAt), "dd/MM/yyyy", { locale: ptBR })}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(p.amount)}</p>
                      <Badge variant={p.status === "paid" ? "default" : p.status === "overdue" ? "destructive" : "secondary"} className="text-xs">
                        {p.status === "paid" ? "Pago" : p.status === "overdue" ? "Vencido" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {(() => {
              type ActivityEvent = {
                id: string;
                date: string;
                type: "reservation" | "payment";
                title: string;
                description: string;
                badge?: string;
                badgeColor?: string;
              };
              const events: ActivityEvent[] = [];
              for (const r of (reservations?.data ?? [])) {
                events.push({
                  id: `res-${r.id}`, date: r.createdAt ?? r.trip?.departureDate,
                  type: "reservation", title: "Reserva criada",
                  description: r.trip?.name ?? `Reserva #${r.id.slice(-6)}`,
                  badge: r.status === "confirmed" ? "Confirmada" : r.status === "cancelled" ? "Cancelada" : "Pendente",
                  badgeColor: r.status === "confirmed" ? "bg-green-100 text-green-700" : r.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700",
                });
              }
              for (const p of (payments?.data ?? [])) {
                events.push({
                  id: `pay-${p.id}`, date: p.paidAt ?? p.createdAt,
                  type: "payment", title: p.status === "paid" ? "Pagamento recebido" : "Lançamento financeiro",
                  description: `${p.description ?? p.category} — ${formatCurrency(p.amount)}`,
                  badge: p.status === "paid" ? "Pago" : p.status === "overdue" ? "Vencido" : "Pendente",
                  badgeColor: p.status === "paid" ? "bg-green-100 text-green-700" : p.status === "overdue" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700",
                });
              }
              events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              if (!events.length) {
                return (
                  <div className="text-center py-10 text-muted-foreground">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma atividade registrada</p>
                    <p className="text-xs mt-1">O histórico aparece automaticamente conforme reservas e pagamentos são criados.</p>
                  </div>
                );
              }
              return (
                <div className="relative space-y-0">
                  {events.map((ev, idx) => (
                    <div key={ev.id} className="flex gap-3 group">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ev.type === "payment" ? "bg-green-100" : "bg-blue-100"}`}>
                          {ev.type === "payment"
                            ? <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                            : <Star className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
                      </div>
                      <div className="pb-4 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{ev.title}</span>
                          {ev.badge && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ev.badgeColor}`}>{ev.badge}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.description}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{format(new Date(ev.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>
              <Button variant="outline" size="sm" disabled><Upload className="w-4 h-4 mr-2" /> Enviar Documento</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

type SortField = "name" | "createdAt" | "totalSpent";
type SortOrder = "asc" | "desc";

interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
}

function SortableHeader({ label, field, currentSort, currentOrder, onSort }: SortableHeaderProps) {
  const isActive = currentSort === field;
  return (
    <button
      className="flex items-center gap-1 text-xs font-semibold hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive ? (
        currentOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

export default function Clients() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterClassification, setFilterClassification] = useState<string>("all");
  const [filterPipelineStage, setFilterPipelineStage] = useState<string>("all");
  const [filterCity, setFilterCity] = useState<string>("");
  const [filterTripId, setFilterTripId] = useState<string>("all");
  const [filterSellerId, setFilterSellerId] = useState<string>("all");
  const [filterOrigin, setFilterOrigin] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const LIMIT = 12;

  const { data: stages } = useListPipelineStages();
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: sellers } = useListUsers();

  const { data: clientsData, isLoading, refetch } = useListClients({
    search: search || undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    pipelineStage: filterPipelineStage !== "all" ? filterPipelineStage : undefined,
    classification: filterClassification !== "all" ? filterClassification : undefined,
    city: filterCity || undefined,
    origin: filterOrigin || undefined,
    tripId: filterTripId !== "all" ? filterTripId : undefined,
    sellerId: filterSellerId !== "all" ? filterSellerId : undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
    page,
    limit: LIMIT,
  });

  const { data: allClients } = useListClients({ limit: 1000, page: 1 });

  const stats = useMemo(() => {
    const all = allClients?.data ?? [];
    return {
      total: allClients?.total ?? 0,
      active: all.filter(c => c.status === "active").length,
      leads: all.filter(c => c.classification === "lead" || c.status === "lead").length,
      totalRevenue: all.reduce((acc, c) => acc + c.totalSpent, 0),
    };
  }, [allClients]);

  const handleSort = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  }, [sortBy]);

  const hasFilters = !!(search || filterStatus !== "all" || filterClassification !== "all" || filterPipelineStage !== "all" || filterCity || filterOrigin || filterTripId !== "all" || filterSellerId !== "all" || filterDateFrom || filterDateTo);

  const clearFilters = () => {
    setSearch(""); setFilterStatus("all"); setFilterClassification("all");
    setFilterPipelineStage("all"); setFilterCity(""); setFilterOrigin(""); setFilterTripId("all");
    setFilterSellerId("all"); setFilterDateFrom(""); setFilterDateTo("");
    setPage(1);
  };

  const totalPages = Math.ceil((clientsData?.total ?? 0) / LIMIT);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">Gerencie sua carteira de clientes.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled title="Em breve">
            <Upload className="w-4 h-4 mr-1" /> Importar CSV
          </Button>
          <Button variant="outline" size="sm" disabled title="Em breve">
            <Download className="w-4 h-4 mr-1" /> Exportar
          </Button>
          <Button size="sm" onClick={() => { setEditClient(null); setIsCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Novo Cliente
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-4">
        {[
          { icon: Users, color: "bg-blue-100 text-blue-600", label: "Total", value: stats.total },
          { icon: UserCheck, color: "bg-green-100 text-green-600", label: "Ativos", value: stats.active },
          { icon: TrendingUp, color: "bg-purple-100 text-purple-600", label: "Leads", value: stats.leads },
          { icon: TrendingUp, color: "bg-yellow-100 text-yellow-600", label: "Receita Total", value: formatCurrency(stats.totalRevenue) },
        ].map(({ icon: Icon, color, label, value }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, email, WhatsApp..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([v, { label }]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClassification} onValueChange={v => { setFilterClassification(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPipelineStage} onValueChange={v => { setFilterPipelineStage(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Pipeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estágios</SelectItem>
                {stages?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Filtrar por cidade..." value={filterCity} onChange={e => { setFilterCity(e.target.value); setPage(1); }} className="w-36" />
            <Input placeholder="Filtrar por origem..." value={filterOrigin} onChange={e => { setFilterOrigin(e.target.value); setPage(1); }} className="w-36" />
            <Select value={filterTripId} onValueChange={v => { setFilterTripId(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Viagem de interesse" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as viagens</SelectItem>
                {tripsData?.data.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSellerId} onValueChange={v => { setFilterSellerId(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Vendedor / Captador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {(sellers ?? []).filter(u => u.role === "vendedor" || u.role === "agencia").map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">De:</Label>
              <Input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="w-36" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Até:</Label>
              <Input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="w-36" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortableHeader label="Cliente" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} /></TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Localidade</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Última Viagem</TableHead>
                <TableHead>Classificação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><SortableHeader label="Gasto Total" field="totalSpent" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} /></TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 10 }).map((__, j) => <TableCell key={j}><Skeleton className="h-8 w-full" /></TableCell>)}</TableRow>
                ))
              ) : (clientsData?.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {hasFilters ? "Nenhum cliente encontrado com os filtros aplicados." : "Nenhum cliente cadastrado."}
                  </TableCell>
                </TableRow>
              ) : (
                (clientsData?.data ?? []).map(client => {
                  const status = STATUS_LABELS[client.status];
                  return (
                    <TableRow key={client.id} className="hover:bg-muted/30">
                      <TableCell>
                        <button className="flex items-center gap-3 text-left" onClick={() => setViewClient(client)}>
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate max-w-[160px]">{client.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{client.email}</p>
                          </div>
                        </button>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{client.whatsapp}</p>
                        {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                      </TableCell>
                      <TableCell>
                        {client.addressCity ? (
                          <div className="flex items-center gap-1 text-sm"><MapPin className="w-3 h-3 text-muted-foreground" />{client.addressCity}{client.addressState ? `/${client.addressState}` : ""}</div>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        {client.origin ? (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 truncate max-w-[100px] inline-block">{client.origin}</span>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        {client.lastTripName ? (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px] inline-block">{client.lastTripName}</span>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{CLASSIFICATION_LABELS[client.classification] ?? client.classification}</Badge>
                      </TableCell>
                      <TableCell>
                        {status ? <Badge className={`${status.color} border text-xs`}>{status.label}</Badge> : <Badge variant="secondary" className="text-xs">{client.status}</Badge>}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{formatCurrency(client.totalSpent)}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${client.outstandingBalance > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {formatCurrency(client.outstandingBalance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewClient(client)}>Ver detalhes 360°</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEditClient(client); setIsCreateOpen(true); }}>Editar dados</DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, clientsData?.total ?? 0)} de {clientsData?.total ?? 0} clientes
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      <ClientModal
        open={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setEditClient(null); }}
        editClient={editClient}
        onSave={(withReservation, savedClientId) => {
          refetch();
          if (withReservation && savedClientId) {
            navigate(`/reservations?clientId=${savedClientId}&new=true`);
          }
        }}
      />
      {viewClient && <Client360Modal open={!!viewClient} onClose={() => setViewClient(null)} client={viewClient} />}
    </div>
  );
}
