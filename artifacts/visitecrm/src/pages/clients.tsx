import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListClients, useCreateClient, useUpdateClient,
  useListPipelineStages, useListTrips, useListUsers,
  useCreateDeal, useListPayments, useCreateReservation,
} from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Client360Modal } from "@/components/client360-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Users, TrendingUp, UserCheck, MoreHorizontal,
  MapPin, Download, Upload, ChevronLeft, ChevronRight,
  X, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { SeatMapPicker } from "@/components/SeatMapPicker";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cleanCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function maskCPF(value: string): string {
  const digits = cleanCPF(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCPF(cpf: string): boolean {
  const c = cleanCPF(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;
  let sum = 0;
  for (let i = 1; i <= 9; i++) sum += parseInt(c[i - 1]) * (11 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(c[i - 1]) * (12 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(c[10]);
}

function downloadCsv(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportClientsCsv(clients: Client[]) {
  const headers = ["Nome", "E-mail", "WhatsApp", "Telefone", "CPF", "Nascimento", "Gênero", "Cidade", "Estado", "Instagram", "Classificação", "Status", "Pipeline", "Total Gasto", "Saldo Devedor", "Tags", "Destinos Sonhados", "Observações", "Cadastrado em"];
  const rows = clients.map(c => [
    c.name, c.email, c.whatsapp, c.phone ?? "", c.cpf ?? "",
    c.birthDate ? format(parseISO(c.birthDate), "dd/MM/yyyy") : "",
    c.gender ?? "", c.addressCity ?? "", c.addressState ?? "", c.instagram ?? "",
    c.classification ?? "", c.status ?? "", c.pipelineStage ?? "",
    String(c.totalSpent), String(c.outstandingBalance),
    (c.tags ?? []).join("; "), (c.dreamDestinations ?? []).join("; "),
    c.observations ?? "",
    format(parseISO(c.createdAt), "dd/MM/yyyy"),
  ]);
  downloadCsv([headers, ...rows], `clientes_${format(new Date(), "yyyyMMdd")}.csv`);
}


interface CsvImportModalProps { open: boolean; onClose: () => void; onImported: () => void; }

function CsvImportModal({ open, onClose, onImported }: CsvImportModalProps) {
  const { toast } = useToast();
  const createClient = useCreateClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const CSV_COLUMNS = ["nome", "email", "whatsapp", "telefone", "cpf", "cidade", "estado", "instagram", "observacoes"];

  function parseCsv(text: string): string[][] {
    return text.split("\n").filter(l => l.trim()).map(line => {
      const cells: string[] = [];
      let inside = false, cell = "";
      for (const ch of line) {
        if (ch === '"') { inside = !inside; }
        else if (ch === "," && !inside) { cells.push(cell.trim()); cell = ""; }
        else { cell += ch; }
      }
      cells.push(cell.trim());
      return cells;
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(reader.result as string);
      if (rows.length < 2) { toast({ title: "CSV inválido", variant: "destructive" }); return; }
      setHeaders(rows[0]);
      setPreview(rows.slice(1, 6));
      setErrors([]);
    };
    reader.readAsText(file, "UTF-8");
  }

  function colIdx(h: string) { return headers.findIndex(x => x.toLowerCase().includes(h)); }

  async function handleImport() {
    if (!inputRef.current?.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseCsv(reader.result as string).slice(1).filter(r => r.some(c => c.trim()));
      setImporting(true); setProgress(0); setErrors([]);
      const errs: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const get = (h: string) => { const idx = colIdx(h); return idx >= 0 ? (r[idx] ?? "").trim() : ""; };
        const name = get("nome"); const email = get("email"); const whatsapp = get("whatsapp") || get("celular") || get("tel");
        const rawCpf = get("cpf");
        const cpfDigits = cleanCPF(rawCpf);
        if (!name || !email || !whatsapp) { errs.push(`Linha ${i + 2}: nome, e-mail e WhatsApp são obrigatórios`); setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        if (!cpfDigits || !isValidCPF(cpfDigits)) { errs.push(`Linha ${i + 2}: ${name} — CPF inválido ou ausente`); setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
        try {
          await createClient.mutateAsync({ data: { name, email, whatsapp, phone: get("telefone") || undefined, cpf: cpfDigits, addressCity: get("cidade") || undefined, addressState: get("estado") || undefined, observations: get("observacoes") || undefined } });
        } catch { errs.push(`Linha ${i + 2}: ${name} — erro ao criar`); }
        setProgress(Math.round(((i + 1) / rows.length) * 100));
      }
      setImporting(false); setErrors(errs);
      if (errs.length === 0) { toast({ title: `${rows.length} clientes importados com sucesso!` }); onImported(); onClose(); }
      else { toast({ title: `Importação concluída com ${errs.length} erro(s)`, variant: "destructive" }); onImported(); }
    };
    reader.readAsText(inputRef.current.files[0], "UTF-8");
  }

  function handleClose() { if (!importing) { setPreview([]); setHeaders([]); setErrors([]); setProgress(0); onClose(); } }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Clientes via CSV</DialogTitle>
          <DialogDescription>O arquivo deve ter cabeçalhos: Nome, Email, WhatsApp, CPF (obrigatórios) + Telefone, Cidade, Estado, Instagram, Observacoes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => inputRef.current?.click()}>
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo CSV</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>
          {headers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Pré-visualização (primeiros 5 registros)</p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="text-xs w-full">
                  <thead className="bg-muted"><tr>{headers.slice(0, 6).map(h => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{preview.map((row, i) => <tr key={i} className="border-t">{row.slice(0, 6).map((cell, j) => <td key={j} className="px-2 py-1 truncate max-w-[120px]">{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Colunas detectadas: {headers.join(", ")}</p>
            </div>
          )}
          {importing && (
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
              <p className="text-xs text-muted-foreground text-center">Importando... {progress}%</p>
            </div>
          )}
          {errors.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto border rounded-lg p-2 bg-destructive/10">
              {errors.map((e, i) => <p key={i} className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{e}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
          <Button onClick={handleImport} disabled={importing || preview.length === 0}>
            {importing ? `Importando ${progress}%...` : "Importar Clientes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

const ORIGIN_OPTIONS = ["Indicação", "Instagram", "WhatsApp", "Google", "Cliente Antigo", "Evento", "Outros"];
const MARITAL_OPTIONS = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)"];
const TRAVEL_TYPE_OPTIONS = ["Casal", "Bate-volta", "Excursão", "Trilha", "Corporativo"];
const ROOM_TYPE_OPTIONS = ["Quarto Casal", "Quarto Triplo", "Quarto Quádruplo", "Quarto Compartilhado", "Não se aplica"];
const TRAVEL_REASON_OPTIONS = ["Lazer", "Aniversário", "Família", "Romance", "Negócios"];
const PAYMENT_METHOD_OPTIONS = ["Dinheiro", "PIX", "Cartão Débito", "Cartão Crédito", "Boleto", "Transferência"];
const INTERNAL_RATING_LABELS: Record<number, string> = { 1: "Difícil", 2: "Neutro", 3: "Fácil", 4: "Ótimo", 5: "Excelente" };

interface ClientFormData {
  name: string; email: string; whatsapp: string; phone: string; cpf: string; rg: string;
  birthDate: string; gender: string; addressCity: string; addressState: string;
  instagram: string; pipelineStage: string; classification: string; status: string;
  origin: string; maritalStatus: string;
  tripId: string; boardingPoint: string; seatNumber: string;
  travelType: string; roomType: string; hasInsurance: boolean;
  hasMinorChild: boolean; childInfo: string; travelReason: string;
  ticketPrice: string; quantity: string; paymentMethod: string;
  amountPaid: string; commission: string; consultantId: string;
  internalRating: number; observations: string;
  professionalArea: string; favoriteDrink: string;
  musicalPreferences: string; foodPreferences: string;
  dreamDestinations: string; tags: string;
  npsScore: string; companyFeedback: string;
}

const EMPTY_CLIENT: ClientFormData = {
  name: "", email: "", whatsapp: "", phone: "", cpf: "", rg: "", birthDate: "", gender: "none",
  addressCity: "", addressState: "", instagram: "", pipelineStage: "none",
  classification: "lead", status: "active", origin: "none", maritalStatus: "none",
  tripId: "none", boardingPoint: "none", seatNumber: "", travelType: "none",
  roomType: "none", hasInsurance: false, hasMinorChild: false, childInfo: "", travelReason: "none",
  ticketPrice: "", quantity: "1", paymentMethod: "none", amountPaid: "", commission: "", consultantId: "none",
  internalRating: 0, observations: "",
  professionalArea: "", favoriteDrink: "", musicalPreferences: "", foodPreferences: "",
  dreamDestinations: "", tags: "",
  npsScore: "", companyFeedback: "",
};

function clientToForm(c: Client): ClientFormData {
  return {
    name: c.name, email: c.email, whatsapp: c.whatsapp, phone: c.phone ?? "",
    cpf: c.cpf ?? "", rg: c.rg ?? "", birthDate: c.birthDate ? c.birthDate.split("T")[0] : "",
    gender: c.gender ?? "none", addressCity: c.addressCity ?? "", addressState: c.addressState ?? "",
    instagram: c.instagram ?? "", pipelineStage: c.pipelineStage ?? "none",
    classification: c.classification ?? "lead", status: c.status ?? "active",
    origin: c.origin ?? "none", maritalStatus: c.maritalStatus ?? "none",
    tripId: "none", boardingPoint: "none", seatNumber: "", travelType: "none",
    roomType: "none", hasInsurance: false, hasMinorChild: false, childInfo: "", travelReason: "none",
    ticketPrice: "", quantity: "1", paymentMethod: "none", amountPaid: "", commission: "", consultantId: "none",
    internalRating: c.internalRating ?? 0, observations: c.observations ?? "",
    professionalArea: c.professionalArea ?? "", favoriteDrink: c.favoriteDrink ?? "",
    musicalPreferences: c.musicalPreferences ?? "", foodPreferences: c.foodPreferences ?? "",
    dreamDestinations: (c.dreamDestinations ?? []).join(", "), tags: (c.tags ?? []).join(", "),
    npsScore: c.companyNps != null ? String(c.companyNps) : (c.npsScore != null ? String(c.npsScore) : ""),
    companyFeedback: c.companyFeedback ?? "",
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
  defaultStageId?: string;
}

export function ClientModal({ open, onClose, editClient, onSave, defaultStageId }: ClientModalProps) {
  const [tab, setTab] = useState("personal");
  const [form, setForm] = useState<ClientFormData>(EMPTY_CLIENT);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [hasSeatMap, setHasSeatMap] = useState<boolean | null>(null);
  const { toast } = useToast();
  const { data: stages } = useListPipelineStages();
  const { data: tripsData } = useListTrips({ limit: 100 });
  const { data: usersData } = useListUsers();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createDeal = useCreateDeal();
  const createReservation = useCreateReservation();

  useEffect(() => {
    if (open) {
      setTab("personal");
      const formData = editClient ? clientToForm(editClient) : EMPTY_CLIENT;
      setForm(formData);
      setSelectedSeats(formData.seatNumber ? [formData.seatNumber] : []);
      setHasSeatMap(null);
    }
  }, [open, editClient]);

  const isEditing = !!editClient;
  const isPending = createClient.isPending || updateClient.isPending || createDeal.isPending || createReservation.isPending;
  const set = (key: keyof ClientFormData) => (val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const trips = tripsData?.data ?? [];
  const users = usersData ?? [];
  const selectedTrip = trips.find(t => t.id === form.tripId);
  const boardingPoints = (selectedTrip?.boardingPoints ?? []) as Array<{ id: string; name: string }>;

  useEffect(() => {
    if (form.tripId && form.tripId !== "none" && selectedTrip) {
      setForm(prev => ({ ...prev, ticketPrice: String(selectedTrip.priceAdult) }));
    } else if (!form.tripId || form.tripId === "none") {
      setForm(prev => ({ ...prev, ticketPrice: "" }));
    }
  }, [form.tripId, selectedTrip]);

  const ticketPrice = parseFloat(form.ticketPrice) || 0;
  const quantity = parseInt(form.quantity) || 1;
  const amountPaid = parseFloat(form.amountPaid) || 0;
  const valorTotal = ticketPrice * quantity;
  const faltaPagar = valorTotal - amountPaid;

  const handleSubmit = async () => {
    if (!form.name || !form.whatsapp) {
      toast({ title: "Nome e WhatsApp são obrigatórios", variant: "destructive" });
      return;
    }
    if (!isEditing) {
      if (!form.cpf) {
        toast({ title: "CPF é obrigatório", variant: "destructive" });
        return;
      }
    }
    if (form.cpf && !isValidCPF(form.cpf)) {
      toast({ title: "CPF inválido", description: "Verifique o número e tente novamente.", variant: "destructive" });
      return;
    }
    const base = {
      name: form.name, email: form.email, whatsapp: form.whatsapp,
      phone: form.phone || undefined, cpf: form.cpf ? cleanCPF(form.cpf) : undefined,
      rg: form.rg || undefined,
      birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined,
      gender: form.gender !== "none" ? form.gender : undefined,
      addressCity: form.addressCity || undefined,
      addressState: form.addressState || undefined,
      instagram: form.instagram || undefined,
      origin: form.origin !== "none" ? form.origin : undefined,
      maritalStatus: form.maritalStatus !== "none" ? form.maritalStatus : undefined,
      observations: form.observations || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      dreamDestinations: form.dreamDestinations ? form.dreamDestinations.split(",").map(t => t.trim()).filter(Boolean) : [],
      professionalArea: form.professionalArea || undefined,
      favoriteDrink: form.favoriteDrink || undefined,
      musicalPreferences: form.musicalPreferences || undefined,
      foodPreferences: form.foodPreferences || undefined,
      internalRating: form.internalRating > 0 ? form.internalRating : undefined,
      companyFeedback: form.companyFeedback || undefined,
      companyNps: form.npsScore ? parseInt(form.npsScore) : undefined,
      pipelineStage: form.pipelineStage !== "none" ? form.pipelineStage : undefined,
      classification: form.classification || undefined,
      status: form.status || undefined,
    };

    try {
      let savedId: string | undefined;
      if (isEditing && editClient) {
        await updateClient.mutateAsync({
          id: editClient.id,
          data: { ...base },
        });
        savedId = editClient.id;
      } else {
        const result = await createClient.mutateAsync({ data: { ...base, cpf: cleanCPF(form.cpf) } });
        savedId = result.id;
        if (result.isNew === false) {
          toast({ title: "Cliente já cadastrado", description: "Os dados do cadastro existente foram atualizados com sucesso." });
        }
        if (savedId) {
          const hasTrip = form.tripId !== "none";
          const commission = parseFloat(form.commission) || 0;
          const consultantId = form.consultantId !== "none" ? form.consultantId : null;

          // Create reservation when trip selected and ticket price > 0
          let createdReservationId: string | undefined;
          if (hasTrip && ticketPrice > 0) {
            try {
              const resResult = await createReservation.mutateAsync({
                data: {
                  tripId: form.tripId,
                  clientId: savedId,
                  seats: [],
                  totalValue: valorTotal || ticketPrice,
                  paidValue: amountPaid || undefined,
                  paymentMethod: form.paymentMethod !== "none" ? form.paymentMethod.toLowerCase().replace(/ /g, "_") : undefined,
                  installments: 1,
                  commissionAmount: commission > 0 ? commission : null,
                  sellerId: consultantId,
                  notes: form.observations || undefined,
                },
              });
              createdReservationId = resResult.id;
            } catch {
              // Reservation creation failure should not block client creation
            }
          }

          const leadStage = stages?.find(s => s.name === "Lead");
          const dealStageId = hasTrip
            ? (leadStage?.id ?? defaultStageId)
            : defaultStageId;
          if (dealStageId) {
            const tripName = selectedTrip?.name ?? "Viagem";
            await createDeal.mutateAsync({
              data: {
                stageId: dealStageId,
                ...(hasTrip ? { tripId: form.tripId } : {}),
                title: hasTrip ? `${form.name} — ${tripName}` : `${form.name} — Lead`,
                value: hasTrip ? (valorTotal ?? 0) : 0,
                clientId: savedId,
                leadName: form.name,
                leadWhatsapp: form.whatsapp,
                ...(createdReservationId ? { reservationId: createdReservationId } : {}),
              },
            });
          }
        }
      }
      toast({ title: isEditing ? "Alterações salvas!" : "Cliente criado!" });
      onSave(false, savedId);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (err as { message?: string })?.message
        || "Erro ao salvar cliente";
      toast({ title: msg, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar: ${editClient?.name}` : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-6 text-xs">
            <TabsTrigger value="personal">Pessoal</TabsTrigger>
            <TabsTrigger value="trip">Viagem</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
            <TabsTrigger value="observations">Obs.</TabsTrigger>
            <TabsTrigger value="followup">Follow-up</TabsTrigger>
            <TabsTrigger value="agency">Agência</TabsTrigger>
          </TabsList>

          {/* Aba 1 — Pessoal */}
          <TabsContent value="personal" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Nome Completo *</Label>
                <Input placeholder="Maria Silva" value={form.name} onChange={e => set("name")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp *</Label>
                <Input placeholder="+55 31 99999-9999" value={form.whatsapp} onChange={e => set("whatsapp")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CPF {!isEditing && <span className="text-destructive">*</span>}</Label>
                <Input
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={e => set("cpf")(maskCPF(e.target.value))}
                  className={form.cpf && !isValidCPF(form.cpf) ? "border-destructive" : ""}
                />
                {form.cpf && !isValidCPF(form.cpf) && (
                  <p className="text-xs text-destructive mt-1">CPF inválido</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" placeholder="maria@email.com" value={form.email} onChange={e => set("email")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input placeholder="@mariaSilva" value={form.instagram} onChange={e => set("instagram")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de Aniversário</Label>
                <Input type="date" value={form.birthDate} onChange={e => set("birthDate")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Origem do Cliente</Label>
                <Select value={form.origin} onValueChange={set("origin")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    {ORIGIN_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input placeholder="Belo Horizonte" value={form.addressCity} onChange={e => set("addressCity")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Estado Civil</Label>
                <Select value={form.maritalStatus} onValueChange={set("maritalStatus")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    {MARITAL_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gênero</Label>
                <Select value={form.gender} onValueChange={set("gender")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não informado</SelectItem>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status no Pipeline</Label>
                <Select value={form.pipelineStage} onValueChange={set("pipelineStage")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {stages?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Aba 2 — Viagem */}
          <TabsContent value="trip" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Viagem</Label>
                <Select
                  value={form.tripId}
                  onValueChange={v => {
                    setForm(prev => ({ ...prev, tripId: v, boardingPoint: "none", seatNumber: "" }));
                    setSelectedSeats([]);
                    setHasSeatMap(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar viagem..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {trips.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {format(parseISO(t.departureDate), "dd/MM/yyyy", { locale: ptBR })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedTrip && (
                <div className="col-span-2 rounded-lg border bg-blue-50/60 dark:bg-blue-950/20 p-3 text-sm space-y-2">
                  <p className="font-semibold text-foreground">{selectedTrip.name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Destino</p>
                      <p className="font-medium text-foreground">{selectedTrip.destination}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Data de Partida</p>
                      <p className="font-medium text-foreground">{format(parseISO(selectedTrip.departureDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Preço / Pessoa</p>
                      <p className="font-medium text-foreground">{formatCurrency(selectedTrip.priceAdult)}</p>
                    </div>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Vagas disponíveis: </span>
                    <span className={`font-semibold ${selectedTrip.availableSeats <= 5 ? "text-destructive" : "text-green-600"}`}>
                      {selectedTrip.availableSeats}
                    </span>
                    <span className="text-muted-foreground"> de {selectedTrip.totalCapacity}</span>
                  </div>
                </div>
              )}
              {boardingPoints.length > 0 && (
                <div className="col-span-2 space-y-2">
                  <Label>Local de Embarque</Label>
                  <Select value={form.boardingPoint} onValueChange={set("boardingPoint")}>
                    <SelectTrigger><SelectValue placeholder="Selecionar ponto de embarque..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não especificado</SelectItem>
                      {boardingPoints.map(bp => <SelectItem key={bp.id} value={bp.name}>{bp.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedTrip && form.tripId !== "none" ? (
                <div className="col-span-2 space-y-3">
                  <Label>Selecionar Poltrona</Label>
                  <SeatMapPicker
                    tripId={form.tripId}
                    selectedSeats={selectedSeats}
                    onSeatsChange={seats => {
                      setSelectedSeats(seats);
                      setForm(prev => ({ ...prev, seatNumber: seats[0] ?? "" }));
                    }}
                    maxSeats={1}
                    onHasMap={setHasSeatMap}
                  />
                  {hasSeatMap === false && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Poltrona (manual)</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Informe o número da poltrona..."
                        value={form.seatNumber}
                        onChange={e => set("seatNumber")(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Poltrona</Label>
                  <Input type="number" min="1" placeholder="Ex: 12" value={form.seatNumber} onChange={e => set("seatNumber")(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Tipo de Viagem</Label>
                <Select value={form.travelType} onValueChange={set("travelType")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {TRAVEL_TYPE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pacote / Quarto</Label>
                <Select value={form.roomType} onValueChange={set("roomType")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {ROOM_TYPE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo da Viagem</Label>
                <Select value={form.travelReason} onValueChange={set("travelReason")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {TRAVEL_REASON_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="hasInsurance"
                    checked={form.hasInsurance}
                    onCheckedChange={v => setForm(prev => ({ ...prev, hasInsurance: !!v }))}
                  />
                  <Label htmlFor="hasInsurance" className="cursor-pointer">Possui Seguro de Viagem</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="hasMinorChild"
                    checked={form.hasMinorChild}
                    onCheckedChange={v => setForm(prev => ({ ...prev, hasMinorChild: !!v }))}
                  />
                  <Label htmlFor="hasMinorChild" className="cursor-pointer">Criança menor de 7 anos</Label>
                </div>
                {form.hasMinorChild && (
                  <div className="space-y-2 pl-7">
                    <Label>Nome e CPF da Criança</Label>
                    <Input placeholder="Nome da Criança — 000.000.000-00" value={form.childInfo} onChange={e => set("childInfo")(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Aba 3 — Financeiro */}
          <TabsContent value="financial" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço da Passagem (R$)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.ticketPrice} onChange={e => set("ticketPrice")(e.target.value)} />
                {selectedTrip && (
                  <p className="text-xs text-muted-foreground">
                    Preço base: {formatCurrency(selectedTrip.priceAdult)}/pessoa × {quantity} passageiro(s) = <span className="font-semibold text-foreground">{formatCurrency(selectedTrip.priceAdult * quantity)}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Quantidade de Passageiros</Label>
                <Input type="number" min="1" placeholder="1" value={form.quantity} onChange={e => set("quantity")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={set("paymentMethod")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Já Pago (R$)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.amountPaid} onChange={e => set("amountPaid")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Comissão (R$)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.commission} onChange={e => set("commission")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Consultor / Vendedor</Label>
                <Select value={form.consultantId} onValueChange={set("consultantId")}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não especificado</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(ticketPrice > 0 || amountPaid > 0) && (
              <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Valor Total</p>
                  <p className="text-base font-bold">{formatCurrency(valorTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Valor Pago</p>
                  <p className="text-base font-bold text-green-600">{formatCurrency(amountPaid)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Falta Pagar</p>
                  <p className={`text-base font-bold ${faltaPagar > 0 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(Math.max(0, faltaPagar))}</p>
                </div>
              </div>
            )}
            {isEditing && editClient && (
              <>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Total Gasto</p>
                    <p className="text-base font-bold">{formatCurrency(editClient.totalSpent)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Saldo Devedor</p>
                    <p className={`text-base font-bold ${editClient.outstandingBalance > 0 ? "text-destructive" : "text-green-600"}`}>
                      {formatCurrency(editClient.outstandingBalance)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Pontos Fidelidade</p>
                    <p className="text-base font-bold">0 pts</p>
                  </div>
                </div>
                <ClientPaymentsSection clientId={editClient.id} />
              </>
            )}
          </TabsContent>

          {/* Aba 4 — Observações */}
          <TabsContent value="observations" className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label>Avaliação Interna (0–5)</Label>
              <p className="text-xs text-muted-foreground -mt-2">Como a equipe avalia esse cliente</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setForm(prev => ({ ...prev, internalRating: prev.internalRating === n ? 0 : n }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      form.internalRating >= n
                        ? form.internalRating >= 4 ? "bg-green-500 border-green-500 text-white" : form.internalRating >= 3 ? "bg-yellow-400 border-yellow-400 text-white" : "bg-red-400 border-red-400 text-white"
                        : "bg-muted border-border text-muted-foreground hover:bg-muted-foreground/10"
                    }`}
                  >
                    <div className="text-sm">{n}</div>
                    <div className="text-[10px] leading-tight">{INTERNAL_RATING_LABELS[n]}</div>
                  </button>
                ))}
              </div>
              {form.internalRating > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Avaliação: <span className="font-semibold">{form.internalRating}/5 — {INTERNAL_RATING_LABELS[form.internalRating]}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Anotações livres sobre o cliente..." rows={6} value={form.observations} onChange={e => set("observations")(e.target.value)} />
            </div>
          </TabsContent>

          {/* Aba 5 — Follow-up */}
          <TabsContent value="followup" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Área de Atuação Profissional</Label>
                <Input placeholder="Ex: Saúde, Tecnologia..." value={form.professionalArea} onChange={e => set("professionalArea")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bebida Favorita</Label>
                <Input placeholder="Ex: Vinho, Cerveja artesanal..." value={form.favoriteDrink} onChange={e => set("favoriteDrink")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Preferências Musicais</Label>
                <Input placeholder="Ex: Sertanejo, Rock, MPB..." value={form.musicalPreferences} onChange={e => set("musicalPreferences")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Preferências Gastronômicas</Label>
                <Input placeholder="Ex: Frutos do mar, Vegetariano..." value={form.foodPreferences} onChange={e => set("foodPreferences")(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Destinos Sonhados</Label>
                <Input placeholder="Arraial do Cabo, Morro de São Paulo, Fernando de Noronha" value={form.dreamDestinations} onChange={e => set("dreamDestinations")(e.target.value)} />
                <p className="text-xs text-muted-foreground">Separe os destinos com vírgula</p>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Tags</Label>
                <Input placeholder="vip, família, aventura, praia" value={form.tags} onChange={e => set("tags")(e.target.value)} />
                <p className="text-xs text-muted-foreground">Separe as tags com vírgula</p>
              </div>
            </div>
          </TabsContent>

          {/* Aba 6 — Agência */}
          <TabsContent value="agency" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>NPS — Nota do cliente à agência (0–10)</Label>
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
                value={form.npsScore !== "" ? parseInt(form.npsScore) : 5}
                onChange={e => set("npsScore")(e.target.value)}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 — Detrator</span><span>6 — Neutro</span><span>10 — Promotor</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 11 }).map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => set("npsScore")(String(i))}
                    className={`flex-1 h-7 rounded text-xs font-bold transition-all ${
                      form.npsScore !== "" && i <= parseInt(form.npsScore)
                        ? parseInt(form.npsScore) >= 9 ? "bg-green-500 text-white" : parseInt(form.npsScore) >= 7 ? "bg-yellow-400 text-white" : "bg-red-400 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                    }`}
                  >{i}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Origem do Cliente</Label>
              <Select value={form.origin} onValueChange={set("origin")}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {ORIGIN_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comentário sobre a Agência</Label>
              <Textarea placeholder="O que o cliente disse sobre a experiência com a agência..." rows={5} value={form.companyFeedback} onChange={e => set("companyFeedback")(e.target.value)} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t mt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.whatsapp}>
            {isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Cliente"}
          </Button>
        </div>
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
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [viewClientId, setViewClientId] = useState<string | null>(null);
  const { toast } = useToast();
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
          <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Importar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const clients = allClients?.data ?? [];
            if (clients.length === 0) { toast({ title: "Nenhum cliente para exportar" }); return; }
            exportClientsCsv(clients);
            toast({ title: `${clients.length} clientes exportados!` });
          }}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
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
                        <button className="flex items-center gap-3 text-left" onClick={() => setViewClientId(client.id)}>
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
                            <DropdownMenuItem onClick={() => setViewClientId(client.id)}>Ver detalhes 360°</DropdownMenuItem>
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
      <Client360Modal open={!!viewClientId} onClose={() => setViewClientId(null)} clientId={viewClientId} />
      <CsvImportModal open={isImportOpen} onClose={() => setIsImportOpen(false)} onImported={() => refetch()} />
    </div>
  );
}
